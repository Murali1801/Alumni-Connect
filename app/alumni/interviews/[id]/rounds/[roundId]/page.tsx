import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getInterview } from '@/lib/interviews';
import { InterviewerRoom } from '@/components/interviews/interviewer-room';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Interview room' };
export const dynamic = 'force-dynamic';

/** Full-screen, like /call: the interviewer's room for one round. */
export default async function InterviewerRoundPage({ params }: { params: Promise<{ id: string; roundId: string }> }) {
  const { id, roundId } = await params;
  const user = await requireUser(['alumni']);
  const hit = await getInterview(id, user);
  if (!hit) notFound();
  if (hit.viewer === 'candidate') redirect(`/student/interviews/${id}/rounds/${roundId}`);
  const round = hit.interview.rounds.find((r) => r.id === roundId);
  if (!round) notFound();
  const back = `/alumni/interviews/${id}`;

  if (round.status === 'cancelled' || round.status === 'completed' || round.status === 'no_show') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <AlertTriangle className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h1 className="font-display text-2xl">This round is {round.status.replace('_', ' ')}</h1>
          <p className="max-w-sm text-sm text-muted-foreground">The report and scorecards are on the interview page.</p>
        </div>
        <Button render={<Link href={back} />}>Back to the interview</Button>
      </div>
    );
  }

  return (
    <InterviewerRoom
      interviewId={id}
      interviewTitle={hit.interview.title}
      selfId={user.id}
      selfName={user.full_name}
      backHref={back}
      candidate={{ id: hit.interview.candidate_id, name: hit.interview.candidate?.full_name ?? 'Candidate' }}
      round={{
        id: round.id,
        title: round.title,
        kind: round.kind,
        status: round.status,
        scheduled_at: round.scheduled_at,
        duration_min: round.duration_min,
        interviewer_id: round.interviewer_id,
        interviewer_name: round.interviewer_name,
        proctored: round.proctored,
        room_id: round.room_id,
        content: round.content,
      }}
    />
  );
}
