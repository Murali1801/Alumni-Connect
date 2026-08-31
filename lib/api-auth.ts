import 'server-only';
import { NextResponse } from 'next/server';
import { getSessionUser, type Role, type SessionUser } from '@/lib/session';

type AuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

/**
 * Route-handler counterpart to `requireUser`: returns a JSON error response
 * instead of redirecting, so callers can `if (!auth.ok) return auth.response`.
 */
export async function requireApiUser(roles?: Role[]): Promise<AuthResult> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  }
  if (roles && !roles.includes(user.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not allowed for your role' }, { status: 403 }),
    };
  }
  return { ok: true, user };
}
