import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { listThreads } from '@/lib/messages';
import { DashboardShell } from '@/components/dashboard/shell';
import { MessagesView } from '@/components/chat/messages-view';

export const metadata = { title: 'Messages' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function StudentMessagesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['student']);
  const sp = await searchParams;
  const peerParam = sp.peer;
  const peer = Array.isArray(peerParam) ? peerParam[0] : peerParam;

  const [badges, threads] = await Promise.all([getNavBadges(user), listThreads(user.id)]);

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Messages"
      description="Conversations with everyone you are connected to. Messages are kept, so you can pick a thread back up weeks later."
    >
      <MessagesView threads={threads} selfId={user.id} initialPeerId={peer ?? null} />
    </DashboardShell>
  );
}
