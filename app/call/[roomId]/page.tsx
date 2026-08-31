import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getCall } from '@/lib/calls';
import { VideoRoom } from '@/components/call/video-room';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const call = await getCall(roomId);
  return { title: call ? call.title : 'Video room' };
}

export default async function CallPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const user = await requireUser();
  const call = await getCall(roomId);
  if (!call) notFound();

  const isHost = call.host_id === user.id;
  const isGuest = call.guest_id === user.id;

  if (!isHost && !isGuest) {
    return (
      <Blocked
        title="You are not in this session"
        body="Video rooms are private to the two people scheduled on them."
        href={`/${user.role}/calls`}
      />
    );
  }

  if (call.status === 'cancelled') {
    return (
      <Blocked
        title="This session was cancelled"
        body="Schedule a new session from your calendar if you still need it."
        href={`/${user.role}/calendar`}
      />
    );
  }

  return (
    <VideoRoom
      roomId={call.room_id}
      title={call.title}
      selfId={user.id}
      selfName={user.full_name}
      peerId={isHost ? call.guest_id : call.host_id}
      peerName={isHost ? call.guest_name : call.host_name}
      backHref={`/${user.role}/calendar`}
      scheduledAt={call.scheduled_at}
      durationMin={call.duration_min}
      agenda={call.agenda}
    />
  );
}

function Blocked({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <AlertTriangle className="size-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h1 className="font-display text-2xl">{title}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      </div>
      <Button render={<Link href={href} />}>Back to schedule</Button>
    </div>
  );
}
