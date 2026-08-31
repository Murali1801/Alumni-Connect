'use client';

import * as React from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

/**
 * The engine behind a video room: media, signalling, the peer mesh, and the
 * lobby that lets somebody holding the link ask to be let in.
 *
 * Every participant holds one RTCPeerConnection per other participant — a full
 * mesh. That is the right shape for the handful of people a mentorship session
 * involves, and it needs no media server. It does not scale: each person
 * uploads their camera once per peer, so past four or five the uplink is the
 * limit, not the code.
 *
 * Admission is coordinated over the room channel, which means it is enforced by
 * the participants' own clients rather than by the server. The room id is an
 * unguessable UUID that only a participant can share, so the practical gate is
 * the link itself; the approval step is there to stop a forwarded link from
 * being a silent back door, not to withstand somebody editing their own
 * JavaScript.
 */

export type Phase =
  | 'idle'
  | 'requesting-media'
  | 'lobby'
  | 'denied'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'error';

export type RemotePeer = {
  id: string;
  name: string;
  stream: MediaStream;
  connection: RTCPeerConnectionState;
  muted: boolean;
  route: string | null;
};

export type Knocker = { id: string; name: string };

export type ChatMessage = { id: string; from: string; name: string; text: string; at: number };

export type Diagnostics = {
  relay: boolean;
  localTypes: string[];
  iceErrors: string[];
  gathering: RTCIceGatheringState | 'unknown';
};

/** What the room itself is doing, before the peer list is taken into account. */
type Status = 'idle' | 'requesting-media' | 'live' | 'ended' | 'denied' | 'error';

type PresenceMeta = { id: string; name: string; state: 'knocking' | 'in' };

type Signal =
  | { kind: 'description'; from: string; to: string; description: RTCSessionDescriptionInit }
  | { kind: 'candidate'; from: string; to: string; candidate: RTCIceCandidateInit }
  | { kind: 'chat'; from: string; name: string; text: string; at: number }
  | { kind: 'admit'; from: string; to: string }
  | { kind: 'deny'; from: string; to: string }
  | { kind: 'roster'; from: string; admitted: string[] }
  | { kind: 'bye'; from: string };

type Peer = {
  id: string;
  name: string;
  pc: RTCPeerConnection;
  stream: MediaStream;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pending: RTCIceCandidateInit[];
  connection: RTCPeerConnectionState;
  muted: boolean;
  route: string | null;
};

const FALLBACK_STUN: RTCIceServer = {
  urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
};

const CANDIDATE_LABELS: Record<string, string> = {
  host: 'direct',
  srflx: 'via STUN',
  prflx: 'peer-reflexive',
  relay: 'via TURN',
};

export const describeTypes = (types: string[]) =>
  types.length ? types.map((t) => CANDIDATE_LABELS[t] ?? t).join(', ') : 'none yet';

type StatsEntry = {
  id: string;
  type: string;
  state?: string;
  candidateType?: string;
  localCandidateId?: string;
  remoteCandidateId?: string;
};

/**
 * Ask the server for ICE servers. The TURN credential is spendable, so it is
 * minted per request rather than compiled into this bundle; STUN alone is the
 * fallback, because a room that cannot relay must still open.
 */
async function resolveIceServers(): Promise<{ servers: RTCIceServer[]; relay: boolean }> {
  try {
    const res = await fetch('/api/turn', { cache: 'no-store' });
    if (res.ok) {
      const body = (await res.json()) as { iceServers?: RTCIceServer[]; relay?: boolean };
      if (Array.isArray(body.iceServers) && body.iceServers.length) {
        return { servers: body.iceServers, relay: Boolean(body.relay) };
      }
    }
  } catch {
    /* offline, or the route is down — STUN still connects most calls */
  }
  return { servers: [FALLBACK_STUN], relay: false };
}

export type CallRoomOptions = {
  roomId: string;
  selfId: string;
  selfName: string;
  hostId: string;
  guestId: string;
};

export function useCallRoom({ roomId, selfId, selfName, hostId, guestId }: CallRoomOptions) {
  const isHost = selfId === hostId;
  const isMember = selfId === hostId || selfId === guestId;
  /** The scheduled counterpart, for the chat thread that outlives the room. */
  const counterpartId = selfId === hostId ? guestId : selfId === guestId ? hostId : null;

  const peersRef = React.useRef(new Map<string, Peer>());
  const channelRef = React.useRef<RealtimeChannel | null>(null);
  const localStreamRef = React.useRef<MediaStream | null>(null);
  const screenTrackRef = React.useRef<MediaStreamTrack | null>(null);
  const cameraTrackRef = React.useRef<MediaStreamTrack | null>(null);
  const iceServersRef = React.useRef<RTCIceServer[]>([FALLBACK_STUN]);
  const admittedRef = React.useRef(new Set<string>([hostId, guestId]));
  const admittedSelfRef = React.useRef(isMember);
  const localTypesRef = React.useRef(new Set<string>());
  const iceErrorsRef = React.useRef<string[]>([]);
  const relayRef = React.useRef(false);
  const sharingRef = React.useRef(false);
  const cancelledRef = React.useRef(false);

  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const levelRafRef = React.useRef<number | null>(null);

  const [status, setStatus] = React.useState<Status>('idle');
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const [peers, setPeers] = React.useState<RemotePeer[]>([]);
  const [knockers, setKnockers] = React.useState<Knocker[]>([]);
  const [admitted, setAdmitted] = React.useState(isMember);
  const [localPreview, setLocalPreview] = React.useState<MediaStream | null>(null);
  const [micOn, setMicOn] = React.useState(true);
  const [camOn, setCamOn] = React.useState(true);
  const [sharing, setSharing] = React.useState(false);
  const [micLevel, setMicLevel] = React.useState(0);
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = React.useState('');
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [diag, setDiag] = React.useState<Diagnostics | null>(null);

  const send = React.useCallback((payload: Signal) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'signal', payload });
  }, []);

  /** Mirror the peer map into render state. */
  const publish = React.useCallback(() => {
    setPeers(
      [...peersRef.current.values()].map((p) => ({
        id: p.id,
        name: p.name,
        stream: p.stream,
        connection: p.connection,
        muted: p.muted,
        route: p.route,
      }))
    );
  }, []);

  /* ------------------------------------------------------------------ */
  /* lifecycle                                                          */
  /* ------------------------------------------------------------------ */

  React.useEffect(() => {
    cancelledRef.current = false;
    const supabase = createClient();
    const peerMap = peersRef.current;

    const isAllowed = (id: string) => admittedRef.current.has(id);

    function dropPeer(id: string) {
      const peer = peerMap.get(id);
      if (!peer) return;
      peer.pc.close();
      peerMap.delete(id);
      publish();
    }

    async function negotiate(peer: Peer) {
      if (cancelledRef.current || peer.pc.signalingState === 'closed') return;
      try {
        peer.makingOffer = true;
        await peer.pc.setLocalDescription();
        if (peer.pc.localDescription) {
          send({
            kind: 'description',
            from: selfId,
            to: peer.id,
            description: peer.pc.localDescription.toJSON(),
          });
        }
      } catch (err) {
        console.error('negotiation failed', err);
      } finally {
        peer.makingOffer = false;
      }
    }

    function ensurePeer(id: string, name: string): Peer {
      const existing = peerMap.get(id);
      if (existing) {
        if (existing.name !== name) {
          existing.name = name;
          publish();
        }
        return existing;
      }

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      const peer: Peer = {
        id,
        name,
        pc,
        stream: new MediaStream(),
        // Deterministic and opposite on the two sides: the larger id yields.
        polite: selfId > id,
        makingOffer: false,
        ignoreOffer: false,
        pending: [],
        connection: 'new',
        muted: false,
        route: null,
      };
      peerMap.set(id, peer);

      const local = localStreamRef.current;
      if (local) local.getTracks().forEach((track) => pc.addTrack(track, local));

      // Somebody joining mid-share must see the screen, not the camera the
      // sender was replaced away from.
      const screen = screenTrackRef.current;
      if (screen) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        void sender?.replaceTrack(screen);
      }

      pc.ontrack = (event) => {
        const inbound = event.streams[0];
        (inbound ? inbound.getTracks() : [event.track]).forEach((t) => {
          if (!peer.stream.getTracks().some((existingTrack) => existingTrack.id === t.id)) {
            peer.stream.addTrack(t);
          }
        });
        if (event.track.kind === 'audio') {
          event.track.onmute = () => {
            peer.muted = true;
            publish();
          };
          event.track.onunmute = () => {
            peer.muted = false;
            publish();
          };
        }
        publish();
      };

      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) return;
        const type = /typ (\w+)/.exec(candidate.candidate)?.[1];
        if (type) localTypesRef.current.add(type);
        send({ kind: 'candidate', from: selfId, to: id, candidate: candidate.toJSON() });
      };

      pc.onicecandidateerror = (event) => {
        const e = event as RTCPeerConnectionIceErrorEvent;
        const line = `${e.errorCode} ${e.errorText || ''} — ${e.url ?? 'unknown'}`.trim();
        if (!iceErrorsRef.current.includes(line)) {
          iceErrorsRef.current = [...iceErrorsRef.current, line].slice(-6);
        }
      };

      pc.onnegotiationneeded = () => {
        void negotiate(peer);
      };

      pc.onconnectionstatechange = () => {
        peer.connection = pc.connectionState;
        if (pc.connectionState === 'failed') pc.restartIce();
        publish();
      };

      publish();
      return peer;
    }

    async function handleSignal(msg: Signal) {
      if (!msg || msg.from === selfId) return;

      if (msg.kind === 'chat') {
        setMessages((prev) => [
          ...prev,
          { id: `${msg.from}-${msg.at}`, from: msg.from, name: msg.name, text: msg.text, at: msg.at },
        ]);
        return;
      }

      // Only the host decides who is in. A roster replays that decision for
      // anybody who joined after the approval happened.
      if (msg.kind === 'roster' && msg.from === hostId) {
        msg.admitted.forEach((id) => admittedRef.current.add(id));
        return;
      }

      if (msg.kind === 'admit' && msg.from === hostId) {
        admittedRef.current.add(msg.to);
        if (msg.to === selfId && !admittedSelfRef.current) {
          admittedSelfRef.current = true;
          setAdmitted(true);
          await channelRef.current?.track({ id: selfId, name: selfName, state: 'in' } satisfies PresenceMeta);
          toast.success('You have been let in.');
        }
        return;
      }

      if (msg.kind === 'deny' && msg.from === hostId && msg.to === selfId) {
        setStatus('denied');
        return;
      }

      if (msg.kind === 'bye') {
        dropPeer(msg.from);
        return;
      }

      if (msg.kind !== 'description' && msg.kind !== 'candidate') return;
      if (msg.to !== selfId) return;
      if (!isAllowed(msg.from)) return;

      const peer = peerMap.get(msg.from);
      if (!peer) return;

      try {
        if (msg.kind === 'description') {
          const collision =
            msg.description.type === 'offer' &&
            (peer.makingOffer || peer.pc.signalingState !== 'stable');

          peer.ignoreOffer = !peer.polite && collision;
          if (peer.ignoreOffer) return;

          await peer.pc.setRemoteDescription(msg.description);

          const buffered = peer.pending;
          peer.pending = [];
          for (const candidate of buffered) {
            try {
              await peer.pc.addIceCandidate(candidate);
            } catch (err) {
              console.warn('discarding stale ICE candidate', err);
            }
          }

          if (msg.description.type === 'offer') {
            await peer.pc.setLocalDescription();
            if (peer.pc.localDescription) {
              send({
                kind: 'description',
                from: selfId,
                to: peer.id,
                description: peer.pc.localDescription.toJSON(),
              });
            }
          }
        } else {
          // Candidates routinely arrive before the description that gives them
          // meaning; holding them beats throwing InvalidStateError.
          if (!peer.pc.remoteDescription) {
            peer.pending.push(msg.candidate);
            return;
          }
          await peer.pc.addIceCandidate(msg.candidate);
        }
      } catch (err) {
        if (!peer.ignoreOffer) console.warn('signal handling failed', err);
      }
    }

    async function start() {
      setStatus('requesting-media');

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (err) {
        if (cancelledRef.current) return;
        const name = (err as { name?: string })?.name;
        setStatus('error');
        setErrorText(
          name === 'NotAllowedError'
            ? 'Camera and microphone access was blocked. Allow it in your browser, then reload this page.'
            : name === 'NotFoundError'
              ? 'No camera or microphone was found on this device.'
              : `Could not start your camera: ${(err as { message?: string })?.message ?? 'unknown error'}`
        );
        return;
      }

      if (cancelledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
      setLocalPreview(stream);

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        setMicOn(audioTrack.enabled);
        try {
          const Ctor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new Ctor();
          audioCtxRef.current = ctx;

          // Constructed without a gesture it starts suspended, which pegs the
          // meter at zero and reads as a dead microphone.
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

          const buf = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) {
              const v = (buf[i] - 128) / 128;
              sum += v * v;
            }
            setMicLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
            levelRafRef.current = requestAnimationFrame(tick);
          };
          tick();
        } catch {
          /* level metering is a nicety; never let it break the call */
        }
      }

      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!cancelledRef.current) {
          setDevices(all.filter((d) => d.kind === 'audioinput'));
          setMicId(audioTrack?.getSettings().deviceId ?? '');
        }
      } catch {
        /* enumeration is permission-dependent */
      }

      const ice = await resolveIceServers();
      if (cancelledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      iceServersRef.current = ice.servers;
      relayRef.current = ice.relay;

      const channel = supabase.channel(`call:${roomId}`, {
        config: { broadcast: { self: false }, presence: { key: selfId } },
      });
      channelRef.current = channel;

      channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
        void handleSignal(payload as Signal);
      });

      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceMeta>();
        const others = Object.values(state)
          .flat()
          .filter((m) => m?.id && m.id !== selfId);

        setKnockers(
          others.filter((m) => m.state === 'knocking').map((m) => ({ id: m.id, name: m.name }))
        );

        // Replaying the roster costs one small message and saves anybody who
        // arrives after an approval from being unable to see that person.
        if (isHost) {
          send({ kind: 'roster', from: selfId, admitted: [...admittedRef.current] });
        }

        if (!admittedSelfRef.current) return;

        const present = others.filter((m) => m.state === 'in' && isAllowed(m.id));
        present.forEach((m) => ensurePeer(m.id, m.name));
        for (const id of [...peerMap.keys()]) {
          if (!present.some((m) => m.id === id)) dropPeer(id);
        }
      });

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            id: selfId,
            name: selfName,
            state: admittedSelfRef.current ? 'in' : 'knocking',
          } satisfies PresenceMeta);
          if (!cancelledRef.current) setStatus('live');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!cancelledRef.current) {
            setStatus('error');
            setErrorText('Lost the signalling connection. Check your network and reload this page.');
          }
        }
      });
    }

    void start();

    return () => {
      cancelledRef.current = true;

      const channel = channelRef.current;
      channelRef.current = null;
      if (channel) {
        Promise.resolve(
          channel.send({ type: 'broadcast', event: 'signal', payload: { kind: 'bye', from: selfId } })
        )
          .catch(() => {})
          .finally(() => void channel.unsubscribe());
      }

      peerMap.forEach((peer) => peer.pc.close());
      peerMap.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      sharingRef.current = false;
      if (levelRafRef.current !== null) cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, [roomId, selfId, selfName, hostId, isHost, publish, send]);

  /* ------------------------------------------------------------------ */
  /* derived phase                                                      */
  /* ------------------------------------------------------------------ */

  const phase: Phase = React.useMemo(() => {
    if (status !== 'live') return status;
    if (!admitted) return 'lobby';
    if (!peers.length) return 'waiting';
    if (peers.some((p) => p.connection === 'connected')) return 'connected';
    return 'connecting';
  }, [status, admitted, peers]);

  /* ------------------------------------------------------------------ */
  /* diagnostics                                                        */
  /* ------------------------------------------------------------------ */

  React.useEffect(() => {
    if (phase === 'ended' || phase === 'idle') return;

    let stopped = false;
    const sample = async () => {
      for (const peer of peersRef.current.values()) {
        try {
          const stats = await peer.pc.getStats();
          const candidates = new Map<string, StatsEntry>();
          stats.forEach((r: StatsEntry) => {
            if (r.type === 'local-candidate' || r.type === 'remote-candidate') candidates.set(r.id, r);
          });
          let route: string | null = null;
          stats.forEach((r: StatsEntry) => {
            if (r.type === 'local-candidate' && r.candidateType) localTypesRef.current.add(r.candidateType);
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
          peer.route = route;
        } catch {
          /* getStats rejects on a closing connection */
        }
      }
      if (stopped) return;
      publish();
      setDiag({
        relay: relayRef.current,
        localTypes: [...localTypesRef.current],
        iceErrors: iceErrorsRef.current,
        gathering: [...peersRef.current.values()][0]?.pc.iceGatheringState ?? 'unknown',
      });
    };

    void sample();
    const id = setInterval(() => void sample(), 2500);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [phase, publish]);

  /* ------------------------------------------------------------------ */
  /* chat history                                                       */
  /* ------------------------------------------------------------------ */

  React.useEffect(() => {
    if (!counterpartId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/messages?peer=${counterpartId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const history = await res.json();
        if (cancelled || !Array.isArray(history)) return;
        const loaded: ChatMessage[] = history.map((m: { id: string; from_id: string; body: string; created_at: string }) => ({
          id: m.id,
          from: m.from_id,
          name: m.from_id === selfId ? selfName : 'Them',
          text: m.body,
          at: new Date(m.created_at).getTime(),
        }));
        setMessages((live) => {
          const known = new Set(loaded.map((m) => m.id));
          return [...loaded, ...live.filter((m) => !known.has(m.id))].sort((a, b) => a.at - b.at);
        });
      } catch {
        /* a chat that will not load must not take the call down with it */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [counterpartId, selfId, selfName]);

  /* ------------------------------------------------------------------ */
  /* actions                                                            */
  /* ------------------------------------------------------------------ */

  const eachSender = React.useCallback((kind: 'audio' | 'video') => {
    return [...peersRef.current.values()]
      .map((p) => p.pc.getSenders().find((s) => s.track?.kind === kind))
      .filter((s): s is RTCRtpSender => Boolean(s));
  }, []);

  const toggleMic = React.useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) {
      toast.error('No microphone is attached to this call. Check your browser permissions and reload.');
      return;
    }
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }, []);

  const toggleCam = React.useCallback(() => {
    const track = cameraTrackRef.current;
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  }, []);

  const switchMic = React.useCallback(
    async (deviceId: string) => {
      const stream = localStreamRef.current;
      if (!stream) return;
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

        await Promise.all(eachSender('audio').map((s) => s.replaceTrack(nextTrack)));

        stream.getAudioTracks().forEach((t) => {
          stream.removeTrack(t);
          t.stop();
        });
        stream.addTrack(nextTrack);
        nextTrack.enabled = micOn;
        setMicId(deviceId);
        toast.success('Microphone switched.');
      } catch (err) {
        toast.error(`Could not switch microphone: ${(err as { message?: string })?.message ?? 'unknown error'}`);
      }
    },
    [eachSender, micOn]
  );

  const stopShare = React.useCallback(async () => {
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
    const camera = cameraTrackRef.current;
    if (camera) await Promise.all(eachSender('video').map((s) => s.replaceTrack(camera)));
    setLocalPreview(localStreamRef.current);
    sharingRef.current = false;
    setSharing(false);
  }, [eachSender]);

  const startShare = React.useCallback(async () => {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0];
      screenTrackRef.current = track;
      // Ending the share from the browser's own bar must restore the camera.
      // This calls stopShare rather than the toggle, so it cannot read a stale
      // "am I sharing" captured at the moment the share began.
      track.onended = () => {
        void stopShare();
      };
      // Anybody already here gets it now; anybody who joins later picks it up
      // in ensurePeer, which checks this same ref.
      await Promise.all(eachSender('video').map((s) => s.replaceTrack(track)));
      setLocalPreview(display);
      sharingRef.current = true;
      setSharing(true);
    } catch {
      /* the user dismissed the picker */
    }
  }, [eachSender, stopShare]);

  const toggleShare = React.useCallback(async () => {
    // The ref, not the state: this is also reached from a media track callback.
    if (sharingRef.current) await stopShare();
    else await startShare();
  }, [startShare, stopShare]);

  const sendChat = React.useCallback(
    async (text: string) => {
      const at = Date.now();
      send({ kind: 'chat', from: selfId, name: selfName, text, at });
      setMessages((prev) => [...prev, { id: `${selfId}-${at}`, from: selfId, name: selfName, text, at }]);

      // Only the two scheduled people have a thread this belongs to; a visitor's
      // lines live for the length of the call.
      if (!counterpartId) return;
      try {
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: counterpartId, body: text }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error ?? 'Message sent in the room but not saved.');
        }
      } catch {
        toast.error('Message sent in the room but not saved.');
      }
    },
    [counterpartId, selfId, selfName, send]
  );

  const admit = React.useCallback(
    async (id: string) => {
      admittedRef.current.add(id);
      send({ kind: 'admit', from: selfId, to: id });
      setKnockers((k) => k.filter((v) => v.id !== id));
    },
    [selfId, send]
  );

  const deny = React.useCallback(
    (id: string) => {
      send({ kind: 'deny', from: selfId, to: id });
      setKnockers((k) => k.filter((v) => v.id !== id));
    },
    [selfId, send]
  );

  const hangUp = React.useCallback(() => {
    send({ kind: 'bye', from: selfId });

    // The component stays mounted on the ended screen, so effect cleanup will
    // not run — everything the call holds open is released here instead.
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) setTimeout(() => void channel.unsubscribe(), 200);

    peersRef.current.forEach((p) => p.pc.close());
    peersRef.current.clear();
    setPeers([]);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
    sharingRef.current = false;
    if (levelRafRef.current !== null) cancelAnimationFrame(levelRafRef.current);
    levelRafRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setStatus('ended');
  }, [selfId, send]);

  return {
    phase,
    errorText,
    peers,
    knockers,
    admitted,
    isHost,
    isMember,
    localPreview,
    micOn,
    camOn,
    sharing,
    micLevel,
    devices,
    micId,
    messages,
    diag,
    toggleMic,
    toggleCam,
    toggleShare,
    switchMic,
    sendChat,
    admit,
    deny,
    hangUp,
  };
}
