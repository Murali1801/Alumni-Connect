/**
 * Puts the three surviving accounts into a usable state after the purge.
 *
 * This is not bulk seed data — it creates exactly four rows, the minimum for
 * the product to be exercised end to end:
 *
 *   1. the alumni account claims one REAL record from the college register
 *   2. an alumni_profile for it, with availability switched on
 *   3. a student_profile for the student account
 *   4. one accepted mentorship request between the two, plus a video session
 *
 * Everything here is editable from the UI afterwards.
 *
 *   node scripts/bootstrap-connection.mjs
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

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

const iso = (d) => d.toISOString();

async function userByEmail(email) {
  const { data } = await db.from('users').select('id, email, full_name, role').eq('email', email).maybeSingle();
  if (!data) throw new Error(`No account for ${email}. Run the purge script first.`);
  return data;
}

async function main() {
  const admin = await userByEmail('admin@v3.demo.com');
  const alumnus = await userByEmail('alumni1@v3.demo.com');
  const student = await userByEmail('student1@v3.demo.com');

  /* ---------- 1. the alumnus claims a real record ---------- */

  let { data: existingRecord } = await db
    .from('alumni_records')
    .select('id, full_name, branch, batch_year, first_company_id')
    .eq('claimed_by', alumnus.id)
    .maybeSingle();

  if (!existingRecord) {
    // A recent COMP graduate with a placement on file — the most realistic
    // profile for a student to want to talk to.
    const { data: candidate } = await db
      .from('alumni_records')
      .select('id, full_name, branch, batch_year, first_company_id, first_role')
      .eq('claim_status', 'unclaimed')
      .eq('branch', 'COMP')
      .not('first_company_id', 'is', null)
      .order('batch_year', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!candidate) throw new Error('No unclaimed COMP record with an employer on file.');

    await db
      .from('alumni_records')
      .update({
        claim_status: 'verified',
        claimed_by: alumnus.id,
        claimed_at: iso(new Date(Date.now() - 3 * 86_400_000)),
        verified_by: admin.id,
        verified_at: iso(new Date(Date.now() - 2 * 86_400_000)),
      })
      .eq('id', candidate.id);

    // The account now carries the institutional name, as a real claim would.
    await db.from('users').update({ full_name: candidate.full_name }).eq('id', alumnus.id);

    await db.from('audit_log').insert({
      actor_id: admin.id,
      action: 'mark_verified',
      target_type: 'alumni_records',
      target_id: candidate.id,
      detail: { note: 'Claim verified during environment setup.' },
    });

    existingRecord = candidate;
    console.log(`alumnus claimed record: ${candidate.full_name} (${candidate.branch} ${candidate.batch_year})`);
  } else {
    console.log(`alumnus already linked to: ${existingRecord.full_name}`);
  }

  /* ---------- 2. alumni profile ---------- */

  const { data: company } = await db
    .from('companies')
    .select('id, name')
    .eq('id', existingRecord.first_company_id)
    .maybeSingle();

  const { error: profileErr } = await db.from('alumni_profiles').upsert(
    {
      user_id: alumnus.id,
      record_id: existingRecord.id,
      current_company_id: existingRecord.first_company_id,
      designation: 'Software Engineer',
      industry: 'Information Technology',
      location: 'Mumbai',
      experience_years: Math.max(1, new Date().getFullYear() - (existingRecord.batch_year ?? 2020)),
      skills: ['JavaScript', 'React', 'Node.js', 'SQL'],
      linkedin_url: null,
      bio: 'Happy to talk through interview preparation and the first couple of years on the job. Edit this from My Profile.',
      mentorship_available: true,
      mock_interview_available: true,
      referral_available: true,
      internship_available: false,
      updated_at: iso(new Date()),
    },
    { onConflict: 'user_id' }
  );
  if (profileErr) throw new Error(`alumni_profiles: ${profileErr.message}`);
  console.log(`alumni profile ready${company ? ` at ${company.name}` : ''}`);

  /* ---------- 3. student profile ---------- */

  const { error: studentErr } = await db.from('student_profiles').upsert(
    {
      user_id: student.id,
      branch: 'COMP',
      batch_year: new Date().getFullYear() + 1,
      skills: ['JavaScript', 'React', 'SQL', 'Data Structures'],
      target_role: 'Software Engineer',
      target_company: company?.name ?? null,
      target_industry: 'Information Technology',
      location_pref: 'Mumbai',
      resume_url: null,
      updated_at: iso(new Date()),
    },
    { onConflict: 'user_id' }
  );
  if (studentErr) throw new Error(`student_profiles: ${studentErr.message}`);
  console.log('student profile ready');

  /* ---------- 4. an accepted request, so they are connected ---------- */

  const { data: existingReq } = await db
    .from('requests')
    .select('id, status')
    .eq('student_id', student.id)
    .eq('alumni_id', alumnus.id)
    .eq('type', 'mentorship')
    .maybeSingle();

  let requestId = existingReq?.id;

  if (!existingReq) {
    const sentAt = new Date(Date.now() - 2 * 86_400_000);
    const { data: created, error: reqErr } = await db
      .from('requests')
      .insert({
        student_id: student.id,
        alumni_id: alumnus.id,
        type: 'mentorship',
        message:
          'I am in my final year targeting software engineering roles and would really value 30 minutes to review my preparation plan for the next six months.',
        status: 'accepted',
        match_score: 78,
        response_note: 'Happy to help — send your resume across and we can talk it through on a call.',
        created_at: iso(sentAt),
        responded_at: iso(new Date(sentAt.getTime() + 6 * 3_600_000)),
      })
      .select('id')
      .single();
    if (reqErr) throw new Error(`requests: ${reqErr.message}`);
    requestId = created.id;
    console.log('accepted mentorship request created — the two accounts are now connected');
  } else {
    if (existingReq.status !== 'accepted') {
      await db
        .from('requests')
        .update({ status: 'accepted', responded_at: iso(new Date()) })
        .eq('id', existingReq.id);
      console.log('existing request moved to accepted');
    } else {
      console.log('request already accepted');
    }
  }

  /* ---------- 5. a scheduled video session ---------- */

  const { data: existingCall } = await db
    .from('engagement_events')
    .select('id')
    .eq('event_type', 'call_session')
    .eq('metadata->>request_id', requestId)
    .limit(1);

  if (!existingCall?.length) {
    const when = new Date();
    when.setDate(when.getDate() + 1);
    when.setHours(18, 0, 0, 0);

    const { data: alumnusRow } = await db.from('users').select('full_name').eq('id', alumnus.id).single();

    const { error: callErr } = await db.from('engagement_events').insert({
      user_id: alumnus.id,
      event_type: 'call_session',
      metadata: {
        room_id: crypto.randomUUID(),
        title: 'Mentorship session',
        scheduled_at: iso(when),
        duration_min: 30,
        host_id: alumnus.id,
        guest_id: student.id,
        host_name: alumnusRow?.full_name ?? 'Alumnus',
        guest_name: student.full_name,
        request_id: requestId,
        agenda: 'Resume review, then two system-design questions.',
        status: 'scheduled',
      },
    });
    if (callErr) throw new Error(`call session: ${callErr.message}`);
    console.log(`video session scheduled for ${when.toLocaleString()}`);
  } else {
    console.log('video session already scheduled');
  }

  console.log('\nDone. Sign in as student1@v3.demo.com or alumni1@v3.demo.com (password123).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
