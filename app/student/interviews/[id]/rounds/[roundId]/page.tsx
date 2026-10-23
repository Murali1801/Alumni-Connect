import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { candidateCanJoin, getInterview, getSubmissions } from '@/lib/interviews';
import { formatFullDateTime } from '@/lib/format';
import { CandidateRoom } from '@/components/interviews/candidate-room';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Interview round' };
export const dynamic = 'force-dynamic';

/** Full-screen, like /call: the candidate's room for one round. */
export default async function CandidateRoundPage({ params }: { params: Promise<{ id: string; roundId: string }> }) {
  const { id, roundId } = await params;
  const user = await requireUser(['student']);
  const hit = await getInterview(id, user);
  if (!hit) notFound();
  if (hit.viewer !== 'candidate') redirect('/student/interviews');
  const round = hit.interview.rounds.find((r) => r.id === roundId);
  if (!round) notFound();
  const back = `/student/interviews/${id}`;

  const [submission] = round.kind === 'video' ? [] : await getSubmissions([round.id]);

  if (!candidateCanJoin(round) || submission?.submitted_at) {
    const reason = submission?.submitted_at
      ? 'You have already submitted this round.'
      : round.status === 'scheduled'
        ? `It opens ten minutes before ${formatFullDateTime(round.scheduled_at)}, or earlier if your interviewer lets you in.`
        : `This round is ${round.status.replace('_', ' ')}.`;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <CalendarClock className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h1 className="font-display text-2xl">{round.title} is not open</h1>
          <p className="max-w-sm text-sm text-muted-foreground">{reason}</p>
        </div>
        <Button render={<Link href={back} />}>Back to the interview</Button>
      </div>
    );
  }

  return (
    <CandidateRoom
      interviewId={id}
      interviewTitle={hit.interview.title}
      selfId={user.id}
      selfName={user.full_name}
      backHref={back}
      round={{
        id: round.id,
        title: round.title,
        kind: round.kind,
        scheduled_at: round.scheduled_at,
        duration_min: round.duration_min,
        interviewer_id: round.interviewer_id,
        interviewer_name: round.interviewer_name,
        proctored: round.proctored,
        room_id: round.room_id,
        started_at: round.started_at,
        content: round.content,
      }}
      initialSubmission={
        submission
          ? { code: submission.code, language: submission.language, answers: submission.answers ?? {}, submitted_at: submission.submitted_at }
          : null
      }
    />
  );
}
