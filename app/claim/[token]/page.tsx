import Link from 'next/link';
import { AlertTriangle, GraduationCap, Building2, MapPin, Lock } from 'lucide-react';
import { getClaimableRecord } from '@/lib/onboarding';
import { getSessionUser, HOME_FOR } from '@/lib/session';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { ClaimForm } from '@/app/claim/[token]/claim-form';
import { Field } from '@/components/patterns';

export const metadata = { title: 'Claim your profile' };
export const dynamic = 'force-dynamic';

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Somebody already signed in does not need to claim anything.
  const user = await getSessionUser();
  if (user) redirect(HOME_FOR[user.role]);

  const record = await getClaimableRecord(token);

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

        {!record ? (
          <Card className="gap-0 p-8 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-5 text-destructive" />
            </div>
            <h1 className="font-display text-xl">This claim link is not valid</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              It may have already been used, or the link may be incomplete. If you believe the record
              is yours, contact the placement cell and they can reissue the invitation.
            </p>
            <Button className="mt-6" render={<Link href="/" />}>
              Back to sign in
            </Button>
          </Card>
        ) : (
          <Card className="gap-0 p-6 sm:p-8">
            <div className="mb-6 text-center">
              <h1 className="font-display text-2xl">Claim your profile</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                We found your record in the college register. Confirm it is you and choose a password
                to activate your account.
              </p>
            </div>

            {/* The institutional record, shown so they can check it is genuinely them */}
            <div className="rounded-lg bg-muted/60 p-4">
              <p className="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Lock className="size-3" />
                College record
              </p>
              <p className="font-display text-lg text-foreground">{record.full_name}</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">
                <Field label="Branch">
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <GraduationCap className="size-3.5 text-muted-foreground" />
                    {record.branch}
                  </span>
                </Field>
                <Field label="Batch">{record.batch_year}</Field>
                <Field label="Home city">
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <MapPin className="size-3.5 text-muted-foreground" />
                    {record.city ?? '—'}
                  </span>
                </Field>
                <Field label="First employer">
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <Building2 className="size-3.5 text-muted-foreground" />
                    {record.first_company ?? '—'}
                  </span>
                </Field>
              </dl>
            </div>

            <div className="mt-6">
              <ClaimForm token={token} name={record.full_name} />
            </div>

            <p className="mt-6 border-t border-border pt-4 text-center text-xs leading-relaxed text-muted-foreground">
              Not you? Do not continue — close this page and tell the placement cell the link reached
              the wrong person.
            </p>
          </Card>
        )}
      </main>
    </div>
  );
}
