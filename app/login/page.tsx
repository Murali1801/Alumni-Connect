import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/session';

/** `/login` is kept as an alias — the sign-in form lives at the root. */
export default async function LoginRedirect({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  // Keep where the visitor was going (a shared post, say) for after sign-in.
  const next = safeNext((await searchParams).next);
  redirect(next ? `/?next=${encodeURIComponent(next)}` : '/');
}
