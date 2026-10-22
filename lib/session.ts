import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type Role = 'student' | 'alumni' | 'admin';

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  full_name: string;
  created_at: string;
  /** Public URL of the profile photo, if the member uploaded one. */
  avatar_url: string | null;
};

/**
 * A `next` destination carried through sign-in, such as a shared post link.
 * Only in-app member paths are accepted, so the parameter can never send
 * someone to another site ("//evil.example", "/\\evil.example") or a loop.
 */
export function safeNext(next: string | string[] | undefined | null): string | null {
  const value = Array.isArray(next) ? next[0] : next;
  if (!value || !/^\/(posts|student|alumni|admin|call)(\/|$|\?)/.test(value)) return null;
  if (value.startsWith('//') || value.includes('\\')) return null;
  return value;
}

/** Landing route for each role. */
export const HOME_FOR: Record<Role, string> = {
  student: '/student/home',
  alumni: '/alumni/home',
  admin: '/admin',
};

/**
 * Resolve the signed-in user and their application role.
 *
 * The `users` row is read with the service key: the table's own RLS policy for
 * admins is self-referential (`exists (select 1 from users where ...)`), which
 * recurses under RLS and makes the anon-key read fail for admins.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('id, email, role, full_name, created_at, avatar_path')
    .eq('id', user.id)
    .maybeSingle();

  if (!data) return null;
  const { avatar_path, ...rest } = data;
  return {
    ...rest,
    avatar_url: avatar_path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${avatar_path}`
      : null,
  } as SessionUser;
});

/** Require a session; optionally require one of `roles`. Redirects otherwise. */
export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (roles && !roles.includes(user.role)) redirect(HOME_FOR[user.role]);
  return user;
}
