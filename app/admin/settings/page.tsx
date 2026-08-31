import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { createAdminClient } from '@/lib/supabase/admin';
import { DashboardShell } from '@/components/dashboard/shell';
import { AccountCard } from '@/components/profile/account-card';
import { MatchingWeightsCard } from '@/components/admin/matching-weights-card';
import { SystemStatusCard } from '@/components/admin/system-status-card';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const user = await requireUser(['admin']);
  const db = createAdminClient();

  const [badges, records, users, companies, requests, opportunities, events] = await Promise.all([
    getNavBadges(user),
    db.from('alumni_records').select('*', { count: 'exact', head: true }),
    db.from('users').select('*', { count: 'exact', head: true }),
    db.from('companies').select('*', { count: 'exact', head: true }),
    db.from('requests').select('*', { count: 'exact', head: true }),
    db.from('opportunities').select('*', { count: 'exact', head: true }),
    db.from('engagement_events').select('*', { count: 'exact', head: true }),
  ]);

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Settings"
      description="Your account, the matching weights the whole network is scored against, and the state of the underlying data."
    >
      <AccountCard user={user} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MatchingWeightsCard />
        <SystemStatusCard
          tables={[
            { name: 'alumni_records', rows: records.count ?? 0, note: 'Institutional source of truth' },
            { name: 'users', rows: users.count ?? 0, note: 'Accounts across all three roles' },
            { name: 'companies', rows: companies.count ?? 0, note: 'Canonicalised employers' },
            { name: 'requests', rows: requests.count ?? 0, note: 'Student to alumnus asks' },
            { name: 'opportunities', rows: opportunities.count ?? 0, note: 'Roles posted by alumni' },
            { name: 'engagement_events', rows: events.count ?? 0, note: 'Behaviour log and video sessions' },
          ]}
        />
      </div>
    </DashboardShell>
  );
}
