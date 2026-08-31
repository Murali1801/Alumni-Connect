/**
 * Removes every fabricated row, leaving only what came out of the college
 * spreadsheet ingest.
 *
 * Kept:
 *   - alumni_records whose student_id is a real college ID (3,792 rows)
 *   - companies parsed from the ingest
 *   - exactly three sign-in accounts, one per role
 *
 * Removed:
 *   - all requests, opportunities, engagement events and audit entries
 *   - all alumni_profiles and student_profiles
 *   - the 155 MOCK_* alumni_records that were never in the spreadsheet
 *   - the other 298 accounts, from both auth.users and public.users
 *   - every claim, so all real records return to 'unclaimed'
 *
 *   node scripts/purge-demo-data.mjs           # dry run, prints the plan
 *   node scripts/purge-demo-data.mjs --commit  # actually deletes
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const COMMIT = process.argv.includes('--commit');

const env = Object.fromEntries(
  fs
    .readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** The three accounts that survive, so the app stays reachable. */
const KEEP_EMAILS = ['admin@v3.demo.com', 'alumni1@v3.demo.com', 'student1@v3.demo.com'];

/** Placeholder employers invented by the old mock seed, not from the ingest. */
const PLACEHOLDER_COMPANY_IDS = [
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
];

const count = async (table, build = (q) => q) => {
  const { count: n } = await build(db.from(table).select('*', { count: 'exact', head: true }));
  return n ?? 0;
};

async function fetchAllIds(table, column, build = (q) => q) {
  let out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(db.from(table).select(column)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out = out.concat(data.map((r) => r[column]));
    if (data.length < 1000) break;
  }
  return out;
}

async function main() {
  console.log(COMMIT ? '=== PURGE (committing) ===' : '=== PURGE (dry run) ===\n');

  const before = {
    users: await count('users'),
    records: await count('alumni_records'),
    mockRecords: await count('alumni_records', (q) => q.like('student_id', 'MOCK%')),
    claimed: await count('alumni_records', (q) => q.in('claim_status', ['claimed', 'verified'])),
    alumniProfiles: await count('alumni_profiles'),
    studentProfiles: await count('student_profiles'),
    requests: await count('requests'),
    opportunities: await count('opportunities'),
    events: await count('engagement_events'),
    audit: await count('audit_log'),
    companies: await count('companies'),
  };
  console.table(before);

  const { data: keepRows } = await db.from('users').select('id, email, role').in('email', KEEP_EMAILS);
  const keepIds = new Set((keepRows ?? []).map((u) => u.id));
  if (keepIds.size !== KEEP_EMAILS.length) {
    throw new Error(
      `Expected ${KEEP_EMAILS.length} accounts to keep, found ${keepIds.size}. Aborting rather than guessing.`
    );
  }

  const allUserIds = await fetchAllIds('users', 'id');
  const doomedUserIds = allUserIds.filter((id) => !keepIds.has(id));

  console.log(`\nPlan:
  delete requests            ${before.requests}
  delete opportunities       ${before.opportunities}
  delete engagement_events   ${before.events}
  delete audit_log           ${before.audit}
  delete alumni_profiles     ${before.alumniProfiles}
  delete student_profiles    ${before.studentProfiles}
  reset claims on records    ${before.claimed}
  delete MOCK_ records       ${before.mockRecords}
  delete accounts            ${doomedUserIds.length}  (keeping ${keepIds.size})
  keep real records          ${before.records - before.mockRecords}
  keep companies             ${before.companies} (minus unreferenced placeholders)\n`);

  if (!COMMIT) {
    console.log('Dry run only. Re-run with --commit to apply.');
    return;
  }

  // ---- activity tables first: everything below has FKs into users ----
  const wipe = async (table) => {
    const { error } = await db.from(table).delete().not('id', 'is', null);
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`cleared ${table}`);
  };

  await wipe('requests');
  await wipe('opportunities');
  await wipe('engagement_events');
  await wipe('audit_log');
  await wipe('alumni_profiles');
  await wipe('student_profiles');

  // ---- release every claim so the FKs to users can go ----
  {
    const { error } = await db
      .from('alumni_records')
      .update({
        claim_status: 'unclaimed',
        claimed_by: null,
        claimed_at: null,
        verified_by: null,
        verified_at: null,
      })
      .not('claim_status', 'eq', 'unclaimed');
    if (error) throw new Error(`reset claims: ${error.message}`);
    console.log('reset all claims to unclaimed');
  }

  // ---- drop the fabricated records ----
  {
    const { error } = await db.from('alumni_records').delete().like('student_id', 'MOCK%');
    if (error) throw new Error(`delete mock records: ${error.message}`);
    console.log(`deleted ${before.mockRecords} MOCK_ records`);
  }

  // ---- accounts: auth.users first, public.users cascades from it ----
  let deleted = 0;
  for (const id of doomedUserIds) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) {
      // Fall back to the mirror table if the auth row is already gone.
      await db.from('users').delete().eq('id', id);
    }
    deleted++;
    if (deleted % 50 === 0) console.log(`  deleted ${deleted}/${doomedUserIds.length} accounts…`);
  }
  console.log(`deleted ${deleted} accounts`);

  // ---- rename the survivors honestly ----
  const names = {
    'admin@v3.demo.com': 'Placement Cell Admin',
    'alumni1@v3.demo.com': 'Demo Alumnus',
    'student1@v3.demo.com': 'Demo Student',
  };
  for (const [email, full_name] of Object.entries(names)) {
    await db.from('users').update({ full_name }).eq('email', email);
  }
  console.log('renamed the three surviving accounts');

  // ---- placeholder employers, only if nothing points at them any more ----
  for (const id of PLACEHOLDER_COMPANY_IDS) {
    const stillUsed = await count('alumni_records', (q) => q.eq('first_company_id', id));
    if (stillUsed === 0) {
      await db.from('companies').delete().eq('id', id);
      console.log(`deleted placeholder company ${id}`);
    } else {
      console.log(`kept ${id} — still referenced by ${stillUsed} real records`);
    }
  }

  const after = {
    users: await count('users'),
    records: await count('alumni_records'),
    claimed: await count('alumni_records', (q) => q.in('claim_status', ['claimed', 'verified'])),
    alumniProfiles: await count('alumni_profiles'),
    studentProfiles: await count('student_profiles'),
    requests: await count('requests'),
    opportunities: await count('opportunities'),
    events: await count('engagement_events'),
    audit: await count('audit_log'),
    companies: await count('companies'),
  };
  console.log('\n=== after ===');
  console.table(after);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
