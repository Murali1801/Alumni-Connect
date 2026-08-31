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
};

/** Landing route for each role. */
export const HOME_FOR: Record<Role, string> = {
  student: '/student',
  alumni: '/alumni',
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
    .select('id, email, role, full_name, created_at')
    .eq('id', user.id)
    .maybeSingle();

  if (!data) return null;
  return data as SessionUser;
});

/** Require a session; optionally require one of `roles`. Redirects otherwise. */
export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (roles && !roles.includes(user.role)) redirect(HOME_FOR[user.role]);
  return user;
}
