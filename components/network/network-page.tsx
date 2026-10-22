import Link from 'next/link';
import { MessageSquare, UserPlus, Users } from 'lucide-react';
import { getNavBadges } from '@/lib/badges';
import { countConnections, getConnections, getInvitations, peopleYouMayKnow } from '@/lib/network';
import { formatDate, formatNumber } from '@/lib/format';
import type { SessionUser } from '@/lib/session';
import { DashboardShell } from '@/components/dashboard/shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, MemberAvatar } from '@/components/patterns';
import { ConnectButton } from '@/components/network/connect-button';
import { cn } from '@/lib/utils';

type Tab = 'grow' | 'connections' | 'sent';

/**
 * My Network: invitations to answer, people you may know, and everyone you are
 * connected to. `?tab=connections` and `?tab=sent` switch the lower section.
 */
export async function NetworkPage({ user, tab }: { user: SessionUser; tab: Tab }) {
  const prefix = `/${user.role}`;
  const [badges, total, invitations, suggestions, connections] = await Promise.all([
    getNavBadges(user),
    countConnections(user.id),
    getInvitations(user.id),
    tab === 'grow' ? peopleYouMayKnow(user.id, 18) : Promise.resolve([]),
    tab === 'connections' ? getConnections(user.id) : Promise.resolve([]),
  ]);
  const people = `${prefix}/people`;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'grow', label: 'Grow your network' },
    { key: 'connections', label: 'Connections', count: total },
    { key: 'sent', label: 'Sent', count: invitations.sent.length },
  ];

  return (
    <DashboardShell
      user={user}
      badges={badges}
      bare
      title="My Network"
      description="Invitations, people you may know, and everyone you are connected to on AlumniBridge."
    >
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4">
          <Card className="gap-0 py-2">
            <h2 className="px-4 pb-1 pt-2 text-sm font-semibold text-foreground">Manage my network</h2>
            <Link href={`${prefix}/network?tab=connections`} className="flex items-center justify-between px-4 py-2 text-sm transition-colors hover:bg-muted">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Users className="size-4" /> Connections
              </span>
              <span className="tnum font-semibold text-foreground">{formatNumber(total)}</span>
            </Link>
            <Link href={`${prefix}/network?tab=sent`} className="flex items-center justify-between px-4 py-2 text-sm transition-colors hover:bg-muted">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <UserPlus className="size-4" /> Sent invitations
              </span>
              <span className="tnum font-semibold text-foreground">{formatNumber(invitations.sent.length)}</span>
            </Link>
          </Card>
        </aside>

        <div className="min-w-0 space-y-4">
          <Card className="gap-0 py-0">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">
                Invitations{invitations.received.length > 0 && <span className="tnum ml-1.5 text-muted-foreground">({invitations.received.length})</span>}
              </h2>
            </div>
            {invitations.received.length === 0 ? (
              <p className="border-t border-border px-5 py-4 text-sm text-muted-foreground">No pending invitations.</p>
            ) : (
              <ul>
                {invitations.received.map((inv) => (
                  <li key={inv.id} className="flex flex-col gap-3 border-t border-border px-5 py-3 sm:flex-row sm:items-center">
                    <Link href={`${people}/${inv.member.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <MemberAvatar name={inv.member.full_name} url={inv.member.avatar_url} size="lg" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground hover:underline">{inv.member.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground">{inv.member.headline}</p>
                        {inv.message && <p className="mt-1 line-clamp-2 text-xs text-foreground">“{inv.message}”</p>}
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(inv.created_at)}</p>
                      </div>
                    </Link>
                    <ConnectButton userId={inv.member.id} name={inv.member.full_name} initial={{ state: 'pending_in', id: inv.id }} size="sm" />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Network sections">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={t.key === 'grow' ? `${prefix}/network` : `${prefix}/network?tab=${t.key}`}
                className={cn(
                  '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
                aria-current={tab === t.key ? 'page' : undefined}
              >
                {t.label}
                {t.count !== undefined && <span className="tnum ml-1 text-muted-foreground">{formatNumber(t.count)}</span>}
              </Link>
            ))}
          </nav>

          {tab === 'grow' &&
            (suggestions.length === 0 ? (
              <EmptyState icon={Users} title="No suggestions right now" description="As more people from SJCEM join, suggestions show up here." />
            ) : (
              <section aria-label="People you may know">
                <h2 className="mb-3 text-sm font-semibold text-foreground">People you may know from SJCEM</h2>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {suggestions.map((p) => (
                    <li key={p.id}>
                      <Card className="h-full gap-0 overflow-hidden py-0">
                        <div className="h-12 bg-muted" />
                        <div className="flex h-full flex-col items-center px-4 pb-4 text-center">
                          <Link href={`${people}/${p.id}`} className="-mt-8 rounded-full ring-4 ring-card">
                            <MemberAvatar name={p.full_name} url={p.avatar_url} size="xl" />
                          </Link>
                          <Link href={`${people}/${p.id}`} className="mt-2 line-clamp-1 text-sm font-semibold text-foreground hover:underline">
                            {p.full_name}
                          </Link>
                          <p className="mt-0.5 line-clamp-2 min-h-8 text-xs text-muted-foreground">{p.headline}</p>
                          <p className="mt-2 text-[11px] text-muted-foreground">{p.reason}</p>
                          <div className="mt-auto w-full pt-3">
                            <ConnectButton userId={p.id} name={p.full_name} initial={{ state: 'none' }} size="sm" className="w-full" />
                          </div>
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

          {tab === 'connections' &&
            (connections.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No connections yet"
                description="Connect with alumni and classmates to see their posts first and message them directly."
                action={
                  <Button size="sm" variant="outline" render={<Link href={`${prefix}/network`} />}>
                    Find people
                  </Button>
                }
              />
            ) : (
              <Card className="gap-0 py-0">
                <ul>
                  {connections.map((c, i) => (
                    <li key={c.id} className={cn('flex items-center gap-3 px-5 py-3', i > 0 && 'border-t border-border')}>
                      <Link href={`${people}/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <MemberAvatar name={c.full_name} url={c.avatar_url} size="lg" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground hover:underline">{c.full_name}</p>
                          <p className="truncate text-xs text-muted-foreground">{c.headline}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">Connected {formatDate(c.connected_at)}</p>
                        </div>
                      </Link>
                      <Button size="sm" variant="outline" render={<Link href={`${prefix}/messages?peer=${c.id}`} />}>
                        <MessageSquare />
                        <span className="hidden sm:inline">Message</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}

          {tab === 'sent' &&
            (invitations.sent.length === 0 ? (
              <EmptyState icon={UserPlus} title="No sent invitations" description="Invitations you send stay here until they are answered." />
            ) : (
              <Card className="gap-0 py-0">
                <ul>
                  {invitations.sent.map((inv, i) => (
                    <li key={inv.id} className={cn('flex items-center gap-3 px-5 py-3', i > 0 && 'border-t border-border')}>
                      <Link href={`${people}/${inv.member.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <MemberAvatar name={inv.member.full_name} url={inv.member.avatar_url} size="lg" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground hover:underline">{inv.member.full_name}</p>
                          <p className="truncate text-xs text-muted-foreground">{inv.member.headline}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">Sent {formatDate(inv.created_at)}</p>
                        </div>
                      </Link>
                      <ConnectButton userId={inv.member.id} name={inv.member.full_name} initial={{ state: 'pending_out', id: inv.id }} size="sm" />
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
        </div>
      </div>
    </DashboardShell>
  );
}
