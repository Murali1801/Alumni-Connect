import { redirect } from 'next/navigation';
import { getSessionUser, HOME_FOR } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Post-sign-in hop. The client cannot see `users.role`, so it lands here and
 * the server routes it to the right workspace.
 */
export default async function AuthRoutePage() {
  const user = await getSessionUser();
  redirect(user ? HOME_FOR[user.role] : '/login');
}
