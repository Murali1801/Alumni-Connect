import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/session-refresh';

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Every path except static assets, image optimisation output and the
     * favicon — none of those need a session refresh.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
