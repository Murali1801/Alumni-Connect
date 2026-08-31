'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, PanelLeftClose, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/shell/brand';
import { UserMenu } from '@/components/shell/user-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { NavLink } from '@/components/shell/app-shell';

export type NavGroup = { label: string; links: NavLink[] };

function isActive(pathname: string, link: NavLink) {
  return link.exact
    ? pathname === link.href
    : pathname === link.href || pathname.startsWith(link.href + '/');
}

function SidebarNav({ groups, pathname }: { groups: NavGroup[]; pathname: string }) {
  return (
    <nav className="flex flex-col gap-6 px-3 py-4">
      {groups.map((group) => (
        <div key={group.label} className="space-y-1">
          <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {group.label}
          </div>
          {group.links.map((link) => {
            const active = isActive(pathname, link);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                )}
              >
                <link.icon className={cn('size-4 shrink-0', active && 'text-foreground')} />
                <span className="truncate">{link.label}</span>
                {link.badge ? (
                  <span className="tnum ml-auto inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-[var(--warning)]/15 px-1.5 text-[10px] font-semibold text-[var(--warning)]">
                    {link.badge > 99 ? '99+' : link.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/**
 * Admin console shell. Students and alumni are *members* and get a top-nav
 * social layout; the admin is an *operator*, so this is a fixed-sidebar console
 * with a dense content column and no marketing chrome.
 */
export function AdminShell({
  user,
  groups,
  children,
}: {
  user: { full_name: string; email: string; role: 'admin' };
  groups: NavGroup[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const current = groups.flatMap((g) => g.links).find((l) => isActive(pathname, l));

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
          <BrandMark />
          <span className="flex flex-col leading-none">
            <span className="font-display text-[15px] text-foreground">SJCEM</span>
            <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Admin console
            </span>
          </span>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          <SidebarNav groups={groups} pathname={pathname} />
        </div>
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-start gap-2.5 rounded-lg bg-sidebar-accent/60 p-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Every verify and reject you perform is written to the audit log.
            </p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl sm:px-6">
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                  <Menu className="size-4" />
                </Button>
              }
            />
            <SheetContent side="left" className="w-64! max-w-64! gap-0 p-0">
              <SheetTitle className="flex h-14 items-center gap-2.5 border-b border-border px-4 text-sm">
                <BrandMark />
                Admin console
              </SheetTitle>
              <div className="scrollbar-thin overflow-y-auto">
                <SidebarNav groups={groups} pathname={pathname} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 items-center gap-2 text-sm">
            <PanelLeftClose className="hidden size-4 text-muted-foreground lg:block" />
            <span className="text-muted-foreground">Console</span>
            <span className="text-muted-foreground/50">/</span>
            <span className="truncate font-medium text-foreground">{current?.label ?? 'Overview'}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserMenu name={user.full_name} email={user.email} role="admin" />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
