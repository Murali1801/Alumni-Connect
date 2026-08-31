'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NAV, WORKSPACE_LABEL, type NavBadges, type NavItem } from '@/lib/nav';
import type { Role } from '@/lib/session';

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

function badgeFor(item: NavItem, badges: NavBadges) {
  if (item.badgeLabel) return item.badgeLabel;
  if (!item.badgeKey) return null;
  const n = badges[item.badgeKey];
  return n && n > 0 ? (n > 99 ? '99+' : String(n)) : null;
}

export function Sidebar({
  role,
  badges = {},
  isCollapsed = false,
  onToggle,
}: {
  role: Role;
  badges?: NavBadges;
  isCollapsed?: boolean;
  onToggle?: () => void;
}) {
  const pathname = usePathname();
  const groups = NAV[role];

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen overflow-y-auto border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out',
        isCollapsed ? 'w-16' : 'w-60'
      )}
    >
      <div className={cn('p-4', isCollapsed && 'px-2')}>
        <div className={cn('mb-6 flex items-center', isCollapsed ? 'justify-center' : 'justify-between')}>
          {!isCollapsed && (
            <Link href={`/${role}`} className="flex items-center gap-2">
              <span
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                style={{
                  backgroundImage: 'linear-gradient(135deg, var(--brand-1), var(--brand-2), var(--brand-3))',
                }}
              >
                SJ
              </span>
              <span className="flex flex-col leading-none">
                <span className="text-base font-bold text-sidebar-foreground">AlumniHub</span>
                <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                  {WORKSPACE_LABEL[role]}
                </span>
              </span>
            </Link>
          )}
          {onToggle && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn('h-7 w-7 rounded-lg hover:bg-sidebar-accent', isCollapsed && 'mx-auto')}
            >
              {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.label}>
              {!isCollapsed && (
                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
              )}
              <nav className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item);
                  const badge = badgeFor(item, badges);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={isCollapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-normal transition-colors',
                        active
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
                        isCollapsed && 'justify-center'
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      {!isCollapsed && (
                        <>
                          <span className="truncate text-sm">{item.label}</span>
                          {badge && (
                            <span
                              className={cn(
                                'tnum ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium',
                                item.badgeLabel
                                  ? 'bg-primary/15 text-primary'
                                  : 'bg-muted text-foreground'
                              )}
                            >
                              {badge}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
