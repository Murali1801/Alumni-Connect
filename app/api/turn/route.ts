import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';

/**
 * ICE servers for the video rooms.
 *
 * A TURN relay is what lets a call connect when the two browsers cannot reach
 * each other directly. The credential for one is a spending key — anybody
 * holding it can burn the quota — so it is minted here, per request, with a
 * short life, rather than shipped inside the client bundle where every visitor
 * can read it.
 *
 * Cloudflare is the provider because its free allowance is large enough to be
 * a real one. If it is not configured the route still answers, with STUN only:
 * a room that cannot relay is much better than a room that will not load.
 */

export const dynamic = 'force-dynamic';

const STUN: RTCIceServer = {
  urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
};

/** Long enough that no scheduled session can outlive its own credential. */
const CREDENTIAL_TTL_SECONDS = 86_400;

type CloudflareResponse = {
  iceServers?:
    | { urls?: string | string[]; username?: string; credential?: string }
    | Array<{ urls?: string | string[]; username?: string; credential?: string }>;
};

/** Cloudflare has returned both a single object and an array here; accept either. */
function normalise(payload: CloudflareResponse): RTCIceServer[] {
  const raw = payload.iceServers;
  if (!raw) return [];
  const entries = Array.isArray(raw) ? raw : [raw];

  return entries.flatMap((entry) => {
    const urls = typeof entry.urls === 'string' ? [entry.urls] : (entry.urls ?? []);
    if (!urls.length) return [];
    return [
      {
        urls,
        ...(entry.username ? { username: entry.username } : {}),
        ...(entry.credential ? { credential: entry.credential } : {}),
      },
    ];
  });
}

async function cloudflareIceServers(): Promise<RTCIceServer[]> {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return [];

  const res = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    // The body carries Cloudflare's reason; it is worth having in the server
    // log, because "no relay" is otherwise indistinguishable from "no quota".
    const detail = await res.text().catch(() => '');
    throw new Error(`Cloudflare TURN responded ${res.status}: ${detail.slice(0, 300)}`);
  }

  return normalise((await res.json()) as CloudflareResponse);
}

/**
 * The Metered-style static credentials the rooms used before this route
 * existed. Still honoured so a deployment mid-migration keeps working, but it
 * is a fallback: these live in the client bundle and cannot be rotated
 * without a redeploy.
 */
function staticIceServers(): RTCIceServer[] {
  const urls = (process.env.TURN_URL ?? process.env.NEXT_PUBLIC_TURN_URL ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  if (!urls.length) return [];

  return [
    {
      urls,
      username: process.env.TURN_USERNAME ?? process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL ?? process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    },
  ];
}

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  let relayed: RTCIceServer[] = [];
  let error: string | null = null;

  try {
    relayed = await cloudflareIceServers();
  } catch (err) {
    error = err instanceof Error ? err.message : 'Could not reach the TURN provider';
    console.error('[turn]', error);
  }

  if (!relayed.length) relayed = staticIceServers();

  return NextResponse.json(
    {
      iceServers: [STUN, ...relayed],
      // The room shows this: "relay configured" is the single most useful fact
      // when a call will not connect, and it must not require reading a bundle.
      relay: relayed.length > 0,
      error,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
