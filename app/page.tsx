import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GraduationCap, Users, ShieldCheck, Video } from 'lucide-react';
import { getSessionUser, HOME_FOR } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { LoginForm } from '@/components/auth/login-form';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

const ROLE_NOTES = [
  { icon: GraduationCap, label: 'Students', body: 'Search the directory, ask for help, meet on video.' },
  { icon: Users, label: 'Alumni', body: 'Triage requests, post roles, mentor on your own terms.' },
  { icon: ShieldCheck, label: 'Administrators', body: 'Verify claims, watch coverage, export for the cell.' },
];

export default async function SignInPage() {
  // Anyone already signed in goes straight to their own workspace.
  const user = await getSessionUser();
  if (user) redirect(HOME_FOR[user.role]);

  const db = createAdminClient();
  const [records, companies] = await Promise.all([
    db.from('alumni_records').select('*', { count: 'exact', head: true }),
    db.from('companies').select('*', { count: 'exact', head: true }),
  ]);

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 sm:px-6">
      <div className="grid-backdrop z-0" />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-5">
        <ThemeToggle className="h-9 w-9 rounded-lg" />
      </div>

      <main className="relative z-10 w-full max-w-4xl">
        <Card className="flex flex-col gap-0 overflow-hidden bg-card/90 p-0 shadow-lg backdrop-blur-xl md:h-[620px] md:flex-row">
          {/* Branding panel */}
          <div className="relative hidden w-1/2 flex-col justify-between bg-muted p-10 md:flex">
            <Link href="/" className="relative z-10 flex items-center gap-2.5">
              <span
                className="inline-flex size-8 items-center justify-center rounded-lg text-[13px] font-bold text-white"
                style={{ backgroundImage: 'linear-gradient(135deg, var(--brand-1), var(--brand-2), var(--brand-3))' }}
              >
                SJ
              </span>
              <span className="font-display text-lg">SJCEM Network</span>
            </Link>

            <div className="relative z-10 space-y-6">
              <div>
                <h2 className="font-display text-2xl leading-tight">
                  The alumni network for{' '}
                  <span className="text-gradient">St John College</span>
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Built on {(records.count ?? 0).toLocaleString()} institutional records and{' '}
                  {(companies.count ?? 0).toLocaleString()} employers from the college register — not
                  on self-signup.
                </p>
              </div>

              <ul className="space-y-3">
                {ROLE_NOTES.map((r) => (
                  <li key={r.label} className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
                      <r.icon className="size-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{r.label}</span>
                      <span className="block text-xs leading-relaxed text-muted-foreground">{r.body}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <p className="flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                <Video className="size-3.5 shrink-0" />
                Accepted requests become browser video sessions — no installs.
              </p>
            </div>
          </div>

          {/* Form panel */}
          <div className="flex w-full flex-col justify-center p-6 sm:p-10 md:w-1/2">
            <div className="mb-8 flex flex-col items-center gap-2 md:hidden">
              <Link href="/" className="flex items-center gap-2">
                <span
                  className="inline-flex size-7 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                  style={{ backgroundImage: 'linear-gradient(135deg, var(--brand-1), var(--brand-2), var(--brand-3))' }}
                >
                  SJ
                </span>
                <span className="font-display text-lg">SJCEM Network</span>
              </Link>
            </div>

            <LoginForm />
          </div>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} SJCEM Alumni Network · St John College of Engineering and
          Management
        </p>
      </main>
    </div>
  );
}
