import { redirect } from 'next/navigation';
import { getSessionUser, HOME_FOR, safeNext } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Post-sign-in hop. The client cannot see `users.role`, so it lands here and
 * the server routes it to the right workspace, or back to the link the member
 * was opening before they signed in.
 */
export default async function AuthRoutePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  redirect(safeNext((await searchParams).next) ?? HOME_FOR[user.role]);
}
