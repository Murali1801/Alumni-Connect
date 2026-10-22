'use client';

import { useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Briefcase, ChevronDown, Home, LogOut, MessageSquare, Moon, Network, Search, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { NAV, type NavBadges } from '@/lib/nav';
import type { Role } from '@/lib/session';
import { BrandMark } from '@/components/shell/brand';
import { InitialsAvatar } from '@/components/patterns';
import { HelpBot } from '@/components/chat/help-bot';
import { useLiveNotifications } from '@/components/shell/use-live-notifications';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type MemberRole = Exclude<Role, 'admin'>;

/** The five destinations in LinkedIn's top bar, mapped onto AlumniBridge. */
function topNav(role: MemberRole, badges: NavBadges) {
  const p = `/${role}`;
  return [
    { label: 'Home', href: `${p}/home`, icon: Home, count: 0 },
    { label: 'My Network', href: `${p}/network`, icon: Network, count: badges.pendingInvitations ?? 0 },
    { label: 'Jobs', href: `${p}/opportunities`, icon: Briefcase, count: 0 },
    { label: 'Messaging', href: `${p}/messages`, icon: MessageSquare, count: badges.unreadMessages ?? 0 },
    { label: 'Notifications', href: `${p}/notifications`, icon: Bell, count: badges.unreadNotifications ?? 0 },
  ];
}

const TOP_HREFS = new Set(['home', 'network', 'opportunities', 'messages', 'notifications']);

function Count({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="tnum absolute -top-1 left-1/2 ml-1.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-4 text-white">
      {n > 99 ? '99+' : n}
    </span>
  );
}

/**
 * The LinkedIn-style layout for students and alumni: a top bar with search, the
 * five main destinations and a "Me" menu holding everything else, over a
 * centred 1128px column. Phones get a bottom tab bar instead. `bare` drops the
 * page heading, as on LinkedIn's Home, Network and profile pages.
 */
export function MemberShell({
  user,
  badges = {},
  title,
  description,
  actions,
  bare = false,
  children,
}: {
  user: { id?: string; full_name: string; email: string; role: MemberRole };
  badges?: NavBadges;
  title: string;
  description: string;
  actions?: ReactNode;
  bare?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [signingOut, startSignOut] = useTransition();
  const { resolvedTheme, setTheme } = useTheme();
  const unreadNotifications = useLiveNotifications(user.id, badges.unreadNotifications ?? 0);
  const items = topNav(user.role, { ...badges, unreadNotifications });
  const p = `/${user.role}`;
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Everything not in the top bar goes in the Me menu, grouped as in the nav.
  const tools = NAV[user.role]
    .flatMap((g) => g.items)
    .filter((i) => !TOP_HREFS.has(i.href.split('/')[2] ?? '') && i.href !== '/logout');

  function search(e: React.FormEvent) {
    e.preventDefault();
    router.push(q.trim() ? `${p}/search?q=${encodeURIComponent(q.trim())}` : `${p}/search`);
  }

  function signOut() {
    startSignOut(async () => {
      await createClient().auth.signOut();
      router.push('/login');
      router.refresh();
    });
  }

  const me = (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex h-14 flex-col items-center justify-center gap-0.5 px-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-w-16',
          active(`${p}/people/${user.id}`) && 'text-foreground'
        )}
        aria-label="Me: your profile and tools"
      >
        <InitialsAvatar name={user.full_name} size="sm" className="size-6 text-[9px]" />
        <span className="hidden items-center text-[11px] md:flex">
          Me <ChevronDown className="size-3" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-2.5 px-1.5 py-2">
          <InitialsAvatar name={user.full_name} size="md" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{user.full_name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.role === 'alumni' ? 'Alumnus' : 'Student'} · {user.email}</span>
          </span>
        </div>
        {user.id && (
          <DropdownMenuItem render={<Link href={`${p}/people/${user.id}`} />} className="justify-center rounded-full border border-primary font-medium text-primary">
            View profile
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your tools</p>
        {tools.map((t) => (
          <DropdownMenuItem key={t.href} render={<Link href={t.href} />}>
            <t.icon className="size-4" />
            <span className="flex-1">{t.label}</span>
            {t.badgeKey && (badges[t.badgeKey] ?? 0) > 0 && (
              <span className="tnum rounded-full bg-muted px-1.5 text-[10px] font-semibold">{badges[t.badgeKey]}</span>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
          {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={signOut} disabled={signingOut}>
          <LogOut className="size-4" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-[1128px] items-center gap-2 px-4">
          <Link href={`${p}/home`} aria-label="AlumniBridge home" className="shrink-0">
            <BrandMark className="size-9" />
          </Link>
          <form onSubmit={search} className="relative min-w-0 flex-1 md:max-w-72 md:flex-none lg:w-72" role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people, posts, jobs"
              aria-label="Search"
              className="h-9 w-full rounded-md bg-muted pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </form>

          <nav className="ml-auto hidden items-stretch md:flex" aria-label="Main">
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active(i.href) ? 'page' : undefined}
                className={cn(
                  'relative flex h-14 min-w-16 flex-col items-center justify-center gap-0.5 border-b-2 px-2 text-muted-foreground transition-colors hover:text-foreground',
                  active(i.href) ? 'border-foreground text-foreground' : 'border-transparent'
                )}
              >
                <span className="relative">
                  <i.icon className="size-5" />
                  <Count n={i.count} />
                </span>
                <span className="text-[11px] leading-none">{i.label}</span>
              </Link>
            ))}
            <div className="ml-1 border-l border-border pl-1">{me}</div>
          </nav>
          <div className="md:hidden">{me}</div>
        </div>
      </header>

      <main className="mx-auto max-w-[1128px] px-4 pb-24 pt-5 md:pb-10">
        {!bare && (
          <div className="mb-4 space-y-3">
            <div>
              <h1 className="font-display text-xl text-foreground md:text-2xl">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
            {actions && <div className="flex flex-col gap-2 sm:flex-row">{actions}</div>}
          </div>
        )}
        {bare && actions && <div className="mb-4 flex flex-col gap-2 sm:flex-row">{actions}</div>}
        <div className="space-y-4">{children}</div>
      </main>

      {/* Phones: LinkedIn's bottom tab bar. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card md:hidden" aria-label="Main">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active(i.href) ? 'page' : undefined}
            className={cn(
              'relative flex h-14 flex-col items-center justify-center gap-0.5 text-muted-foreground',
              active(i.href) && 'text-foreground'
            )}
          >
            <span className="relative">
              <i.icon className="size-5" />
              <Count n={i.count} />
            </span>
            <span className="text-[10px] leading-none">{i.label === 'My Network' ? 'Network' : i.label === 'Notifications' ? 'Alerts' : i.label}</span>
          </Link>
        ))}
      </nav>

      <HelpBot role={user.role} />
    </div>
  );
}

