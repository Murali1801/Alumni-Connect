import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GraduationCap, Users, Info } from 'lucide-react';
import { getSessionUser, HOME_FOR } from '@/lib/session';
import { Card } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { RegisterForm } from '@/app/register/register-form';

export const metadata = { title: 'Create a student account' };
export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect(HOME_FOR[user.role]);

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 sm:px-6">
      <div className="grid-backdrop z-0" />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-5">
        <ThemeToggle className="h-9 w-9 rounded-lg" />
      </div>

      <main className="relative z-10 w-full max-w-lg">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2.5">
          <span
            className="inline-flex size-8 items-center justify-center rounded-lg text-[13px] font-bold text-white"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--brand-1), var(--brand-2), var(--brand-3))' }}
          >
            SJ
          </span>
          <span className="font-display text-lg">SJCEM Network</span>
        </Link>

        <Card className="gap-0 p-6 sm:p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GraduationCap className="size-5" />
            </div>
            <h1 className="font-display text-2xl">Create a student account</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              For current students of St John College. You will be able to search the alumni
              directory and ask for mentorship straight away.
            </p>
          </div>

          <RegisterForm />

          <div className="mt-6 space-y-3 border-t border-border pt-5">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <Users className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <span className="font-medium text-foreground">Are you an alumnus?</span> Do not
                register here. Use the claim link sent to your registered email — that is what links
                you to your record in the college register.
              </span>
            </p>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Your branch and graduating year seed your profile so matching works from the first
              login. You can change everything later in Settings.
            </p>
          </div>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </Card>
      </main>
    </div>
  );
}
