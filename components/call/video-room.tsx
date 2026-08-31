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
  Volume2,
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

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

type Phase = 'idle' | 'requesting-media' | 'waiting' | 'connecting' | 'connected' | 'ended' | 'error';

type ChatMessage = { id: string; from: string; name: string; text: string; at: number };

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
  const [remoteAudioBlocked, setRemoteAudioBlocked] = React.useState(false);
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = React.useState<string>('');
  const [peerMuted, setPeerMuted] = React.useState(false);

  const send = React.useCallback((payload: SignalPayload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'signal', payload });
  }, []);

  /* ---------------- media + signalling lifecycle ---------------- */

  React.useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function start() {
      setPhase('requesting-media');

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

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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
        el.srcObject = inbound ?? remote;
        // Browsers block autoplay with sound until the page has been
        // interacted with. Detect it and offer a button rather than leaving
        // the user in silence wondering why.
        el.play()
          .then(() => setRemoteAudioBlocked(false))
          .catch(() => setRemoteAudioBlocked(true));
      };

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) send({ kind: 'candidate', from: selfId, candidate: candidate.toJSON() });
      };

      pc.onnegotiationneeded = async () => {
        try {
          makingOfferRef.current = true;
          await pc.setLocalDescription();
          if (pc.localDescription) {
            send({ kind: 'description', from: selfId, description: pc.localDescription.toJSON() });
          }
        } catch (err) {
          console.error('negotiation failed', err);
        } finally {
          makingOfferRef.current = false;
        }
      };

      pc.onconnectionstatechange = () => {
        if (cancelled) return;
        const s = pc.connectionState;
        if (s === 'connected') setPhase('connected');
        else if (s === 'connecting') setPhase('connecting');
        else if (s === 'failed') {
          setPhase('error');
          setErrorText('The peer connection failed. This usually means a firewall is blocking direct media.');
        } else if (s === 'disconnected') {
          setPeerPresent(false);
          setPhase('waiting');
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
        const peerId = others[0] ?? null;
        peerIdRef.current = peerId;
        setPeerPresent(Boolean(peerId));

        if (peerId) {
          // Deterministic roles: the lexicographically smaller id is impolite
          // and drives the initial offer. Both sides derive the same answer.
          politeRef.current = selfId > peerId;
          setPhase((p) => (p === 'connected' ? p : 'connecting'));
          if (!politeRef.current && pc.signalingState === 'stable' && !makingOfferRef.current) {
            pc.onnegotiationneeded?.(new Event('negotiationneeded'));
          }
        } else {
          setPhase((p) => (p === 'error' ? p : 'waiting'));
        }
      });

      await channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ id: selfId, name: selfName });
          if (!cancelled) setPhase((p) => (p === 'requesting-media' ? 'waiting' : p));
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!cancelled) {
            setPhase('error');
            setErrorText('Lost the signalling connection. Check your network and reload.');
          }
        }
      });
    }

    start();

    return () => {
      cancelled = true;
      try {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'signal',
          payload: { kind: 'bye', from: selfId },
        });
      } catch {
        /* channel may already be closed */
      }
      channelRef.current?.unsubscribe();
      pcRef.current?.close();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenTrackRef.current?.stop();
      if (levelRafRef.current !== null) cancelAnimationFrame(levelRafRef.current);
      audioCtxRef.current?.close().catch(() => {});
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
        setMessages(
          history.map((m: any) => ({
            id: m.id,
            from: m.from_id,
            name: m.from_id === selfId ? selfName : peerName,
            text: m.body,
            at: new Date(m.created_at).getTime(),
          }))
        );
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

  /** Autoplay-with-sound needs a gesture in most browsers; this is that gesture. */
  function enableRemoteAudio() {
    const el = remoteVideo.current;
    if (!el) return;
    el.muted = false;
    el.play()
      .then(() => setRemoteAudioBlocked(false))
      .catch(() => toast.error('The browser is still blocking audio playback.'));
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
    if (!sender) return;

    if (sharing) {
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      if (cameraTrackRef.current) await sender.replaceTrack(cameraTrackRef.current);
      if (localVideo.current) localVideo.current.srcObject = localStreamRef.current;
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
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenTrackRef.current?.stop();
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
    <div className="flex min-h-dvh flex-col bg-neutral-950 text-neutral-100">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <p className="truncate text-xs text-neutral-400">
            {formatFullDateTime(scheduledAt)}{' '}
            · {durationMin} min
          </p>
        </div>
        <span
          className={cn(
            'hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex',
            phase === 'connected'
              ? 'bg-emerald-500/15 text-emerald-400'
              : phase === 'error'
                ? 'bg-red-500/15 text-red-400'
                : 'bg-white/10 text-neutral-300'
          )}
        >
          {phase === 'connecting' || phase === 'requesting-media' ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <span className="size-1.5 rounded-full bg-current" />
          )}
          {statusLabel[phase]}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={copyLink}
          className="text-neutral-300 hover:bg-white/10 hover:text-white"
        >
          <Copy className="size-3.5" />
          <span className="hidden sm:inline">Copy link</span>
        </Button>
      </header>

      {/* Stage */}
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 items-center justify-center p-3 sm:p-4">
          {/* Remote */}
          <div className="relative h-full w-full overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-white/10">
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
                  <p className="mt-1 text-xs text-neutral-400">
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
            {peerPresent && (
              <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium backdrop-blur">
                {peerName}
                {peerMuted && <MicOff className="size-3 text-red-400" />}
              </span>
            )}

            {remoteAudioBlocked && peerPresent && (
              <button
                onClick={enableRemoteAudio}
                className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-black shadow-lg"
              >
                <Volume2 className="size-3.5" />
                Click to enable sound
              </button>
            )}
          </div>

          {/* Local picture-in-picture */}
          <div className="absolute bottom-6 right-6 w-32 overflow-hidden rounded-lg bg-neutral-800 ring-1 ring-white/20 sm:w-44 md:w-56">
            <video ref={localVideo} autoPlay playsInline muted className="aspect-video w-full object-cover" />
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                <VideoOff className="size-5 text-neutral-500" />
              </div>
            )}
            <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium">
              You{sharing ? ' · sharing' : ''}
              {micOn ? (
                // Live input level — proof the microphone is actually hearing you.
                <span className="flex h-2.5 items-end gap-px" aria-label={`Microphone level ${Math.round(micLevel * 100)}%`}>
                  {[0.15, 0.4, 0.7].map((threshold, i) => (
                    <span
                      key={i}
                      className={cn(
                        'w-0.5 rounded-sm transition-all',
                        micLevel > threshold ? 'bg-emerald-400' : 'bg-white/25'
                      )}
                      style={{ height: `${4 + i * 3}px` }}
                    />
                  ))}
                </span>
              ) : (
                <MicOff className="size-2.5 text-red-400" />
              )}
            </span>
          </div>
        </div>

        {/* Side panel */}
        {panel && (
          <aside className="flex w-full max-w-xs shrink-0 flex-col border-l border-white/10 bg-neutral-900 md:w-80">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold">{panel === 'chat' ? 'Chat' : 'Participants'}</h2>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => setPanel(null)}
                aria-label="Close panel"
                className="text-neutral-400 hover:bg-white/10 hover:text-white"
              >
                <X className="size-3.5" />
              </Button>
            </div>

            {panel === 'people' ? (
              <ul className="flex-1 space-y-1 overflow-y-auto p-3">
                <li className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                  <InitialsAvatar name={selfName} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{selfName}</span>
                  <span className="text-xs text-neutral-400">You</span>
                </li>
                <li className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                  <InitialsAvatar name={peerName} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{peerName}</span>
                  <span className={cn('text-xs', peerPresent ? 'text-emerald-400' : 'text-neutral-500')}>
                    {peerPresent ? (peerMuted ? 'Muted' : 'In room') : 'Not joined'}
                  </span>
                </li>

                {/* Audio troubleshooting lives with the participants, which is
                    where people look when they cannot be heard. */}
                <li className="mt-4 space-y-3 border-t border-white/10 px-2 pt-4">
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                      Your microphone
                    </span>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width] duration-75',
                          micOn ? 'bg-emerald-400' : 'bg-red-500'
                        )}
                        style={{ width: `${micOn ? Math.max(2, micLevel * 100) : 100}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-neutral-500">
                      {!micOn
                        ? 'Muted — the bar shows nothing is being sent.'
                        : micLevel > 0.05
                          ? 'Picking up sound.'
                          : 'Silent. Speak to check the bar moves.'}
                    </p>
                  </div>

                  {devices.length > 1 && (
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                        Input device
                      </span>
                      <select
                        value={micId}
                        onChange={(e) => switchMic(e.target.value)}
                        className="w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-neutral-100 outline-none focus-visible:border-white/40"
                      >
                        {devices.map((d, i) => (
                          <option key={d.deviceId} value={d.deviceId} className="bg-neutral-900">
                            {d.label || `Microphone ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {remoteAudioBlocked && (
                    <button
                      onClick={enableRemoteAudio}
                      className="w-full rounded-md bg-amber-500 px-2 py-1.5 text-xs font-semibold text-black"
                    >
                      Enable incoming sound
                    </button>
                  )}
                </li>
              </ul>
            ) : (
              <>
                <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-3">
                  {agenda && (
                    <div className="rounded-lg bg-white/5 p-3 text-xs leading-relaxed text-neutral-300">
                      <span className="font-medium text-neutral-100">Agenda: </span>
                      {agenda}
                    </div>
                  )}
                  {messages.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-neutral-500">
                      No messages yet. Anything sent here is saved to your Messages thread.
                    </p>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={cn('flex flex-col', m.from === selfId && 'items-end')}>
                        <span className="mb-1 text-[10px] text-neutral-500">
                          {m.from === selfId ? 'You' : m.name} ·{' '}
                          {formatTime(m.at)}
                        </span>
                        <span
                          className={cn(
                            'max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm',
                            m.from === selfId ? 'bg-primary text-primary-foreground' : 'bg-white/10'
                          )}
                        >
                          {m.text}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={sendChat} className="flex gap-2 border-t border-white/10 p-3">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Message"
                    aria-label="Chat message"
                    className="h-9 border-white/15 bg-white/5 text-sm text-white placeholder:text-neutral-500"
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
      <footer className="flex items-center justify-center gap-2 border-t border-white/10 px-4 py-3">
        <ControlButton active={micOn} onClick={toggleMic} label={micOn ? 'Mute microphone' : 'Unmute microphone'}>
          {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
        </ControlButton>
        <ControlButton active={camOn} onClick={toggleCam} label={camOn ? 'Turn camera off' : 'Turn camera on'}>
          {camOn ? <VideoIcon className="size-4" /> : <VideoOff className="size-4" />}
        </ControlButton>
        <ControlButton
          active={!sharing}
          onClick={toggleShare}
          label={sharing ? 'Stop sharing screen' : 'Share screen'}
          className="hidden sm:inline-flex"
        >
          {sharing ? <MonitorX className="size-4" /> : <MonitorUp className="size-4" />}
        </ControlButton>
        <ControlButton
          active={panel !== 'chat'}
          onClick={() => setPanel((p) => (p === 'chat' ? null : 'chat'))}
          label="Toggle chat"
        >
          <MessageSquare className="size-4" />
        </ControlButton>
        <ControlButton
          active={panel !== 'people'}
          onClick={() => setPanel((p) => (p === 'people' ? null : 'people'))}
          label="Toggle participants"
        >
          <Users className="size-4" />
        </ControlButton>

        <button
          onClick={hangUp}
          aria-label="Leave call"
          className="ml-2 inline-flex h-10 items-center gap-2 rounded-full bg-red-600 px-5 text-sm font-medium text-white transition-colors hover:bg-red-500"
        >
          <PhoneOff className="size-4" />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </footer>
    </div>
  );
}

function ControlButton({
  children,
  active,
  onClick,
  label,
  className,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-10 items-center justify-center rounded-full transition-colors',
        active ? 'bg-white/10 text-neutral-100 hover:bg-white/20' : 'bg-red-600/90 text-white hover:bg-red-500',
        className
      )}
    >
      {children}
    </button>
  );
}
