import Link from 'next/link';
import { Bell } from 'lucide-react';
import { getNavBadges } from '@/lib/badges';
import { listNotifications, markRead, type NotificationGroup } from '@/lib/notifications';
import { formatRelativeDay, formatTimeAgo } from '@/lib/format';
import type { SessionUser } from '@/lib/session';
import { DashboardShell } from '@/components/dashboard/shell';
import { Card } from '@/components/ui/card';
import { EmptyState, MemberAvatar } from '@/components/patterns';
import { cn } from '@/lib/utils';

const TABS: { key: NotificationGroup; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'posts', label: 'My posts' },
  { key: 'network', label: 'Network' },
  { key: 'requests', label: 'Requests & interviews' },
];

/**
 * The notifications list. Opening it marks everything seen, as LinkedIn does;
 * the unread dots still show for this visit so the member can tell what is new.
 */
export async function NotificationsPage({ user, group }: { user: SessionUser; group: NotificationGroup }) {
  const role = user.role === 'alumni' ? 'alumni' : 'student';
  const items = await listNotifications(user.id, role, { group, limit: 60 });
  const unreadIds = items.filter((n) => !n.read).map((n) => n.id);
  if (unreadIds.length) await markRead(user.id, unreadIds);
  // Badges after marking, so the bell reads the new count.
  const badges = await getNavBadges(user);
  const p = `/${role}`;

  // Group by day: Today, Yesterday, then dates.
  const days: { label: string; items: typeof items }[] = [];
  for (const n of items) {
    const label = formatRelativeDay(n.created_at);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(n);
    else days.push({ label, items: [n] });
  }

  return (
    <DashboardShell user={user} badges={badges} title="Notifications" description="Reactions, comments, mentions, invitations and updates on your requests.">
      <div className="mx-auto max-w-2xl space-y-4">
        <nav className="scrollbar-none flex gap-1.5 overflow-x-auto" aria-label="Filter notifications">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === 'all' ? `${p}/notifications` : `${p}/notifications?show=${t.key}`}
              aria-current={group === t.key ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                group === t.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {items.length === 0 ? (
          <EmptyState icon={Bell} title="You're all caught up" description="When someone reacts, comments, mentions you, or answers a request, it shows up here." />
        ) : (
          days.map((d) => (
            <section key={d.label} aria-label={d.label}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{d.label}</h2>
              <Card className="gap-0 py-0">
                <ul>
                  {d.items.map((n, i) => (
                    <li key={n.id} className={cn(i > 0 && 'border-t border-border')}>
                      <Link
                        href={n.href}
                        className={cn('flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted', !n.read && 'bg-primary/5')}
                      >
                        <MemberAvatar name={n.actor?.full_name ?? 'AlumniBridge'} url={n.actor?.avatar_url} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground">
                            <span className="font-semibold">{n.actor?.full_name ?? 'Someone'}</span> {n.text}
                          </p>
                          {n.excerpt && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.excerpt}</p>}
                          <p className="tnum mt-1 text-[11px] text-muted-foreground">{formatTimeAgo(n.created_at)}</p>
                        </div>
                        {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="New" />}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))
        )}
      </div>
    </DashboardShell>
  );
}
