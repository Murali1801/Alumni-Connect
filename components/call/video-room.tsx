'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  MessageSquare,
  Users,
  Send,
  Copy,
  Loader2,
  X,
} from 'lucide-react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InitialsAvatar } from '@/components/patterns';
import { formatFullDateTime, formatTime } from '@/lib/format';

/* ------------------------------------------------------------------ */

/**
 * STUN only helps when at least one side is directly reachable. Mobile data,
 * campus wifi and corporate networks routinely sit behind symmetric NAT, where
 * the only way through is a relay — so a TURN server is picked up from the
 * environment when one is configured. Without it those calls connect the
 * signalling but never the media.
 */
function turnUrls(): string[] {
  // Read as a whole literal: Next inlines NEXT_PUBLIC_* at build time, so this
  // is baked into the bundle. Changing it on the host requires a redeploy —
  // which is why the room reports whether a relay is configured at all.
  const turn = process.env.NEXT_PUBLIC_TURN_URL;
  return turn ? turn.split(',').map((u) => u.trim()).filter(Boolean) : [];
}

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];

  const urls = turnUrls();
  if (urls.length) {
    servers.push({
      urls,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }

  return servers;
}

/**
 * Start remote playback with sound.
 *
 * Autoplay policy blocks a video carrying audio until the page has been
 * interacted with, and a rejected `play()` freezes the picture as well as the
 * sound. So: try with audio; if the browser refuses, fall back to muted
 * playback — always permitted, so the video at least appears — and lift the
 * mute on the very next click or keypress anywhere on the page. Being in a
 * call means pressing buttons, so this resolves itself without ever having to
 * ask the user for a gesture.
 */
async function playRemote(el: HTMLVideoElement) {
  el.muted = false;
  try {
    await el.play();
    return;
  } catch {
    /* blocked while unmuted — fall through to the muted fallback */
  }

  el.muted = true;
  try {
    await el.play();
  } catch {
    /* nothing further is possible until the user interacts */
  }

  const unmute = () => {
    document.removeEventListener('pointerdown', unmute);
    document.removeEventListener('keydown', unmute);
    el.muted = false;
    el.play().catch(() => {});
  };
  document.addEventListener('pointerdown', unmute);
  document.addEventListener('keydown', unmute);
}

type Phase = 'idle' | 'requesting-media' | 'waiting' | 'connecting' | 'connected' | 'ended' | 'error';

type ChatMessage = { id: string; from: string; name: string; text: string; at: number };

/**
 * What the connection is actually doing. "Connecting…" over a blank tile looks
 * the same whether an offer never arrived or ICE cannot find a route between
 * the two networks — and those have completely different fixes. This is read
 * off the live RTCPeerConnection so the difference is visible.
 */
type Diagnostics = {
  signaling: RTCSignalingState;
  connection: RTCPeerConnectionState;
  ice: RTCIceConnectionState;
  gathering: RTCIceGatheringState;
  offerSent: boolean;
  answered: boolean;
  localTypes: string[];
  remoteTypes: string[];
  route: string | null;
  turnConfigured: boolean;
  iceErrors: string[];
};

type StatsEntry = {
  id: string;
  type: string;
  state?: string;
  candidateType?: string;
  localCandidateId?: string;
  remoteCandidateId?: string;
};

const CANDIDATE_LABELS: Record<string, string> = {
  host: 'direct',
  srflx: 'via STUN',
  prflx: 'peer-reflexive',
  relay: 'via TURN',
};

const describeTypes = (types: string[]) =>
  types.length ? types.map((t) => CANDIDATE_LABELS[t] ?? t).join(', ') : 'none yet';

type SignalPayload =
  | { kind: 'description'; from: string; description: RTCSessionDescriptionInit }
  | { kind: 'candidate'; from: string; candidate: RTCIceCandidateInit }
  | { kind: 'chat'; from: string; name: string; text: string; at: number }
  | { kind: 'bye'; from: string };

export type VideoRoomProps = {
  roomId: string;
  title: string;
  selfId: string;
  selfName: string;
  peerId: string;
  peerName: string;
  backHref: string;
  scheduledAt: string;
  durationMin: number;
  agenda?: string | null;
};

export function VideoRoom({
  roomId,
  title,
  selfId,
  selfName,
  peerId,
  peerName,
  backHref,
  scheduledAt,
  durationMin,
  agenda,
}: VideoRoomProps) {
  const localVideo = React.useRef<HTMLVideoElement>(null);
  const remoteVideo = React.useRef<HTMLVideoElement>(null);

  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const channelRef = React.useRef<RealtimeChannel | null>(null);
  const localStreamRef = React.useRef<MediaStream | null>(null);
  const screenTrackRef = React.useRef<MediaStreamTrack | null>(null);
  const cameraTrackRef = React.useRef<MediaStreamTrack | null>(null);

  // Perfect-negotiation bookkeeping.
  const makingOfferRef = React.useRef(false);
  const ignoreOfferRef = React.useRef(false);
  const politeRef = React.useRef(true);
  const peerIdRef = React.useRef<string | null>(null);

  // Negotiation must not start before the channel is subscribed *and* the
  // other side is in the room. Realtime broadcast has no history, so an offer
  // sent into an empty room is simply dropped — and `negotiationneeded` fires
  // exactly once, when the tracks are added, long before anyone can hear it.
  // The need is recorded here and replayed when the peer actually shows up.
  const readyRef = React.useRef(false);
  const negotiationPendingRef = React.useRef(false);
  const iceRestartedRef = React.useRef(false);

  // Screen sharing is toggled from a track callback created before the state
  // update lands, so the flag it reads has to live outside the render.
  const sharingRef = React.useRef(false);

  // A signalling message is a single broadcast with no delivery guarantee. If
  // one is lost the call waits forever, so the watchdog below re-offers — and
  // it needs to reach the negotiate() that lives inside the lifecycle effect.
  const negotiateRef = React.useRef<(() => Promise<void>) | null>(null);

  // Why a STUN or TURN server produced nothing. 401 means the credentials are
  // wrong, 701 means the hostname never resolved — the difference between a
  // typo in the password and a typo in the URL, and otherwise invisible.
  const iceErrorsRef = React.useRef<string[]>([]);
  const answeredRef = React.useRef(false);
  const offerSentRef = React.useRef(false);
  const recoveryAttemptsRef = React.useRef(0);

  // ICE candidates can arrive before the remote description is applied.
  // Applying one then throws InvalidStateError, so they are held here and
  // flushed the moment a remote description exists.
  const pendingCandidatesRef = React.useRef<RTCIceCandidateInit[]>([]);

  // Audio plumbing: an analyser drives the level meter so a user can confirm
  // their microphone is actually picking sound up.
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const levelRafRef = React.useRef<number | null>(null);

  const [phase, setPhase] = React.useState<Phase>('idle');
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const [micOn, setMicOn] = React.useState(true);
  const [camOn, setCamOn] = React.useState(true);
  const [sharing, setSharing] = React.useState(false);
  const [peerPresent, setPeerPresent] = React.useState(false);
  const [panel, setPanel] = React.useState<'chat' | 'people' | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [draft, setDraft] = React.useState('');
  const [elapsed, setElapsed] = React.useState(0);
  const [micLevel, setMicLevel] = React.useState(0);
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = React.useState<string>('');
  const [peerMuted, setPeerMuted] = React.useState(false);
  const [diag, setDiag] = React.useState<Diagnostics | null>(null);
  const [slowConnect, setSlowConnect] = React.useState(false);

  const send = React.useCallback((payload: SignalPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'signal', payload });
  }, []);

  /* ---------------- media + signalling lifecycle ---------------- */

  React.useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function start() {
      setPhase('requesting-media');
      answeredRef.current = false;
      offerSentRef.current = false;
      recoveryAttemptsRef.current = 0;
      iceErrorsRef.current = [];

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (err: any) {
        if (cancelled) return;
        setPhase('error');
        setErrorText(
          err?.name === 'NotAllowedError'
            ? 'Camera and microphone access was blocked. Allow it in your browser, then reload this page.'
            : err?.name === 'NotFoundError'
              ? 'No camera or microphone was found on this device.'
              : `Could not start your camera: ${err?.message ?? 'unknown error'}`
        );
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
      if (localVideo.current) localVideo.current.srcObject = stream;

      // A microphone that is muted at the OS level still produces a track, so
      // measure the actual signal and show it rather than assuming it works.
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        setMicOn(audioTrack.enabled);
        try {
          const ctx = new (window.AudioContext ||
            (window as any).webkitAudioContext)();
          audioCtxRef.current = ctx;

          // A context constructed without a user gesture starts suspended,
          // which pegs the meter at zero and reads as a dead microphone even
          // though the track is fine. Resume it, and again on first input.
          if (ctx.state === 'suspended') {
            void ctx.resume().catch(() => {});
            const resume = () => {
              document.removeEventListener('pointerdown', resume);
              document.removeEventListener('keydown', resume);
              void ctx.resume().catch(() => {});
            };
            document.addEventListener('pointerdown', resume);
            document.addEventListener('keydown', resume);
          }

          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.7;
          ctx.createMediaStreamSource(new MediaStream([audioTrack])).connect(analyser);
          analyserRef.current = analyser;

          const buf = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteTimeDomainData(buf);
            // Root-mean-square around the 128 midpoint gives a stable level.
            let sum = 0;
            for (let i = 0; i < buf.length; i++) {
              const v = (buf[i] - 128) / 128;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / buf.length);
            setMicLevel(Math.min(1, rms * 4));
            levelRafRef.current = requestAnimationFrame(tick);
          };
          tick();
        } catch {
          // Level metering is a nicety; never let it break the call.
        }
      }

      // Offer a device picker when more than one microphone exists.
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setDevices(all.filter((d) => d.kind === 'audioinput'));
          setMicId(audioTrack?.getSettings().deviceId ?? '');
        }
      } catch {
        /* enumeration is permission-dependent; ignore */
      }

      // Cancellation can land during device enumeration. Without this guard a
      // discarded run would still build a second peer connection and take over
      // the refs the live run is using.
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const pc = new RTCPeerConnection({ iceServers: iceServers() });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const remote = new MediaStream();
      if (remoteVideo.current) remoteVideo.current.srcObject = remote;

      pc.ontrack = (event) => {
        const inbound = event.streams[0];
        (inbound ? inbound.getTracks() : [event.track]).forEach((t) => {
          if (!remote.getTracks().some((existing) => existing.id === t.id)) remote.addTrack(t);
        });

        // Reflect the peer muting themselves, so silence is explained.
        if (event.track.kind === 'audio') {
          event.track.onmute = () => setPeerMuted(true);
          event.track.onunmute = () => setPeerMuted(false);
        }

        const el = remoteVideo.current;
        if (!el) return;
        // Always the same aggregate stream: reassigning `srcObject` for every
        // arriving track restarts playback and drops the audio that just
        // landed. Tracks added to a live MediaStream are picked up in place.
        if (el.srcObject !== remote) el.srcObject = remote;
        void playRemote(el);
      };

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) send({ kind: 'candidate', from: selfId, candidate: candidate.toJSON() });
      };

      pc.onicecandidateerror = (event) => {
        const e = event as RTCPeerConnectionIceErrorEvent;
        // Servers are tried repeatedly; only the distinct failures are useful.
        const line = `${e.errorCode} ${e.errorText || ''} — ${e.url ?? 'unknown'}`.trim();
        if (!iceErrorsRef.current.includes(line)) {
          iceErrorsRef.current = [...iceErrorsRef.current, line].slice(-6);
        }
      };

      /**
       * Create and broadcast an offer — but only once somebody is subscribed
       * to hear it. `negotiationneeded` fires as soon as the tracks are added,
       * which is several round trips before the channel is joined and the peer
       * has arrived, so until then the need is only recorded. The presence
       * handler replays it at the first moment an offer can be delivered.
       */
      const negotiate = async () => {
        if (cancelled || pc.signalingState === 'closed') return;
        if (!readyRef.current) {
          negotiationPendingRef.current = true;
          return;
        }
        negotiationPendingRef.current = false;
        try {
          makingOfferRef.current = true;
          await pc.setLocalDescription();
          if (pc.localDescription) {
            offerSentRef.current = true;
            send({ kind: 'description', from: selfId, description: pc.localDescription.toJSON() });
          }
        } catch (err) {
          console.error('negotiation failed', err);
        } finally {
          makingOfferRef.current = false;
        }
      };

      pc.onnegotiationneeded = () => {
        void negotiate();
      };

      negotiateRef.current = negotiate;

      pc.onconnectionstatechange = () => {
        if (cancelled) return;
        const s = pc.connectionState;
        if (s === 'connected') {
          iceRestartedRef.current = false;
          setPhase('connected');
        } else if (s === 'connecting') {
          setPhase('connecting');
        } else if (s === 'failed') {
          // A failure is usually a candidate pair going stale — a network
          // switch, a laptop waking up — rather than a dead route. Gather
          // again before writing the call off. `restartIce()` raises
          // `negotiationneeded`, so the replacement offer goes out on its own.
          if (!iceRestartedRef.current) {
            iceRestartedRef.current = true;
            setPhase('connecting');
            pc.restartIce();
            return;
          }
          setPhase('error');
          setErrorText(
            'The media connection failed. This network is blocking direct peer-to-peer traffic, which needs a TURN relay to get through.'
          );
        } else if (s === 'disconnected') {
          // Transient by definition: ICE reconnects itself most of the time.
          // Say so rather than dropping the peer out of the interface.
          setPhase((p) => (p === 'error' || p === 'ended' ? p : 'connecting'));
        }
      };

      /* --- signalling channel --- */
      const channel = supabase.channel(`call:${roomId}`, {
        config: { broadcast: { self: false }, presence: { key: selfId } },
      });
      channelRef.current = channel;

      channel.on('broadcast', { event: 'signal' }, async ({ payload }) => {
        const msg = payload as SignalPayload;
        if (!msg || msg.from === selfId) return;

        if (msg.kind === 'chat') {
          setMessages((prev) => [
            ...prev,
            { id: `${msg.from}-${msg.at}`, from: msg.from, name: msg.name, text: msg.text, at: msg.at },
          ]);
          setPanel((p) => p ?? 'chat');
          return;
        }

        if (msg.kind === 'bye') {
          setPeerPresent(false);
          setPhase('waiting');
          toast.info(`${peerName} left the room.`);
          return;
        }

        try {
          if (msg.kind === 'description') {
            const offerCollision =
              msg.description.type === 'offer' &&
              (makingOfferRef.current || pc.signalingState !== 'stable');

            ignoreOfferRef.current = !politeRef.current && offerCollision;
            if (ignoreOfferRef.current) return;

            await pc.setRemoteDescription(msg.description);
            answeredRef.current = true;

            // A remote description now exists, so anything buffered while we
            // were waiting can safely be applied.
            const buffered = pendingCandidatesRef.current;
            pendingCandidatesRef.current = [];
            for (const candidate of buffered) {
              try {
                await pc.addIceCandidate(candidate);
              } catch (err) {
                console.warn('discarding stale ICE candidate', err);
              }
            }

            if (msg.description.type === 'offer') {
              await pc.setLocalDescription();
              if (pc.localDescription) {
                send({ kind: 'description', from: selfId, description: pc.localDescription.toJSON() });
              }
            }
          } else if (msg.kind === 'candidate') {
            // Candidates routinely arrive before the description that gives
            // them meaning. Hold them instead of throwing InvalidStateError.
            if (!pc.remoteDescription) {
              pendingCandidatesRef.current.push(msg.candidate);
              return;
            }
            try {
              await pc.addIceCandidate(msg.candidate);
            } catch (err) {
              if (!ignoreOfferRef.current) console.warn('addIceCandidate failed', err);
            }
          }
        } catch (err) {
          console.error('signal handling failed', err);
        }
      });

      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ id: string }>();
        const others = Object.keys(state).filter((k) => k !== selfId);
        const otherId = others[0] ?? null;
        const arrived = Boolean(otherId) && peerIdRef.current !== otherId;
        peerIdRef.current = otherId;
        setPeerPresent(Boolean(otherId));

        if (!otherId) {
          readyRef.current = false;
          setPhase((p) => (p === 'error' || p === 'ended' ? p : 'waiting'));
          return;
        }

        // Deterministic roles: the lexicographically smaller id is impolite
        // and wins an offer collision. Both sides derive the same answer.
        politeRef.current = selfId > otherId;
        readyRef.current = true;
        setPhase((p) => (p === 'connected' ? p : 'connecting'));

        // This is the first instant an offer can actually reach anyone, so it
        // is where the held-back negotiation runs. Both sides offer; the
        // collision is settled by politeness in the description handler.
        if (arrived && !makingOfferRef.current) void negotiate();
      });

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ id: selfId, name: selfName });
          if (!cancelled) setPhase((p) => (p === 'requesting-media' ? 'waiting' : p));
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          readyRef.current = false;
          if (!cancelled) {
            setPhase('error');
            setErrorText('Lost the signalling connection. Check your network and reload this page.');
          }
        }
      });
    }

    start();

    return () => {
      cancelled = true;
      readyRef.current = false;
      negotiationPendingRef.current = false;

      // Let the goodbye reach the socket before the channel is torn down,
      // otherwise the peer waits out a presence timeout to notice.
      const channel = channelRef.current;
      channelRef.current = null;
      if (channel) {
        Promise.resolve(
          channel.send({ type: 'broadcast', event: 'signal', payload: { kind: 'bye', from: selfId } })
        )
          .catch(() => {})
          .finally(() => void channel.unsubscribe());
      }

      pcRef.current?.close();
      pcRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      sharingRef.current = false;
      if (levelRafRef.current !== null) cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      pendingCandidatesRef.current = [];
    };
  }, [roomId, selfId, selfName, peerName, send]);

  /* ---------------- persisted chat history ---------------- */

  // The in-room chat is the same conversation as the Messages page, so the
  // thread is loaded on entry and every line sent here is stored.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/messages?peer=${peerId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const history = await res.json();
        if (cancelled || !Array.isArray(history)) return;
        const loaded: ChatMessage[] = history.map((m: any) => ({
          id: m.id,
          from: m.from_id,
          name: m.from_id === selfId ? selfName : peerName,
          text: m.body,
          at: new Date(m.created_at).getTime(),
        }));
        // Lines sent or received over the room channel while this request was
        // in flight are not in the response — keep them rather than replacing
        // the list wholesale.
        setMessages((live) => {
          const known = new Set(loaded.map((m) => m.id));
          return [...loaded, ...live.filter((m) => !known.has(m.id))].sort((a, b) => a.at - b.at);
        });
      } catch {
        // A chat that will not load must not take the call down with it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [peerId, selfId, selfName, peerName]);

  /* ---------------- call duration ---------------- */

  React.useEffect(() => {
    if (phase !== 'connected') return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  /* ---------------- connection watchdog ---------------- */

  /**
   * Both people are in the room but no media is flowing. Two causes, two cures:
   *
   *   nothing came back at all  → the offer or the answer was lost in transit.
   *                               Broadcast is fire-and-forget, so re-offer.
   *   descriptions were swapped → ICE cannot find a route. Re-gather.
   *
   * Three attempts, eight seconds apart, then it stops and the panel explains
   * what it saw rather than retrying into a wall.
   */
  React.useEffect(() => {
    if (!peerPresent || phase === 'connected' || phase === 'ended' || phase === 'error') return;

    let waited = 0;
    const id = setInterval(() => {
      waited += 1;
      setSlowConnect(waited >= 10);
      if (waited % 8 !== 0) return;

      const pc = pcRef.current;
      if (!pc || pc.connectionState === 'connected' || pc.signalingState === 'closed') return;
      if (recoveryAttemptsRef.current >= 3) return;
      recoveryAttemptsRef.current += 1;

      if (!answeredRef.current) void negotiateRef.current?.();
      else pc.restartIce();
    }, 1000);

    return () => clearInterval(id);
  }, [peerPresent, phase]);

  /* ---------------- live connection readout ---------------- */

  React.useEffect(() => {
    if (phase === 'ended') return;
    // Only worth polling while something is wrong, or while somebody is
    // looking at the participants panel. The readout is rendered from that
    // panel alone, so leaving a stale sample behind costs nothing — reopening
    // the panel re-arms this effect and resamples immediately.
    if (phase === 'connected' && panel !== 'people') return;

    let cancelled = false;
    const sample = async () => {
      const pc = pcRef.current;
      if (!pc || cancelled) return;

      const local = new Set<string>();
      const remote = new Set<string>();
      let route: string | null = null;

      try {
        const stats = await pc.getStats();
        const candidates = new Map<string, StatsEntry>();
        stats.forEach((r: StatsEntry) => {
          if (r.type === 'local-candidate' || r.type === 'remote-candidate') candidates.set(r.id, r);
        });
        stats.forEach((r: StatsEntry) => {
          if (r.type === 'local-candidate' && r.candidateType) local.add(r.candidateType);
          if (r.type === 'remote-candidate' && r.candidateType) remote.add(r.candidateType);
          if (r.type === 'candidate-pair' && r.state === 'succeeded') {
            const l = r.localCandidateId ? candidates.get(r.localCandidateId) : undefined;
            const m = r.remoteCandidateId ? candidates.get(r.remoteCandidateId) : undefined;
            if (l?.candidateType && m?.candidateType) {
              route = `${CANDIDATE_LABELS[l.candidateType] ?? l.candidateType} → ${
                CANDIDATE_LABELS[m.candidateType] ?? m.candidateType
              }`;
            }
          }
        });
      } catch {
        /* getStats can reject on a closing connection */
      }

      if (cancelled) return;
      setDiag({
        signaling: pc.signalingState,
        connection: pc.connectionState,
        ice: pc.iceConnectionState,
        gathering: pc.iceGatheringState,
        offerSent: offerSentRef.current,
        answered: answeredRef.current,
        localTypes: [...local],
        remoteTypes: [...remote],
        route,
        turnConfigured: turnUrls().length > 0,
        iceErrors: iceErrorsRef.current,
      });
    };

    void sample();
    const id = setInterval(() => void sample(), 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase, panel]);

  /* ---------------- controls ---------------- */

  function toggleMic() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) {
      toast.error('No microphone is attached to this call. Check your browser permissions and reload.');
      return;
    }
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }

  /** Switch microphone without renegotiating: replace the sender's track. */
  async function switchMic(deviceId: string) {
    const pc = pcRef.current;
    const stream = localStreamRef.current;
    if (!pc || !stream) return;
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const nextTrack = next.getAudioTracks()[0];
      if (!nextTrack) return;

      const sender = pc.getSenders().find((sd) => sd.track?.kind === 'audio');
      if (sender) await sender.replaceTrack(nextTrack);

      stream.getAudioTracks().forEach((t) => {
        stream.removeTrack(t);
        t.stop();
      });
      stream.addTrack(nextTrack);
      nextTrack.enabled = micOn;
      setMicId(deviceId);
      toast.success('Microphone switched.');
    } catch (err: any) {
      toast.error(`Could not switch microphone: ${err?.message ?? 'unknown error'}`);
    }
  }

  function toggleCam() {
    const track = cameraTrackRef.current;
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  }

  async function toggleShare() {
    const pc = pcRef.current;
    if (!pc) return;
    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (!sender) {
      toast.error('This call has no video track to share over.');
      return;
    }

    // Read the ref, not `sharing`: the track's own `onended` handler is built
    // while the share is starting, so it closes over `sharing === false` for
    // good and would re-open the picker instead of restoring the camera.
    if (sharingRef.current) {
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      if (cameraTrackRef.current) await sender.replaceTrack(cameraTrackRef.current);
      if (localVideo.current) localVideo.current.srcObject = localStreamRef.current;
      sharingRef.current = false;
      setSharing(false);
      return;
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0];
      screenTrackRef.current = track;
      // Ending the share from the browser's own bar must restore the camera.
      track.onended = () => {
        void toggleShare();
      };
      await sender.replaceTrack(track);
      if (localVideo.current) localVideo.current.srcObject = display;
      sharingRef.current = true;
      setSharing(true);
    } catch {
      // The user dismissed the picker — nothing to report.
    }
  }

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;

    const at = Date.now();
    // Deliver instantly over the call channel, then persist so the line is
    // still there on the Messages page after the room closes.
    send({ kind: 'chat', from: selfId, name: selfName, text, at });
    setMessages((prev) => [...prev, { id: `${selfId}-${at}`, from: selfId, name: selfName, text, at }]);
    setDraft('');

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: peerId, body: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? 'Message sent in the room but not saved.');
      }
    } catch {
      toast.error('Message sent in the room but not saved.');
    }
  }

  function copyLink() {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success('Room link copied — share it with your peer.'))
      .catch(() => toast.error('Could not copy the link.'));
  }

  function hangUp() {
    send({ kind: 'bye', from: selfId });

    // The component stays mounted on the "call ended" screen, so the effect
    // cleanup will not run — everything the call holds open is released here
    // instead: socket, peer connection, camera, microphone, analyser.
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) setTimeout(() => void channel.unsubscribe(), 200);

    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
    sharingRef.current = false;
    if (levelRafRef.current !== null) cancelAnimationFrame(levelRafRef.current);
    levelRafRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    readyRef.current = false;
    setPhase('ended');
  }

  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  const statusLabel: Record<Phase, string> = {
    idle: 'Starting…',
    'requesting-media': 'Requesting camera and microphone…',
    waiting: `Waiting for ${peerName} to join`,
    connecting: 'Connecting…',
    connected: `Connected · ${clock}`,
    ended: 'Call ended',
    error: 'Problem',
  };

  /* ---------------- render ---------------- */

  if (phase === 'ended') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted">
          <PhoneOff className="size-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h1 className="font-display text-2xl">Call ended</h1>
          <p className="text-sm text-muted-foreground">
            {title} · {elapsed > 0 ? `lasted ${clock}` : 'no media was exchanged'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button render={<Link href={backHref} />}>Back to schedule</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Rejoin
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {formatFullDateTime(scheduledAt)}{' '}
            · {durationMin} min
          </p>
        </div>
        <span
          className={cn(
            'hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex',
            phase === 'connected'
              ? 'bg-success/15 text-success'
              : phase === 'error'
                ? 'bg-destructive/15 text-destructive'
                : 'bg-muted text-muted-foreground'
          )}
        >
          {phase === 'connecting' || phase === 'requesting-media' ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <span className="size-1.5 rounded-full bg-current" />
          )}
          {statusLabel[phase]}
        </span>
        <Button size="sm" variant="ghost" onClick={copyLink}>
          <Copy className="size-3.5" />
          <span className="hidden sm:inline">Copy link</span>
        </Button>
      </header>

      {/* Stage */}
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 items-center justify-center p-3 sm:p-4">
          {/* Remote */}
          <div className="relative h-full w-full overflow-hidden rounded-xl bg-muted ring-1 ring-border">
            <video
              ref={remoteVideo}
              autoPlay
              playsInline
              className={cn('h-full w-full object-cover', !peerPresent && 'invisible')}
            />
            {!peerPresent && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                <InitialsAvatar name={peerName} size="xl" />
                <div>
                  <p className="text-sm font-medium">{peerName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {phase === 'error' ? errorText : `Waiting for ${peerName} to join…`}
                  </p>
                </div>
                {phase !== 'error' && (
                  <Button size="sm" variant="secondary" onClick={copyLink}>
                    <Copy className="size-3.5" />
                    Copy invite link
                  </Button>
                )}
              </div>
            )}
            {peerPresent && phase !== 'connected' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <InitialsAvatar name={peerName} size="xl" />
                <div className="space-y-1">
                  <p className="flex items-center justify-center gap-2 text-sm font-medium">
                    <Loader2 className="size-3.5 animate-spin" />
                    {peerName} is in the room — connecting video
                  </p>
                  {slowConnect && (
                    <p className="mx-auto max-w-sm text-xs text-muted-foreground">
                      {!diag?.answered
                        ? 'Waiting for the other side to respond. Retrying automatically.'
                        : diag.turnConfigured
                          ? 'Both sides agreed on the call. No route between the two networks yet — still testing the relay.'
                          : 'Both sides agreed on the call, so the room is working. There is no direct route between these two networks and this deployment has no TURN relay configured, which is the missing piece.'}{' '}
                      Open Participants for the details.
                    </p>
                  )}
                </div>
              </div>
            )}
            {peerPresent && (
              <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur">
                {peerName}
                {peerMuted && <MicOff className="size-3 text-red-300" />}
              </span>
            )}
          </div>

          {/* Local picture-in-picture */}
          <div className="absolute bottom-6 right-6 w-32 overflow-hidden rounded-lg bg-muted ring-1 ring-border sm:w-44 md:w-56">
            <video ref={localVideo} autoPlay playsInline muted className="aspect-video w-full object-cover" />
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted">
                <VideoOff className="size-5 text-muted-foreground" />
              </div>
            )}
            <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
              You{sharing ? ' · sharing' : ''}
              {micOn ? (
                // Live input level — proof the microphone is actually hearing you.
                <span className="flex h-2.5 items-end gap-px" aria-label={`Microphone level ${Math.round(micLevel * 100)}%`}>
                  {[0.15, 0.4, 0.7].map((threshold, i) => (
                    <span
                      key={i}
                      className={cn(
                        'w-0.5 rounded-sm transition-all',
                        micLevel > threshold ? 'bg-success' : 'bg-white/30'
                      )}
                      style={{ height: `${4 + i * 3}px` }}
                    />
                  ))}
                </span>
              ) : (
                <MicOff className="size-2.5 text-red-300" />
              )}
            </span>
          </div>
        </div>

        {/* Side panel */}
        {panel && (
          <aside className="flex w-full max-w-xs shrink-0 flex-col border-l border-border bg-card md:w-80">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">{panel === 'chat' ? 'Chat' : 'Participants'}</h2>
              <Button size="icon-xs" variant="ghost" onClick={() => setPanel(null)} aria-label="Close panel">
                <X className="size-3.5" />
              </Button>
            </div>

            {panel === 'people' ? (
              <ul className="flex-1 space-y-1 overflow-y-auto p-3">
                <li className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                  <InitialsAvatar name={selfName} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{selfName}</span>
                  <span className="text-xs text-muted-foreground">You</span>
                </li>
                <li className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                  <InitialsAvatar name={peerName} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{peerName}</span>
                  <span className={cn('text-xs', peerPresent ? 'text-success' : 'text-muted-foreground')}>
                    {peerPresent ? (peerMuted ? 'Muted' : 'In room') : 'Not joined'}
                  </span>
                </li>

                {/* Audio troubleshooting lives with the participants, which is
                    where people look when they cannot be heard. */}
                <li className="mt-4 space-y-3 border-t border-border px-2 pt-4">
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Your microphone
                    </span>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width] duration-75',
                          micOn ? 'bg-success' : 'bg-destructive'
                        )}
                        style={{ width: `${micOn ? Math.max(2, micLevel * 100) : 100}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {!micOn
                        ? 'Muted — the bar shows nothing is being sent.'
                        : micLevel > 0.05
                          ? 'Picking up sound.'
                          : 'Silent. Speak to check the bar moves.'}
                    </p>
                  </div>

                  {devices.length > 1 && (
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Input device
                      </span>
                      <select
                        value={micId}
                        onChange={(e) => switchMic(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:border-ring"
                      >
                        {devices.map((d, i) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Microphone ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </li>

                {/* What the connection is actually doing. Without this a failed
                    call is indistinguishable from a slow one. */}
                {diag && (
                  <li className="mt-4 space-y-2 border-t border-border px-2 pt-4">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Connection
                    </span>
                    <dl className="space-y-1 text-[11px]">
                      <Row label="State" value={diag.connection} />
                      <Row label="Negotiation" value={diag.signaling} />
                      <Row
                        label="Handshake"
                        value={
                          diag.answered
                            ? 'complete'
                            : diag.offerSent
                              ? 'offer sent, no reply'
                              : 'not started'
                        }
                      />
                      <Row label="Your routes" value={describeTypes(diag.localTypes)} />
                      <Row label="Their routes" value={describeTypes(diag.remoteTypes)} />
                      <Row label="In use" value={diag.route ?? 'none'} />
                      <Row label="Relay" value={diag.turnConfigured ? 'configured' : 'not configured'} />
                      <Row label="Gathering" value={diag.gathering} />
                    </dl>

                    {diag.iceErrors.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Server errors
                        </span>
                        <ul className="space-y-1">
                          {diag.iceErrors.map((e) => (
                            <li key={e} className="break-all font-mono text-[10px] text-muted-foreground">
                              {e}
                            </li>
                          ))}
                        </ul>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          401 or 403 on a <code>turn:</code> URL means the username or credential
                          is wrong. 701 means that hostname never resolved.
                        </p>
                      </div>
                    )}

                    {/* Three different problems that all look like "stuck". */}
                    {diag.connection !== 'connected' && diag.answered && (
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {!diag.turnConfigured
                          ? 'Both sides agreed on the call, but no TURN relay is configured. If either network blocks direct peer-to-peer traffic there is no route to find.'
                          : diag.localTypes.includes('relay')
                            ? 'A relay route was obtained and is still being tested. If this does not clear, the other side may be the one without a route.'
                            : diag.gathering === 'complete'
                              ? 'A relay is configured but produced no route. The TURN URL or credentials are most likely wrong — or the build predates them, since these are baked in at build time and need a redeploy.'
                              : 'Still gathering routes…'}
                      </p>
                    )}
                  </li>
                )}
              </ul>
            ) : (
              <>
                <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-3">
                  {agenda && (
                    <div className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground">Agenda: </span>
                      {agenda}
                    </div>
                  )}
                  {messages.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                      No messages yet. Anything sent here is saved to your Messages thread.
                    </p>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={cn('flex flex-col', m.from === selfId && 'items-end')}>
                        <span className="mb-1 text-[10px] text-muted-foreground">
                          {m.from === selfId ? 'You' : m.name} ·{' '}
                          {formatTime(m.at)}
                        </span>
                        <span
                          className={cn(
                            'max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm',
                            m.from === selfId ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                          )}
                        >
                          {m.text}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={sendChat} className="flex gap-2 border-t border-border p-3">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Message"
                    aria-label="Chat message"
                    className="h-9 text-sm"
                  />
                  <Button type="submit" size="icon" aria-label="Send" disabled={!draft.trim()}>
                    <Send className="size-4" />
                  </Button>
                </form>
              </>
            )}
          </aside>
        )}
      </div>

      {/* Controls */}
      <footer className="flex items-center justify-center gap-2 border-t border-border px-4 py-3">
        <ControlButton
          tone={micOn ? 'idle' : 'off'}
          onClick={toggleMic}
          label={micOn ? 'Mute microphone' : 'Unmute microphone'}
        >
          {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
        </ControlButton>
        <ControlButton
          tone={camOn ? 'idle' : 'off'}
          onClick={toggleCam}
          label={camOn ? 'Turn camera off' : 'Turn camera on'}
        >
          {camOn ? <VideoIcon className="size-4" /> : <VideoOff className="size-4" />}
        </ControlButton>
        <ControlButton
          tone={sharing ? 'on' : 'idle'}
          onClick={toggleShare}
          label={sharing ? 'Stop sharing screen' : 'Share screen'}
          className="hidden sm:inline-flex"
        >
          {sharing ? <MonitorX className="size-4" /> : <MonitorUp className="size-4" />}
        </ControlButton>
        <ControlButton
          tone={panel === 'chat' ? 'on' : 'idle'}
          onClick={() => setPanel((p) => (p === 'chat' ? null : 'chat'))}
          label="Toggle chat"
        >
          <MessageSquare className="size-4" />
        </ControlButton>
        <ControlButton
          tone={panel === 'people' ? 'on' : 'idle'}
          onClick={() => setPanel((p) => (p === 'people' ? null : 'people'))}
          label="Toggle participants"
        >
          <Users className="size-4" />
        </ControlButton>

        <button
          onClick={hangUp}
          aria-label="Leave call"
          className="ml-2 inline-flex h-10 items-center gap-2 rounded-full bg-destructive px-5 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
        >
          <PhoneOff className="size-4" />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </footer>
    </div>
  );
}

/**
 * Three tones, so colour carries meaning rather than just state:
 *   idle — available          (neutral)
 *   on   — engaged right now  (brand blue: sharing, a panel is open)
 *   off  — your input is cut  (red: microphone or camera muted)
 *
 * An open chat panel is not a problem, so it must not be red.
 */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-mono">{value}</dd>
    </div>
  );
}

function ControlButton({
  children,
  tone,
  onClick,
  label,
  className,
}: {
  children: React.ReactNode;
  tone: 'idle' | 'on' | 'off';
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={tone !== 'idle'}
      className={cn(
        'inline-flex size-10 items-center justify-center rounded-full transition-colors',
        tone === 'off' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        tone === 'on' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        tone === 'idle' && 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        className
      )}
    >
      {children}
    </button>
  );
}
