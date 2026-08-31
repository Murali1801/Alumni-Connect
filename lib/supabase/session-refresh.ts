import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Paths reachable without a session. */
const PUBLIC_PREFIXES = [
  '/login',
  '/register',
  '/api/register',
  '/claim',
  '/api/claim',
  '/api/auth',
  '/logout',
  '/auth/route',
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return supabaseResponse;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = pathname === '/' || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const isProtected =
    pathname.startsWith('/student') ||
    pathname.startsWith('/alumni') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/call');

  // Role enforcement itself lives in `requireUser` on each page — the middleware
  // only handles the cheap "signed out" case, so it never has to query the
  // database on every request.
  if (!user && isProtected && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
