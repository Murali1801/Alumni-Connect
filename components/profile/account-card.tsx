import { Card } from '@/components/ui/card';
import { InitialsAvatar, Field } from '@/components/patterns';
import type { SessionUser } from '@/lib/session';
import { formatShortMonthYear } from '@/lib/format';

const ROLE_LABEL: Record<string, string> = {
  student: 'Student',
  alumni: 'Alumnus',
  admin: 'Administrator',
};

export function AccountCard({ user }: { user: SessionUser }) {
  return (
    <Card className="gap-0 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <InitialsAvatar name={user.full_name} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">{user.full_name}</h2>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <dl className="grid grid-cols-2 gap-6 sm:gap-8">
          <Field label="Role">{ROLE_LABEL[user.role] ?? user.role}</Field>
          <Field label="Member since">
            {formatShortMonthYear(user.created_at)}
          </Field>
        </dl>
      </div>
      <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        Your name, email and role come from your account and the institutional record. To change them,
        contact the placement cell.
      </p>
    </Card>
  );
}
