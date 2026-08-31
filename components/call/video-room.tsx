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
  Check,
  DoorOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InitialsAvatar } from '@/components/patterns';
import { formatFullDateTime, formatTime } from '@/lib/format';
import { describeTypes, useCallRoom, type RemotePeer } from './use-call-room';

/* ------------------------------------------------------------------ */

/**
 * Start remote playback with sound.
 *
 * Autoplay policy blocks a video carrying audio until the page has been
 * interacted with, and a rejected `play()` freezes the picture as well as the
 * sound. Try with audio; if the browser refuses, fall back to muted playback —
 * always permitted — and lift the mute on the next click or keypress anywhere
 * on the page. Being in a call means pressing buttons, so this resolves itself
 * without ever having to ask the user for a gesture.
 */
async function playRemote(el: HTMLVideoElement) {
  el.muted = false;
  try {
    await el.play();
    return;
  } catch {
    /* blocked while unmuted */
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

export type VideoRoomProps = {
  roomId: string;
  title: string;
  selfId: string;
  selfName: string;
  hostId: string;
  hostName: string;
  guestId: string;
  guestName: string;
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
  hostId,
  hostName,
  guestId,
  guestName,
  backHref,
  scheduledAt,
  durationMin,
  agenda,
}: VideoRoomProps) {
  const call = useCallRoom({ roomId, selfId, selfName, hostId, guestId });
  const {
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
  } = call;

  const localVideo = React.useRef<HTMLVideoElement>(null);
  const [panel, setPanel] = React.useState<'chat' | 'people' | null>(null);
  const [draft, setDraft] = React.useState('');
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (localVideo.current) localVideo.current.srcObject = localPreview;
  }, [localPreview]);

  React.useEffect(() => {
    if (phase !== 'connected') return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // A knock is easy to miss behind a video, so it also arrives as a toast.
  const announced = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (!isHost) return;
    for (const k of knockers) {
      if (announced.current.has(k.id)) continue;
      announced.current.add(k.id);
      toast.info(`${k.name} is asking to join`, { description: 'Open Participants to let them in.' });
    }
  }, [knockers, isHost]);

  function copyLink() {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success('Room link copied — whoever opens it will need to be let in.'))
      .catch(() => toast.error('Could not copy the link.'));
  }

  function submitChat(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void call.sendChat(text);
  }

  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  const statusLabel: Record<string, string> = {
    idle: 'Starting…',
    'requesting-media': 'Requesting camera and microphone…',
    lobby: 'Waiting to be let in',
    denied: 'Not admitted',
    waiting: 'Waiting for others to join',
    connecting: 'Connecting…',
    connected: `Connected · ${clock}`,
    ended: 'Call ended',
    error: 'Problem',
  };

  /* ---------------- terminal screens ---------------- */

  if (phase === 'ended') {
    return (
      <Centred
        icon={<PhoneOff className="size-6 text-muted-foreground" />}
        heading="Call ended"
        body={`${title} · ${elapsed > 0 ? `lasted ${clock}` : 'no media was exchanged'}`}
        backHref={backHref}
        rejoin
      />
    );
  }

  if (phase === 'denied') {
    return (
      <Centred
        icon={<X className="size-6 text-muted-foreground" />}
        heading="Not admitted"
        body={`${hostName} did not let you into this session. If that was a mistake, ask them to send the link again.`}
        backHref={backHref}
      />
    );
  }

  /* ---------------- lobby ---------------- */

  if (!admitted) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
        <div className="w-full max-w-sm overflow-hidden rounded-xl bg-muted ring-1 ring-border">
          <video ref={localVideo} autoPlay playsInline muted className="aspect-video w-full object-cover" />
        </div>
        <div className="space-y-2">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            {phase === 'error' ? (
              <VideoOff className="size-5 text-muted-foreground" />
            ) : (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            )}
          </div>
          <h1 className="font-display text-2xl">
            {phase === 'error' ? 'Cannot start your camera' : 'Asking to be let in'}
          </h1>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {phase === 'error'
              ? errorText
              : `${hostName} has been told you are here. You will join as soon as they approve.`}
          </p>
        </div>
        <Button variant="outline" render={<Link href={backHref} />}>
          Leave
        </Button>
      </div>
    );
  }

  /* ---------------- room ---------------- */

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {formatFullDateTime(scheduledAt)} · {durationMin} min
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

      {/* Somebody is at the door. Only the host can answer it. */}
      {isHost && knockers.length > 0 && (
        <div className="space-y-2 border-b border-border bg-muted/60 px-4 py-3">
          {knockers.map((k) => (
            <div key={k.id} className="flex items-center gap-3">
              <DoorOpen className="size-4 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">{k.name}</span> is asking to join
              </p>
              <Button size="sm" variant="outline" onClick={() => call.deny(k.id)}>
                Deny
              </Button>
              <Button size="sm" onClick={() => void call.admit(k.id)}>
                <Check className="size-3.5" />
                Let in
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center p-3 sm:p-4">
          {peers.length === 0 ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl bg-muted text-center ring-1 ring-border">
              <InitialsAvatar name={isHost ? guestName : hostName} size="xl" />
              <div>
                <p className="text-sm font-medium">Nobody else is here yet</p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                  {phase === 'error' ? errorText : 'Share the room link and approve whoever asks to join.'}
                </p>
              </div>
              {phase !== 'error' && (
                <Button size="sm" variant="secondary" onClick={copyLink}>
                  <Copy className="size-3.5" />
                  Copy invite link
                </Button>
              )}
            </div>
          ) : (
            <div
              className={cn(
                'grid h-full w-full auto-rows-fr gap-3',
                peers.length === 1 ? 'grid-cols-1' : peers.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'
              )}
            >
              {peers.map((peer) => (
                <PeerTile key={peer.id} peer={peer} />
              ))}
            </div>
          )}

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
                <span
                  className="flex h-2.5 items-end gap-px"
                  aria-label={`Microphone level ${Math.round(micLevel * 100)}%`}
                >
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

        {panel && (
          <aside className="flex min-h-0 w-full max-w-xs shrink-0 flex-col border-l border-border bg-card md:w-80">
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
                  <span className="text-xs text-muted-foreground">{isMember ? 'You' : 'You · guest'}</span>
                </li>
                {peers.map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                    <InitialsAvatar name={p.name} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                    <span
                      className={cn(
                        'text-xs',
                        p.connection === 'connected' ? 'text-success' : 'text-muted-foreground'
                      )}
                    >
                      {p.connection === 'connected' ? (p.muted ? 'Muted' : 'In room') : p.connection}
                    </span>
                  </li>
                ))}

                {isHost &&
                  knockers.map((k) => (
                    <li key={k.id} className="flex items-center gap-2 rounded-lg px-2 py-2">
                      <InitialsAvatar name={k.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm">{k.name}</span>
                      <Button size="icon-xs" variant="ghost" aria-label="Deny" onClick={() => call.deny(k.id)}>
                        <X className="size-3.5" />
                      </Button>
                      <Button size="icon-xs" aria-label="Let in" onClick={() => void call.admit(k.id)}>
                        <Check className="size-3.5" />
                      </Button>
                    </li>
                  ))}

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
                        onChange={(e) => void call.switchMic(e.target.value)}
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

                {diag && (
                  <li className="mt-4 space-y-2 border-t border-border px-2 pt-4">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Connection
                    </span>
                    <dl className="space-y-1 text-[11px]">
                      <Row label="Relay" value={diag.relay ? 'configured' : 'not configured'} />
                      <Row label="Your routes" value={describeTypes(diag.localTypes)} />
                      <Row label="Gathering" value={diag.gathering} />
                      {peers.map((p) => (
                        <Row key={p.id} label={p.name.split(' ')[0]} value={p.route ?? p.connection} />
                      ))}
                    </dl>

                    {peers.some((p) => p.connection !== 'connected') && (
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {!diag.relay
                          ? 'No TURN relay is configured. If either network blocks direct peer-to-peer traffic there is no route to find.'
                          : diag.localTypes.includes('relay')
                            ? 'A relay route was obtained and is still being tested.'
                            : diag.gathering === 'complete'
                              ? 'A relay is configured but produced no route — the credentials are most likely wrong.'
                              : 'Still gathering routes…'}
                      </p>
                    )}

                    {diag.iceErrors.length > 0 && (
                      <div className="space-y-1 pt-1">
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
                          401 or 403 on a <code>turn:</code> URL means the credential is wrong. 701 means
                          that hostname never resolved.
                        </p>
                      </div>
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
                      No messages yet.{' '}
                      {isMember
                        ? 'Anything sent here is saved to your Messages thread.'
                        : 'Messages here last only as long as the call.'}
                    </p>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={cn('flex flex-col', m.from === selfId && 'items-end')}>
                        <span className="mb-1 text-[10px] text-muted-foreground">
                          {m.from === selfId ? 'You' : m.name} · {formatTime(m.at)}
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
                <form onSubmit={submitChat} className="flex gap-2 border-t border-border p-3">
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

      <footer className="flex items-center justify-center gap-2 border-t border-border px-4 py-3">
        <ControlButton
          tone={micOn ? 'idle' : 'off'}
          onClick={call.toggleMic}
          label={micOn ? 'Mute microphone' : 'Unmute microphone'}
        >
          {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
        </ControlButton>
        <ControlButton
          tone={camOn ? 'idle' : 'off'}
          onClick={call.toggleCam}
          label={camOn ? 'Turn camera off' : 'Turn camera on'}
        >
          {camOn ? <VideoIcon className="size-4" /> : <VideoOff className="size-4" />}
        </ControlButton>
        <ControlButton
          tone={sharing ? 'on' : 'idle'}
          onClick={() => void call.toggleShare()}
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
          {isHost && knockers.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background" />
          )}
        </ControlButton>

        <button
          onClick={call.hangUp}
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

/* ------------------------------------------------------------------ */

function PeerTile({ peer }: { peer: RemotePeer }) {
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== peer.stream) el.srcObject = peer.stream;
    void playRemote(el);
  }, [peer.stream]);

  const live = peer.connection === 'connected';

  return (
    <div className="relative min-h-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border">
      <video ref={ref} autoPlay playsInline className={cn('h-full w-full object-contain', !live && 'invisible')} />
      {!live && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <InitialsAvatar name={peer.name} size="xl" />
          <p className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="size-3.5 animate-spin" />
            {peer.name}
          </p>
          <p className="text-xs text-muted-foreground">Connecting video…</p>
        </div>
      )}
      <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur">
        {peer.name}
        {peer.muted && <MicOff className="size-3 text-red-300" />}
      </span>
    </div>
  );
}

function Centred({
  icon,
  heading,
  body,
  backHref,
  rejoin,
}: {
  icon: React.ReactNode;
  heading: string;
  body: string;
  backHref: string;
  rejoin?: boolean;
}) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">{icon}</div>
      <div className="space-y-1">
        <h1 className="font-display text-2xl">{heading}</h1>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{body}</p>
      </div>
      <div className="flex gap-2">
        <Button render={<Link href={backHref} />}>Back to schedule</Button>
        {rejoin && (
          <Button variant="outline" onClick={() => window.location.reload()}>
            Rejoin
          </Button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-mono">{value}</dd>
    </div>
  );
}

/**
 * Three tones, so colour carries meaning rather than just state:
 *   idle — available          (neutral)
 *   on   — engaged right now  (brand blue: sharing, a panel is open)
 *   off  — your input is cut  (red: microphone or camera muted)
 */
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
        'relative inline-flex size-10 items-center justify-center rounded-full transition-colors',
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
