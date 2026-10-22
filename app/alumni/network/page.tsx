import { requireUser } from '@/lib/session';
import { NetworkPage } from '@/components/network/network-page';

export const metadata = { title: 'My Network' };
export const dynamic = 'force-dynamic';

export default async function AlumniNetworkPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser(['alumni']);
  const { tab } = await searchParams;
  return <NetworkPage user={user} tab={tab === 'connections' || tab === 'sent' ? tab : 'grow'} />;
}
