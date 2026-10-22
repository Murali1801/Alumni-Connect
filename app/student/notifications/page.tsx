import { requireUser } from '@/lib/session';
import { NotificationsPage } from '@/components/notifications/notifications-page';

export const metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

export default async function StudentNotificationsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requireUser(['student']);
  const { show } = await searchParams;
  const group = show === 'posts' || show === 'network' || show === 'requests' ? show : 'all';
  return <NotificationsPage user={user} group={group} />;
}
