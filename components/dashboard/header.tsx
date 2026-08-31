'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Bell, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/shell/user-menu';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import type { NavBadges } from '@/lib/nav';
import type { Role } from '@/lib/session';

const SEARCH_TARGET: Record<Role, string> = {
  student: '/student/directory',
  alumni: '/alumni/mentees',
  admin: '/admin/records',
};

const SEARCH_PLACEHOLDER: Record<Role, string> = {
  student: 'Search alumni by name…',
  alumni: 'Search students you have helped…',
  admin: 'Search alumni records…',
};

export function Header({
  title,
  description,
  actions,
  user,
  badges = {},
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  user: { full_name: string; email: string; role: Role };
  badges?: NavBadges;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const notifications = (badges.pendingRequests ?? 0) + (badges.verificationQueue ?? 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const target = SEARCH_TARGET[user.role];
    router.push(q.trim() ? `${target}?q=${encodeURIComponent(q.trim())}` : target);
  }

  return (
    <header className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <MobileNav role={user.role} badges={badges} />

          <form onSubmit={submit} className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={SEARCH_PLACEHOLDER[user.role]}
              aria-label="Search"
              className="h-9 rounded-lg border-border bg-card pl-9 pr-3 text-sm"
            />
          </form>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-lg"
            aria-label="Video rooms"
            render={<Link href={`/${user.role}/calls`} />}
          >
            <Video className="size-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 rounded-lg"
            aria-label={`Notifications${notifications ? `, ${notifications} pending` : ''}`}
            render={
              <Link href={user.role === 'admin' ? '/admin/verification' : `/${user.role}/requests`} />
            }
          >
            <Bell className="size-4" />
            {notifications > 0 && (
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-destructive" />
            )}
          </Button>

          <ThemeToggle className="h-9 w-9 rounded-lg" />

          <div className="ml-1 border-l border-border pl-2">
            <UserMenu name={user.full_name} email={user.email} role={user.role} />
          </div>
        </div>
      </div>

      <div>
        <h1 className="mb-1 font-display text-xl text-foreground md:text-2xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {actions && <div className="flex flex-col gap-2 sm:flex-row">{actions}</div>}
    </header>
  );
}
