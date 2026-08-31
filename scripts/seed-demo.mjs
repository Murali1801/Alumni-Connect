/**
 * Populates the demo dataset on top of the ingested spreadsheet.
 *
 * The institutional records (alumni_records) and companies come from the real
 * ingest and are never rewritten here. What this adds is the *activity* layer
 * the product needs in order to be legible: claimed profiles, student profiles,
 * requests in every status, open opportunities and engagement events.
 *
 *   node scripts/seed-demo.mjs
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

/* ---------- deterministic pseudo-randomness so reruns are stable ---------- */
let seed = 1337;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const pickN = (arr, n) => {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  return out;
};
const chance = (p) => rnd() < p;

/* ---------------------------- reference pools ---------------------------- */

const BRANCH_CODES = ['COMP', 'IT', 'EXTC', 'CIVIL'];

const BRANCH_ALIASES = {
  'Computer Science': 'COMP',
  'Computer Engineering': 'COMP',
  'Information Technology': 'IT',
  Electronics: 'EXTC',
  'Electronics and Telecommunication': 'EXTC',
  'Civil Engineering': 'CIVIL',
  'Mechanical Engineering': 'MECH',
};

const SKILLS_BY_BRANCH = {
  COMP: ['JavaScript', 'React', 'Node.js', 'Python', 'System Design', 'AWS', 'Docker', 'PostgreSQL', 'TypeScript', 'Kubernetes', 'Machine Learning', 'Java', 'Spring Boot', 'Data Structures'],
  IT: ['SQL', 'Power BI', 'Azure', 'Python', 'ETL', 'Tableau', 'Linux', 'Networking', 'Cybersecurity', 'ServiceNow', 'Salesforce', 'Excel', 'Data Analysis'],
  EXTC: ['Embedded C', 'VLSI', 'MATLAB', 'IoT', 'PCB Design', 'RF Design', 'Verilog', 'Signal Processing', 'ARM Cortex', 'Python', 'Firmware'],
  CIVIL: ['AutoCAD', 'STAAD Pro', 'Revit', 'Project Planning', 'Quantity Surveying', 'Primavera', 'Site Supervision', 'Structural Analysis', 'GIS', 'Estimation'],
  MECH: ['SolidWorks', 'AutoCAD', 'CATIA', 'Ansys', 'Lean Manufacturing', 'GD&T', 'Thermodynamics', 'CNC Programming'],
};

const DESIGNATIONS_BY_BRANCH = {
  COMP: ['Software Engineer', 'Senior Software Engineer', 'Full Stack Developer', 'Engineering Manager', 'Backend Engineer', 'SDE II', 'Tech Lead', 'Data Engineer', 'DevOps Engineer', 'Principal Engineer'],
  IT: ['Systems Analyst', 'Data Analyst', 'Cloud Engineer', 'IT Consultant', 'Business Analyst', 'Security Engineer', 'Product Analyst', 'Technical Program Manager'],
  EXTC: ['Embedded Engineer', 'Hardware Design Engineer', 'VLSI Engineer', 'IoT Engineer', 'RF Engineer', 'Firmware Lead', 'Test Engineer'],
  CIVIL: ['Site Engineer', 'Structural Engineer', 'Project Engineer', 'Planning Engineer', 'Quantity Surveyor', 'Construction Manager', 'Design Engineer'],
  MECH: ['Design Engineer', 'Production Engineer', 'Quality Engineer', 'Maintenance Manager', 'CAE Analyst'],
};

const INDUSTRIES = ['Information Technology', 'Financial Services', 'Manufacturing', 'Construction & Infrastructure', 'Consulting', 'Telecommunications', 'E-commerce', 'Healthcare Technology', 'Automotive', 'Energy'];

const LOCATIONS = ['Mumbai', 'Pune', 'Bangalore', 'Hyderabad', 'Thane', 'Navi Mumbai', 'Chennai', 'Gurugram', 'Noida', 'Ahmedabad', 'Palghar', 'Vasai'];

const TARGET_ROLES_BY_BRANCH = {
  COMP: ['Software Engineer', 'Full Stack Developer', 'Data Engineer', 'Backend Engineer', 'Machine Learning Engineer'],
  IT: ['Data Analyst', 'Cloud Engineer', 'Business Analyst', 'Security Engineer'],
  EXTC: ['Embedded Engineer', 'VLSI Engineer', 'IoT Engineer', 'Hardware Design Engineer'],
  CIVIL: ['Site Engineer', 'Structural Engineer', 'Planning Engineer', 'Project Engineer'],
  MECH: ['Design Engineer', 'Production Engineer', 'CAE Analyst'],
};

const BIO_TEMPLATES = [
  'Started out at {first} and now leading {focus} work at {company}. Happy to talk through interview prep and the first two years on the job.',
  '{years} years in {industry}. I care a lot about helping juniors from SJCEM get their first break — ask me about portfolios and referrals.',
  'Working on {focus} at {company}. I mentor two students a semester and run mock interviews most weekends.',
  'SJCEM {branch}, class of {batch}. Moved from {first} into {company}. Open to referrals for roles I can genuinely vouch for.',
  'Building {focus} systems at {company}. If you are trying to break into {industry}, I can help you sanity-check your plan.',
];

const FOCUS = ['distributed', 'payments', 'data platform', 'infrastructure', 'front-of-house', 'analytics', 'embedded', 'structural design', 'automation'];

const REQUEST_MESSAGES = {
  mentorship: [
    'I am in my pre-final year targeting {role} roles and I would really value 30 minutes of your time to review my plan for the next six months.',
    'I have been following the path you took from SJCEM into {company}. Could you mentor me through my preparation this semester?',
    'I want to move into {industry} after graduating and I am unsure which skills to prioritise. Would you be open to mentoring me?',
  ],
  mock_interview: [
    'I have an on-campus interview for a {role} position in three weeks. Would you be willing to run a mock interview and give me honest feedback?',
    'Could I book a mock technical round with you? I struggle most with system design questions and want a realistic dry run.',
    'I would really appreciate a mock interview focused on {role} fundamentals — I can share my resume beforehand.',
  ],
  referral: [
    'I noticed {company} has openings for {role}. My profile matches the requirements closely — would you consider referring me?',
    'I have applied to {company} for a {role} position. If my profile looks reasonable to you, a referral would mean a great deal.',
    'Would you be open to reviewing my resume for a {role} referral at {company}? I am happy to make any changes you suggest first.',
  ],
  internship: [
    'I am looking for a summer internship in {industry} and {company} is my first choice. Does your team take interns this cycle?',
    'Are there internship openings on your team for a {role} track? I can commit to a full six-month term.',
    'I would like to intern at {company} this summer. Could you point me to the right team or hiring manager?',
  ],
};

const RESPONSE_NOTES = {
  accepted: [
    'Happy to help. Send me your resume and I will share a slot for next week.',
    'Sounds good — ping me on LinkedIn and we will set up a call this weekend.',
    'Yes, let us do this. Please come with two or three specific questions.',
  ],
  declined: [
    'I am stretched thin this quarter. Please do reach out again after March.',
    'Referrals at my company are limited to roles I directly work with, so I cannot help on this one.',
    'I am not the right person for this track — try someone in the data org instead.',
  ],
};

const OPPORTUNITY_TEMPLATES = [
  { type: 'job', title: 'Software Engineer I', skills: ['JavaScript', 'React', 'Node.js'], desc: 'Join a product team building customer-facing web applications. You will own features end to end, from design review through rollout. We look for strong fundamentals over years of experience.' },
  { type: 'job', title: 'Backend Engineer (Java)', skills: ['Java', 'Spring Boot', 'PostgreSQL'], desc: 'Work on the transaction processing core. Expect high-volume services, careful schema design, and a strong review culture. Prior internship experience is a plus but not required.' },
  { type: 'internship', title: 'Software Engineering Intern', skills: ['Python', 'Data Structures', 'SQL'], desc: 'Six-month internship with a dedicated mentor and a scoped project that ships. Strong performers receive full-time offers at the end of the term.' },
  { type: 'job', title: 'Data Analyst', skills: ['SQL', 'Power BI', 'Excel'], desc: 'Support the commercial team with reporting and analysis. You will build dashboards, answer ad-hoc questions, and gradually own a reporting domain.' },
  { type: 'internship', title: 'Site Engineering Intern', skills: ['AutoCAD', 'Site Supervision'], desc: 'Hands-on internship at an active infrastructure site. You will shadow the project engineer, learn quantity estimation, and take part in daily progress reviews.' },
  { type: 'job', title: 'Embedded Firmware Engineer', skills: ['Embedded C', 'ARM Cortex', 'Firmware'], desc: 'Own firmware for a family of connected devices. Comfort with a debugger and an oscilloscope matters more than framework knowledge here.' },
  { type: 'job', title: 'Cloud Support Engineer', skills: ['AWS', 'Linux', 'Networking'], desc: 'Front-line engineering support for enterprise cloud customers. Rotating shifts, strong escalation support, and a clear path into platform engineering.' },
  { type: 'job', title: 'Structural Design Engineer', skills: ['STAAD Pro', 'Structural Analysis', 'Revit'], desc: 'Design and detail RCC and steel structures for commercial projects. You will work directly with the principal engineer on drawings that go to site.' },
  { type: 'internship', title: 'Data Engineering Intern', skills: ['Python', 'SQL', 'ETL'], desc: 'Build and maintain ingestion pipelines feeding the analytics warehouse. Expect real production data and real code review.' },
  { type: 'job', title: 'QA Automation Engineer', skills: ['Python', 'TypeScript', 'Docker'], desc: 'Own the regression suite for a large web platform. You will decide what gets automated and where manual testing still earns its place.' },
  { type: 'job', title: 'Project Planning Engineer', skills: ['Primavera', 'Project Planning', 'Estimation'], desc: 'Own schedules and progress tracking across two live sites. Suits someone who enjoys turning messy site updates into a plan people can act on.' },
  { type: 'internship', title: 'VLSI Design Intern', skills: ['Verilog', 'VLSI', 'MATLAB'], desc: 'Work alongside the physical design team on block-level implementation. Good grounding in digital design is essential.' },
];

/* --------------------------------- helpers -------------------------------- */

async function fetchAll(table, columns, build) {
  let out = [];
  let from = 0;
  for (;;) {
    let q = db.from(table).select(columns).range(from, from + 999);
    if (build) q = build(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out = out.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

const daysAgo = (n) => new Date(Date.now() - n * 86400_000).toISOString();

function branchOf(raw) {
  return BRANCH_ALIASES[raw] ?? (BRANCH_CODES.includes(raw) ? raw : 'COMP');
}

/* ---------------------------------- steps --------------------------------- */

async function normaliseBranches() {
  const rows = await fetchAll('alumni_records', 'id, branch');
  const fixes = rows
    .filter((r) => BRANCH_ALIASES[r.branch])
    .map((r) => ({ id: r.id, branch: BRANCH_ALIASES[r.branch] }));
  for (const f of fixes) {
    await db.from('alumni_records').update({ branch: f.branch }).eq('id', f.id);
  }
  console.log(`branches normalised: ${fixes.length}`);
}

async function seedAlumniProfiles() {
  const alumniUsers = await fetchAll('users', 'id, full_name, email', (q) => q.eq('role', 'alumni'));
  const companies = await fetchAll('companies', 'id, name');
  const existingProfiles = await fetchAll('alumni_profiles', 'user_id');
  const claimed = new Set(existingProfiles.map((p) => p.user_id));

  // Records that are still free to claim, biased toward recent batches so the
  // directory's claimed set spans the years students actually care about.
  const freeRecords = await fetchAll(
    'alumni_records',
    'id, full_name, branch, batch_year, first_company_id, city',
    (q) => q.eq('claim_status', 'unclaimed').gte('batch_year', 2013).order('batch_year', { ascending: false })
  );

  let cursor = 0;
  const profileRows = [];
  const recordUpdates = [];
  const userUpdates = [];

  for (const user of alumniUsers) {
    let recordId;
    let record;

    if (claimed.has(user.id)) {
      // Already linked — refresh the profile so it is no longer a stub.
      const { data } = await db
        .from('alumni_records')
        .select('id, full_name, branch, batch_year, first_company_id')
        .eq('claimed_by', user.id)
        .maybeSingle();
      if (!data) continue;
      record = data;
      recordId = data.id;
    } else {
      // Claim a genuine institutional record for this account.
      record = freeRecords[cursor++];
      if (!record) break;
      recordId = record.id;
      recordUpdates.push({ id: recordId, user_id: user.id });
      // Keep the account name in step with the institutional record.
      userUpdates.push({ id: user.id, full_name: record.full_name });
    }

    const branch = branchOf(record.branch);
    const skillPool = SKILLS_BY_BRANCH[branch] ?? SKILLS_BY_BRANCH.COMP;
    const company = pick(companies);
    const firstCompany = record.first_company_id
      ? companies.find((c) => c.id === record.first_company_id)
      : null;
    const experience = Math.max(1, 2026 - (record.batch_year ?? 2018));
    const designation = pick(DESIGNATIONS_BY_BRANCH[branch] ?? DESIGNATIONS_BY_BRANCH.COMP);
    const industry = pick(INDUSTRIES);
    const focus = pick(FOCUS);

    const bio = pick(BIO_TEMPLATES)
      .replace('{company}', company.name)
      .replace('{first}', firstCompany?.name ?? 'a small services firm')
      .replace('{years}', String(experience))
      .replace('{industry}', industry)
      .replace('{focus}', focus)
      .replace('{branch}', branch)
      .replace('{batch}', String(record.batch_year));

    profileRows.push({
      user_id: user.id,
      record_id: recordId,
      current_company_id: company.id,
      designation,
      industry,
      location: pick(LOCATIONS),
      experience_years: experience,
      skills: pickN(skillPool, 3 + Math.floor(rnd() * 4)),
      linkedin_url: `https://www.linkedin.com/in/${(record.full_name ?? 'alumnus')
        .toLowerCase()
        .replace(/[^a-z]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 28)}`,
      bio,
      mentorship_available: chance(0.62),
      mock_interview_available: chance(0.45),
      referral_available: chance(0.38),
      internship_available: chance(0.3),
      updated_at: daysAgo(Math.floor(rnd() * 120)),
    });
  }

  for (const u of recordUpdates) {
    await db
      .from('alumni_records')
      .update({
        claim_status: 'claimed',
        claimed_by: u.user_id,
        claimed_at: daysAgo(Math.floor(rnd() * 200) + 5),
      })
      .eq('id', u.id);
  }
  for (const u of userUpdates) {
    await db.from('users').update({ full_name: u.full_name }).eq('id', u.id);
  }

  for (let i = 0; i < profileRows.length; i += 100) {
    const { error } = await db
      .from('alumni_profiles')
      .upsert(profileRows.slice(i, i + 100), { onConflict: 'user_id' });
    if (error) throw new Error(`alumni_profiles: ${error.message}`);
  }
  console.log(`alumni profiles written: ${profileRows.length} (${recordUpdates.length} new claims)`);
  return profileRows;
}

async function verifySome() {
  // Move roughly half the claimed records to `verified` and leave the rest as a
  // live queue for the admin, so the console has both history and work to do.
  const claimed = await fetchAll('alumni_records', 'id', (q) => q.eq('claim_status', 'claimed'));
  const { data: admin } = await db.from('users').select('id').eq('role', 'admin').limit(1).maybeSingle();
  if (!admin) return;

  const toVerify = claimed.slice(0, Math.floor(claimed.length * 0.55));
  for (const r of toVerify) {
    await db
      .from('alumni_records')
      .update({ claim_status: 'verified', verified_by: admin.id, verified_at: daysAgo(Math.floor(rnd() * 60)) })
      .eq('id', r.id);
    await db.from('audit_log').insert({
      actor_id: admin.id,
      action: 'mark_verified',
      target_type: 'alumni_records',
      target_id: r.id,
      detail: { reason: 'Institutional record matched claim details.' },
    });
  }
  console.log(`records verified: ${toVerify.length}, still pending: ${claimed.length - toVerify.length}`);
}

async function seedStudentProfiles() {
  const students = await fetchAll('users', 'id, full_name', (q) => q.eq('role', 'student'));
  const companies = await fetchAll('companies', 'id, name', (q) => q.limit(1000));
  const bigCompanies = companies.filter((c) => c.name.length < 26);

  const rows = students.map((s, i) => {
    const branch = BRANCH_CODES[i % BRANCH_CODES.length];
    const pool = SKILLS_BY_BRANCH[branch];
    return {
      user_id: s.id,
      branch,
      batch_year: 2026 + (i % 3), // graduating 2026–2028
      skills: pickN(pool, 3 + Math.floor(rnd() * 3)),
      target_role: pick(TARGET_ROLES_BY_BRANCH[branch]),
      target_company: pick(bigCompanies)?.name ?? 'Infosys',
      target_industry: pick(INDUSTRIES),
      location_pref: pick(LOCATIONS),
      resume_url: null,
      updated_at: daysAgo(Math.floor(rnd() * 90)),
    };
  });

  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await db
      .from('student_profiles')
      .upsert(rows.slice(i, i + 100), { onConflict: 'user_id' });
    if (error) throw new Error(`student_profiles: ${error.message}`);
  }
  console.log(`student profiles written: ${rows.length}`);
  return rows;
}

async function seedOpportunities() {
  const { count } = await db.from('opportunities').select('*', { count: 'exact', head: true });
  if ((count ?? 0) > 8) {
    console.log(`opportunities already seeded (${count})`);
    return;
  }

  const posters = await fetchAll('alumni_profiles', 'user_id, current_company_id, location');
  const rows = [];
  for (let i = 0; i < 26; i++) {
    const t = OPPORTUNITY_TEMPLATES[i % OPPORTUNITY_TEMPLATES.length];
    const poster = pick(posters);
    if (!poster) break;
    rows.push({
      posted_by: poster.user_id,
      type: t.type,
      title: t.title,
      description: t.desc,
      company_id: poster.current_company_id,
      location: `${poster.location ?? pick(LOCATIONS)}${chance(0.4) ? ' (Hybrid)' : chance(0.3) ? ' (Remote)' : ''}`,
      target_skills: t.skills,
      application_link: chance(0.7) ? 'https://careers.example.com/apply' : null,
      is_open: chance(0.85),
      created_at: daysAgo(Math.floor(rnd() * 75)),
    });
  }
  const { error } = await db.from('opportunities').insert(rows);
  if (error) throw new Error(`opportunities: ${error.message}`);
  console.log(`opportunities written: ${rows.length}`);
}

async function seedRequests() {
  const { count } = await db.from('requests').select('*', { count: 'exact', head: true });
  if ((count ?? 0) > 20) {
    console.log(`requests already seeded (${count})`);
    return;
  }

  const students = await fetchAll('student_profiles', 'user_id, target_role, target_company, target_industry');
  const alumni = await fetchAll(
    'alumni_profiles',
    'user_id, designation, industry, mentorship_available, mock_interview_available, referral_available, internship_available, current_company:companies!current_company_id(name)'
  );
  if (!students.length || !alumni.length) return;

  const types = ['mentorship', 'mock_interview', 'referral', 'internship'];
  const seen = new Set();
  const rows = [];

  for (let i = 0; i < 140; i++) {
    const s = pick(students);
    const a = pick(alumni);
    const type = pick(types);
    const key = `${s.user_id}|${a.user_id}|${type}`;
    if (s.user_id === a.user_id || seen.has(key)) continue;
    seen.add(key);

    const company = Array.isArray(a.current_company)
      ? a.current_company[0]?.name
      : a.current_company?.name;

    const message = pick(REQUEST_MESSAGES[type])
      .replace('{role}', s.target_role ?? 'engineering')
      .replace('{company}', company ?? 'your company')
      .replace('{industry}', s.target_industry ?? 'technology');

    const createdDaysAgo = Math.floor(rnd() * 90) + 1;
    // Weight toward resolved requests so charts and history have shape, but
    // keep a meaningful pending queue for the alumni inbox.
    const roll = rnd();
    const status = roll < 0.32 ? 'pending' : roll < 0.68 ? 'accepted' : roll < 0.88 ? 'declined' : 'closed';

    rows.push({
      student_id: s.user_id,
      alumni_id: a.user_id,
      type,
      message: message.length < 20 ? message.padEnd(24, '.') : message.slice(0, 500),
      status,
      match_score: Math.floor(rnd() * 70) + 20,
      response_note:
        status === 'accepted' || status === 'declined' ? pick(RESPONSE_NOTES[status]) : null,
      created_at: daysAgo(createdDaysAgo),
      responded_at:
        status === 'pending' ? null : daysAgo(Math.max(0, createdDaysAgo - Math.floor(rnd() * 6) - 1)),
    });
  }

  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await db.from('requests').insert(rows.slice(i, i + 50));
    if (error) console.warn(`requests batch skipped: ${error.message}`);
  }
  const { count: after } = await db.from('requests').select('*', { count: 'exact', head: true });
  console.log(`requests written: ${after}`);
}

async function seedEngagement() {
  const { count } = await db.from('engagement_events').select('*', { count: 'exact', head: true });
  if ((count ?? 0) > 50) {
    console.log(`engagement events already seeded (${count})`);
    return;
  }
  const users = await fetchAll('users', 'id, role');
  const kinds = ['login', 'profile_updated', 'request_responded', 'opportunity_posted', 'claim_completed'];
  const rows = [];
  for (let i = 0; i < 600; i++) {
    const u = pick(users);
    rows.push({
      user_id: u.id,
      event_type: pick(kinds),
      metadata: { role: u.role },
      created_at: daysAgo(Math.floor(rnd() * 120)),
    });
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from('engagement_events').insert(rows.slice(i, i + 200));
    if (error) console.warn(`engagement batch skipped: ${error.message}`);
  }
  console.log(`engagement events written: ${rows.length}`);
}

async function main() {
  console.log('— seeding demo activity —');
  await normaliseBranches();
  await seedAlumniProfiles();
  await verifySome();
  await seedStudentProfiles();
  await seedOpportunities();
  await seedRequests();
  await seedEngagement();
  console.log('— done —');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
