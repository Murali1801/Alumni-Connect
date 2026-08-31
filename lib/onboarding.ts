import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Account creation for the two ways into the network.
 *
 * Both paths mint the auth user server-side with `email_confirm: true` rather
 * than sending a magic link. That is deliberate: the deployment has no SMTP
 * configured, so an email-based flow would strand every real user. Identity for
 * alumni is established by possession of the claim token, which is what the
 * invitation carries anyway.
 *
 * Every read here uses the service key. The anon key cannot be used for this:
 * the `users` table carries a self-referential admin policy that recurses under
 * RLS, so an anon lookup of `alumni_records` fails outright. See
 * `supabase/migrations/0001_fix_recursive_rls.sql`.
 */

export const MIN_PASSWORD = 8;

export type OnboardingResult =
  | { ok: true; email: string }
  | { ok: false; error: string; status: number };

/** Optional allowlist, e.g. "sjcem.edu.in,students.sjcem.edu.in". Unset = open. */
function allowedDomains(): string[] {
  return (process.env.STUDENT_EMAIL_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function checkStudentEmail(email: string): string | null {
  const domains = allowedDomains();
  if (domains.length === 0) return null;
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (!domains.includes(domain)) {
    return `Student accounts must use a ${domains.map((d) => '@' + d).join(' or ')} address.`;
  }
  return null;
}

export function checkPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD) {
    return `Use at least ${MIN_PASSWORD} characters.`;
  }
  return null;
}

async function emailTaken(email: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db.from('users').select('id').ilike('email', email).maybeSingle();
  return Boolean(data);
}

/* ------------------------------------------------------------------ */
/* Alumni: claim an institutional record                               */
/* ------------------------------------------------------------------ */

export type ClaimableRecord = {
  id: string;
  full_name: string;
  branch: string;
  batch_year: number;
  city: string | null;
  first_role: string | null;
  first_company: string | null;
};

/** Look up a record by claim token. Returns null for unknown or spent tokens. */
export async function getClaimableRecord(token: string): Promise<ClaimableRecord | null> {
  if (!token || token.length < 16) return null;

  const db = createAdminClient();
  const { data } = await db
    .from('alumni_records')
    .select('id, full_name, branch, batch_year, city, first_role, claim_status, first_company:companies!first_company_id(name)')
    .eq('claim_token', token)
    .maybeSingle();

  if (!data || data.claim_status !== 'unclaimed') return null;

  const company = Array.isArray(data.first_company) ? data.first_company[0] : data.first_company;
  return {
    id: data.id,
    full_name: data.full_name,
    branch: data.branch,
    batch_year: data.batch_year,
    city: data.city,
    first_role: data.first_role,
    first_company: (company as { name?: string } | null)?.name ?? null,
  };
}

export async function claimRecord(
  token: string,
  email: string,
  password: string
): Promise<OnboardingResult> {
  const pwError = checkPassword(password);
  if (pwError) return { ok: false, error: pwError, status: 400 };

  const record = await getClaimableRecord(token);
  if (!record) {
    return {
      ok: false,
      error: 'This claim link is not valid, or the record has already been claimed.',
      status: 404,
    };
  }

  if (await emailTaken(email)) {
    return {
      ok: false,
      error: 'An account already exists for that email. Sign in instead.',
      status: 409,
    };
  }

  const db = createAdminClient();

  const { data: created, error: authError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: record.full_name },
  });
  if (authError || !created.user) {
    return { ok: false, error: authError?.message ?? 'Could not create the account.', status: 400 };
  }

  const userId = created.user.id;

  // From here on, roll the auth user back if anything fails — a half-created
  // account with no `users` row can neither sign in usefully nor be claimed again.
  const rollback = async (message: string): Promise<OnboardingResult> => {
    await db.auth.admin.deleteUser(userId).catch(() => {});
    return { ok: false, error: message, status: 500 };
  };

  const { error: userError } = await db
    .from('users')
    .insert({ id: userId, role: 'alumni', full_name: record.full_name, email });
  if (userError) return rollback(`Could not create your account record: ${userError.message}`);

  // Claim the record, but only while it is still unclaimed — this is the guard
  // against two people racing the same link.
  const { data: claimed, error: claimError } = await db
    .from('alumni_records')
    .update({ claim_status: 'claimed', claimed_by: userId, claimed_at: new Date().toISOString() })
    .eq('id', record.id)
    .eq('claim_status', 'unclaimed')
    .select('id');

  if (claimError) return rollback(`Could not claim the record: ${claimError.message}`);
  if (!claimed || claimed.length === 0) {
    await db.from('users').delete().eq('id', userId);
    return rollback('That record was claimed by someone else a moment ago.');
  }

  const { error: profileError } = await db
    .from('alumni_profiles')
    .insert({ user_id: userId, record_id: record.id, skills: [] });
  if (profileError) {
    await db
      .from('alumni_records')
      .update({ claim_status: 'unclaimed', claimed_by: null, claimed_at: null })
      .eq('id', record.id);
    await db.from('users').delete().eq('id', userId);
    return rollback(`Could not create your profile: ${profileError.message}`);
  }

  await db.from('engagement_events').insert({
    user_id: userId,
    event_type: 'claim_completed',
    metadata: { record_id: record.id },
  });

  return { ok: true, email };
}

/* ------------------------------------------------------------------ */
/* Students: self-registration                                         */
/* ------------------------------------------------------------------ */

export type StudentRegistration = {
  fullName: string;
  email: string;
  password: string;
  branch: string;
  batchYear: number;
};

export async function registerStudent(input: StudentRegistration): Promise<OnboardingResult> {
  const pwError = checkPassword(input.password);
  if (pwError) return { ok: false, error: pwError, status: 400 };

  const domainError = checkStudentEmail(input.email);
  if (domainError) return { ok: false, error: domainError, status: 400 };

  if (await emailTaken(input.email)) {
    return {
      ok: false,
      error: 'An account already exists for that email. Sign in instead.',
      status: 409,
    };
  }

  const db = createAdminClient();

  const { data: created, error: authError } = await db.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (authError || !created.user) {
    return { ok: false, error: authError?.message ?? 'Could not create the account.', status: 400 };
  }

  const userId = created.user.id;
  const rollback = async (message: string): Promise<OnboardingResult> => {
    await db.auth.admin.deleteUser(userId).catch(() => {});
    return { ok: false, error: message, status: 500 };
  };

  const { error: userError } = await db
    .from('users')
    .insert({ id: userId, role: 'student', full_name: input.fullName, email: input.email });
  if (userError) return rollback(`Could not create your account record: ${userError.message}`);

  // Seed the profile so matching has branch and batch from the first login.
  const { error: profileError } = await db.from('student_profiles').insert({
    user_id: userId,
    branch: input.branch,
    batch_year: input.batchYear,
    skills: [],
  });
  if (profileError) {
    await db.from('users').delete().eq('id', userId);
    return rollback(`Could not create your profile: ${profileError.message}`);
  }

  return { ok: true, email: input.email };
}
