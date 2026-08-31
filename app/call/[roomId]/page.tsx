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

  // Anyone signed in who holds the link may reach this page, but only the two
  // scheduled people walk straight in. Everybody else lands in the lobby and
  // waits for the host to approve them — the room id is unguessable, so the
  // link is the first gate and this approval is the second.
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
      hostId={call.host_id}
      hostName={call.host_name}
      guestId={call.guest_id}
      guestName={call.guest_name}
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
