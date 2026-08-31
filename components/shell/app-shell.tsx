'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Brand } from '@/components/shell/brand';
import { UserMenu } from '@/components/shell/user-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import type { Role } from '@/lib/session';

export type NavLink = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Also treat descendant routes as active. */
  exact?: boolean;
  badge?: number;
};

function isActive(pathname: string, link: NavLink) {
  return link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(link.href + '/');
}

/**
 * Member-facing shell used by both students and alumni: a sticky top bar with
 * horizontal navigation. Admins get `AdminShell` instead — a console layout.
 */
export function AppShell({
  user,
  links,
  children,
  cta,
}: {
  user: { full_name: string; email: string; role: Role };
  links: NavLink[];
  children: React.ReactNode;
  cta?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-3 px-4 sm:px-6">
          <Brand href={`/${user.role}`} subtitle={user.role === 'alumni' ? 'Alumni' : 'Student'} />

          <nav className="ml-4 hidden items-center gap-0.5 md:flex">
            {links.map((link) => {
              const active = isActive(pathname, link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  <link.icon className="size-4" />
                  {link.label}
                  {link.badge ? (
                    <span className="tnum ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background">
                      {link.badge > 99 ? '99+' : link.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {cta ? <div className="hidden sm:block">{cta}</div> : null}
            <ThemeToggle />
            <UserMenu name={user.full_name} email={user.email} role={user.role} />
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </Button>
          </div>
        </div>

        {open ? (
          <nav className="border-t border-border bg-background px-4 py-2 md:hidden">
            {links.map((link) => {
              const active = isActive(pathname, link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                    active ? 'bg-muted text-foreground' : 'text-muted-foreground'
                  )}
                >
                  <link.icon className="size-4" />
                  {link.label}
                  {link.badge ? (
                    <span className="tnum ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[10px] font-semibold text-background">
                      {link.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            {cta ? <div className="px-1 pb-1 pt-2 sm:hidden">{cta}</div> : null}
          </nav>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} SJCEM Alumni Network</span>
          <span>St John College of Engineering and Management</span>
        </div>
      </footer>
    </div>
  );
}
