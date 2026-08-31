'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Settings, User as UserIcon, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { InitialsAvatar } from '@/components/patterns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,

  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Role } from '@/lib/session';

const PROFILE_HREF: Record<Role, string> = {
  student: '/student/settings',
  alumni: '/alumni/profile',
  admin: '/admin',
};

const SETTINGS_HREF: Record<Role, string> = {
  student: '/student/settings',
  alumni: '/alumni/profile',
  admin: '/admin/settings',
};

const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  alumni: 'Alumnus',
  admin: 'Administrator',
};

export function UserMenu({
  name,
  email,
  role,
  align = 'end',
}: {
  name: string;
  email: string;
  role: Role;
  align?: 'start' | 'end';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function signOut() {
    startTransition(async () => {
      await createClient().auth.signOut();
      router.push('/login');
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Account menu"
      >
        <InitialsAvatar name={name} size="sm" />
        <span className="hidden max-w-[120px] truncate text-xs font-medium sm:block">{name}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-60">
        {/* A static header, not a group label — Base UI's GroupLabel requires a
            surrounding Menu.Group, and this identifies the account rather than
            labelling a set of items. */}
        <div className="flex items-center gap-2.5 px-1.5 py-2">
          <InitialsAvatar name={name} size="md" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {ROLE_LABEL[role]}
            </span>
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={PROFILE_HREF[role]} />}>
          <UserIcon className="size-4" />
          {role === 'admin' ? 'Console home' : 'My profile'}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={SETTINGS_HREF[role]} />}>
          <Settings className="size-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={signOut} disabled={pending}>
          <LogOut className="size-4" />
          {pending ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
