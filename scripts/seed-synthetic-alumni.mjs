/**
 * Adds 500 synthetic alumni with complete profiles, so students have a wide
 * range of people to match with and contact.
 *
 * Every identity here is made up. The real institutional records are only read,
 * for their overall patterns: how alumni split across branches, batches and
 * home towns, and which employers, first roles and starting salaries each
 * branch placed into. No real person's row is copied, and no real name, email
 * or phone number is used.
 *
 * What it adds, all tagged so purge-synthetic-alumni.mjs can remove it:
 *   - alumni_records with student_id 'SYNTH_0001' … 'SYNTH_0500'
 *   - one auth user, users row and complete alumni_profiles row for each, with
 *     an @example.com login (a reserved domain that can never receive mail)
 *
 * All accounts share one password, SYNTHETIC_ALUMNI_PASSWORD in .env.local.
 * If it is missing, --commit generates one and appends it there.
 *
 *   node scripts/seed-synthetic-alumni.mjs           # dry run, prints samples
 *   node scripts/seed-synthetic-alumni.mjs --commit  # actually writes
 */
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';

const COMMIT = process.argv.includes('--commit');
const COUNT = 500;
const NOW_YEAR = 2026;

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
// mulberry32: a plain LCG's consecutive draws are correlated enough to put
// whole runs of people in the same city.
let seed = 20261023;
function rnd() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const pickN = (arr, n) => {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  return out;
};
const chance = (p) => rnd() < p;
/** Draw from a list in proportion to how often each value occurs in it. */
const sample = (values) => values[Math.floor(rnd() * values.length)];

/* ------------------------------ name pools ------------------------------- */
// Records store names as "Surname First Father Mother"; synthetic ones follow suit.

const SURNAMES = [
  'Patil', 'Raut', 'Vartak', 'Mhatre', 'Gharat', 'Naik', 'Save', 'Churi', 'Jadhav', 'Pawar',
  'Shinde', 'More', 'Gaikwad', 'Kulkarni', 'Deshmukh', 'Joshi', 'Desai', 'Mehta', 'Shah', 'Gupta',
  'Pandey', 'Mishra', 'Dubey', 'Yadav', 'Thakur', 'Singh', 'Shetty', 'Rao', 'Nair', 'Pillai',
  'Menon', "D'souza", 'Fernandes', 'Pereira', 'Rodrigues', 'Dsilva', 'Lopes', 'Gonsalves', 'Mendonca', 'Bhoir',
  'Kini', 'Pai', 'Sawant', 'Rane', 'Parab', 'Chavan', 'Mane', 'Bhosale', 'Kadam', 'Salvi',
  'Vaze', 'Bhatt', 'Trivedi', 'Chaudhari', 'Wagh', 'Tandel', 'Koli', 'Dhodi', 'Vaity', 'Kamble',
];
const MALE_NAMES = [
  'Aarav', 'Aditya', 'Akash', 'Amey', 'Aniket', 'Ankit', 'Arjun', 'Atharva', 'Chinmay', 'Darshan',
  'Deep', 'Dhruv', 'Gaurav', 'Harsh', 'Ishaan', 'Jay', 'Karan', 'Kunal', 'Manas', 'Mihir',
  'Nikhil', 'Nilesh', 'Omkar', 'Parth', 'Pranav', 'Prathamesh', 'Rahul', 'Rohan', 'Sahil', 'Sanket',
  'Saurabh', 'Shreyas', 'Siddharth', 'Soham', 'Tanmay', 'Tejas', 'Varun', 'Vedant', 'Vivek', 'Yash',
  'Ryan', 'Jovin', 'Kevin', 'Nigel', 'Clinton', 'Aditya', 'Yogesh', 'Swapnil', 'Abhishek', 'Ritesh',
];
const FEMALE_NAMES = [
  'Aditi', 'Aishwarya', 'Ankita', 'Anushka', 'Bhakti', 'Divya', 'Gauri', 'Isha', 'Janhavi', 'Kavya',
  'Ketaki', 'Komal', 'Mansi', 'Megha', 'Mrunal', 'Neha', 'Nikita', 'Pooja', 'Pranali', 'Priya',
  'Rutuja', 'Sakshi', 'Sayali', 'Shivani', 'Shruti', 'Sneha', 'Snehal', 'Tanvi', 'Tejal', 'Vaishnavi',
  'Riya', 'Sharon', 'Leona', 'Glenda', 'Nirali', 'Hetal', 'Dhwani', 'Khushi', 'Prachi', 'Rashmi',
];
const FATHER_NAMES = [
  'Ramesh', 'Suresh', 'Mahesh', 'Prakash', 'Dilip', 'Vijay', 'Sanjay', 'Anil', 'Sunil', 'Ashok',
  'Rajesh', 'Vinod', 'Santosh', 'Pradeep', 'Ravindra', 'Narayan', 'Shrikant', 'Mohan', 'Arvind', 'Deepak',
  'Joseph', 'Francis', 'Anthony', 'Paresh', 'Kishor', 'Bharat', 'Dinesh', 'Hemant', 'Manoj', 'Subhash',
];
const MOTHER_NAMES = [
  'Sunita', 'Anita', 'Savita', 'Manisha', 'Swati', 'Vaishali', 'Kavita', 'Jyoti', 'Asha', 'Rekha',
  'Meena', 'Sangeeta', 'Varsha', 'Ujwala', 'Nileema', 'Shobha', 'Archana', 'Pushpa', 'Mary', 'Lata',
  'Smita', 'Rupali', 'Seema', 'Jayshri', 'Vandana', 'Kalpana', 'Shalini', 'Pratibha', 'Vimla', 'Ruchita',
];

/* ---------------------------- career pools ------------------------------- */

const SKILLS = {
  COMP: {
    core: ['Java', 'Python', 'JavaScript', 'TypeScript', 'SQL', 'Data Structures', 'Git'],
    web: ['React', 'Node.js', 'Next.js', 'REST APIs', 'HTML/CSS', 'Spring Boot', 'PostgreSQL'],
    cloud: ['AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Linux', 'Terraform'],
    data: ['Machine Learning', 'Pandas', 'Spark', 'Data Engineering', 'Power BI'],
  },
  IT: {
    core: ['SQL', 'Python', 'Java', 'Linux', 'Networking', 'Excel'],
    web: ['React', 'Node.js', 'REST APIs', 'Salesforce', 'ServiceNow'],
    cloud: ['Azure', 'AWS', 'DevOps', 'Cybersecurity', 'ITIL'],
    data: ['Power BI', 'Tableau', 'ETL', 'Data Analysis', 'Business Analysis'],
  },
  EXTC: {
    core: ['Embedded C', 'MATLAB', 'Signal Processing', 'Microcontrollers', 'Python'],
    web: ['IoT', 'Firmware', 'ARM Cortex', 'RTOS', 'PCB Design'],
    cloud: ['VLSI', 'Verilog', 'RF Design', 'Telecom Networks', '5G'],
    data: ['Testing & Validation', 'LabVIEW', 'Networking', 'SQL'],
  },
  CIVIL: {
    core: ['AutoCAD', 'Estimation', 'Site Supervision', 'Quantity Surveying'],
    web: ['STAAD Pro', 'ETABS', 'Structural Analysis', 'Revit'],
    cloud: ['Primavera', 'MS Project', 'Project Planning', 'Contract Management'],
    data: ['GIS', 'Surveying', 'Billing', 'Quality Control'],
  },
};
const SENIOR_SKILLS = ['Team Leadership', 'Mentoring', 'Stakeholder Management', 'Hiring', 'Agile'];

// Designations by branch and seniority (0–2, 3–5, 6–9, 10+ years).
const DESIGNATIONS = {
  COMP: [
    ['Software Engineer', 'Associate Software Engineer', 'Software Developer', 'Systems Engineer', 'Junior Data Analyst'],
    ['Senior Software Engineer', 'Full Stack Developer', 'Backend Engineer', 'Data Engineer', 'SDE II', 'DevOps Engineer'],
    ['Tech Lead', 'Lead Software Engineer', 'Senior Data Engineer', 'Solutions Architect', 'Staff Engineer'],
    ['Engineering Manager', 'Principal Engineer', 'Senior Architect', 'Director of Engineering'],
  ],
  IT: [
    ['Systems Engineer', 'Associate Consultant', 'Data Analyst', 'Support Engineer', 'Software Developer'],
    ['Business Analyst', 'Cloud Engineer', 'Senior Systems Analyst', 'Security Analyst', 'Consultant'],
    ['Technical Lead', 'Senior Consultant', 'Cloud Architect', 'Product Manager', 'Project Manager'],
    ['Delivery Manager', 'Technical Program Manager', 'Principal Consultant', 'IT Manager'],
  ],
  EXTC: [
    ['Graduate Engineer Trainee', 'Embedded Engineer', 'Network Engineer', 'Test Engineer', 'Software Engineer'],
    ['Senior Embedded Engineer', 'Firmware Engineer', 'RF Engineer', 'VLSI Design Engineer', 'IoT Engineer'],
    ['Firmware Lead', 'Lead Hardware Engineer', 'Senior Network Architect', 'Verification Lead'],
    ['Engineering Manager', 'Principal Hardware Engineer', 'Head of Embedded Systems'],
  ],
  CIVIL: [
    ['Site Engineer', 'Graduate Engineer Trainee', 'Junior Engineer', 'Billing Engineer', 'Design Engineer'],
    ['Project Engineer', 'Structural Engineer', 'Planning Engineer', 'Quantity Surveyor', 'Senior Site Engineer'],
    ['Project Manager', 'Senior Structural Engineer', 'Construction Manager', 'Planning Manager'],
    ['Senior Project Manager', 'Head of Projects', 'Principal Structural Engineer', 'General Manager - Projects'],
  ],
};

const DEFAULT_INDUSTRY = {
  COMP: ['Information Technology', 'Information Technology', 'Financial Services', 'E-commerce', 'Consulting'],
  IT: ['Information Technology', 'Information Technology', 'Consulting', 'Financial Services', 'Healthcare Technology'],
  EXTC: ['Telecommunications', 'Electronics & Semiconductors', 'Information Technology', 'Automotive'],
  CIVIL: ['Construction & Infrastructure', 'Construction & Infrastructure', 'Real Estate', 'Consulting'],
};

const INDUSTRY_HINTS = [
  [/bank|capital|financ|insur|securities|credit|fintech|invest|hdfc|icici|kotak|axis/i, 'Financial Services'],
  [/consult|deloitte|kpmg|pwc|accenture|ernst|capgemini/i, 'Consulting'],
  [/construct|infra|build|realty|developers|cement|engineering co|l&t|larsen/i, 'Construction & Infrastructure'],
  [/telecom|jio|airtel|vodafone|network/i, 'Telecommunications'],
  [/health|pharma|hospital|med/i, 'Healthcare Technology'],
  [/tech|infotech|software|systems|consultancy|solutions|infosys|wipro|capgemini|cognizant|mahindra|digital|data|labs/i, 'Information Technology'],
];

const WORK_LOCATIONS = [
  ['Mumbai', 30], ['Pune', 14], ['Bangalore', 11], ['Thane', 7], ['Navi Mumbai', 6], ['Hyderabad', 6],
  ['Vasai', 4], ['Palghar', 3], ['Borivali', 3], ['Andheri', 4], ['Chennai', 3], ['Gurugram', 2],
  ['Noida', 2], ['Ahmedabad', 2], ['Remote', 3],
].flatMap(([city, weight]) => Array(weight).fill(city));

const FOCUS = {
  COMP: ['backend services', 'web platforms', 'data pipelines', 'cloud infrastructure', 'payments systems', 'developer tooling'],
  IT: ['cloud migration', 'analytics and reporting', 'enterprise applications', 'security operations', 'IT service delivery'],
  EXTC: ['embedded firmware', 'connected devices', 'chip verification', 'telecom networks', 'hardware testing'],
  CIVIL: ['residential towers', 'metro and road projects', 'structural design', 'project planning', 'industrial sites'],
};

const BIOS = [
  'SJCEM {branch}, class of {batch}. {years} at {company}, working on {focus}. Happy to help with interview prep and choosing your first job.',
  'Started at {first} and now at {company} as {designation}. Ask me about {focus}, building a resume that gets shortlisted, and the first year on the job.',
  'I work on {focus} at {company}. I enjoy running mock interviews and giving honest feedback on projects and resumes.',
  '{years} in {industry}. I remember how confusing placements felt at SJCEM, so I try to make time for juniors who reach out.',
  '{designation} at {company}. Open to mentoring students who are serious about {focus}; referrals only for roles I can genuinely vouch for.',
  'Moved from {first} to {company} after {switchYears}. Glad to talk about switching jobs, higher studies versus working, and getting into {industry}.',
];

// Placement-sheet entries that are not employers.
const NOT_AN_EMPLOYER =
  /family business|^business$|own business|self employed|freelanc|higher studies|plac(e)?ments?|available for|not interested|got married|college|institute|squad|govt|iskcon/i;

// First roles as the placement sheet wrote them: expand the common codes, tidy
// shouting, and drop what cannot be read as a role.
const ROLE_CODES = {
  GET: 'Graduate Engineer Trainee',
  GTE: 'Graduate Trainee Engineer',
  GAT: 'Graduate Apprentice Trainee',
  QA: 'QA Engineer',
  BA: 'Business Analyst',
  BDE: 'Business Development Executive',
  BDM: 'Business Development Manager',
};
function cleanRole(role) {
  if (!role) return null;
  const r = role.trim();
  if (ROLE_CODES[r.toUpperCase()]) return ROLE_CODES[r.toUpperCase()];
  if (r.length < 4 || /[()]|employee|syntel/i.test(r)) return null;
  return r === r.toUpperCase() ? r.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : r;
}

/* ------------------------------- helpers -------------------------------- */

async function fetchAll(table, columns, build = (q) => q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(db.from(table).select(columns)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

/**
 * An interrupted run can leave a record with no profile, or an account with no
 * record. Remove both so that person is created again from scratch.
 */
async function cleanUpPartialRun() {
  const records = await fetchAll('alumni_records', 'id, claimed_by, alumni_profiles(id)', (q) => q.like('student_id', 'SYNTH_%'));
  const bare = records.filter((r) => !r.alumni_profiles || r.alumni_profiles.length === 0);
  if (bare.length) {
    await db.from('alumni_records').delete().in('id', bare.map((r) => r.id));
    console.log(`removed ${bare.length} record(s) left without a profile`);
  }
  const withRecord = new Set(records.filter((r) => !bare.includes(r)).map((r) => r.claimed_by));
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth users: ${error.message}`);
    for (const u of data.users) {
      if (u.user_metadata?.synthetic === true && !withRecord.has(u.id)) {
        await db.auth.admin.deleteUser(u.id);
        console.log(`removed half-created account ${u.email}`);
      }
    }
    if (data.users.length < 1000) break;
  }
}

const level = (years) => (years <= 2 ? 0 : years <= 5 ? 1 : years <= 9 ? 2 : 3);
const yearsText = (n) => (n <= 0 ? 'Less than a year' : n === 1 ? 'A year' : `${n} years`);
const ascii = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k]);

function industryFor(company, branch) {
  if (company?.industry) return company.industry;
  const hint = INDUSTRY_HINTS.find(([re]) => re.test(company?.name ?? ''));
  return hint ? hint[1] : pick(DEFAULT_INDUSTRY[branch]);
}

function skillsFor(branch, lvl, designation) {
  const pools = SKILLS[branch];
  const d = designation.toLowerCase();
  // Lean on the pool that fits the role, then fill from the rest of the branch.
  const lean =
    /data|analyst|bi\b/.test(d) ? pools.data
    : /cloud|devops|security|network|vlsi|rf|verification|architect/.test(d) ? pools.cloud
    : /full stack|backend|web|firmware|iot|embedded|structural|design/.test(d) ? pools.web
    : pools.core;
  const picked = new Set([...pickN(lean, 3), ...pickN(pools.core, 2)]);
  for (const s of pickN([...pools.web, ...pools.cloud, ...pools.data], 2)) if (chance(0.6)) picked.add(s);
  if (lvl >= 2) for (const s of pickN(SENIOR_SKILLS, lvl - 1)) picked.add(s);
  return [...picked].slice(0, 8);
}

/* --------------------------------- main --------------------------------- */

async function main() {
  console.log(COMMIT ? 'COMMIT: writing synthetic alumni.' : 'Dry run: nothing is written. Pass --commit to write.');
  if (COMMIT) await cleanUpPartialRun();

  const real = await fetchAll(
    'alumni_records',
    'full_name, branch, batch_year, city, first_company_id, first_role, first_ctc_lpa',
    (q) => q.not('student_id', 'like', 'MOCK_%').not('student_id', 'like', 'SYNTH_%')
  );
  const companies = new Map(
    (await fetchAll('companies', 'id, name, industry')).filter((c) => !NOT_AN_EMPLOYER.test(c.name)).map((c) => [c.id, c])
  );
  const existing = new Set(
    (await fetchAll('alumni_records', 'student_id', (q) => q.like('student_id', 'SYNTH_%'))).map((r) => r.student_id)
  );
  const { data: admin } = await db.from('users').select('id').eq('role', 'admin').limit(1).maybeSingle();
  if (!admin) throw new Error('No admin user to mark synthetic records as verified.');

  // Patterns from the real records: one entry per record, so sampling is weighted.
  const realNames = new Set(real.map((r) => r.full_name.toLowerCase()));
  const branches = real.map((r) => r.branch).filter((b) => SKILLS[b]);
  const batchesByBranch = {};
  const placementsByBranch = {};
  const companiesByBranch = {};
  const cities = real.map((r) => r.city).filter(Boolean);
  for (const r of real) {
    if (!SKILLS[r.branch] || r.batch_year >= NOW_YEAR) continue;
    (batchesByBranch[r.branch] ??= []).push(r.batch_year);
    if (r.first_company_id && companies.has(r.first_company_id)) {
      (placementsByBranch[r.branch] ??= []).push({
        company_id: r.first_company_id,
        role: cleanRole(r.first_role),
        ctc: r.first_ctc_lpa,
      });
      (companiesByBranch[r.branch] ??= []).push(r.first_company_id);
    }
  }
  const placedRate = Object.fromEntries(
    Object.keys(SKILLS).map((b) => {
      const all = real.filter((r) => r.branch === b).length;
      return [b, all ? (placementsByBranch[b]?.length ?? 0) / all : 0];
    })
  );
  console.log(`Patterns from ${real.length} real records, ${companies.size} companies.`);
  console.log('On-campus placement rate by branch:', Object.fromEntries(Object.entries(placedRate).map(([b, r]) => [b, r.toFixed(2)])));

  const usedNames = new Set();
  const people = [];
  for (let n = 1; n <= COUNT; n++) {
    const studentId = `SYNTH_${String(n).padStart(4, '0')}`;

    const branch = sample(branches);
    const batch = sample(batchesByBranch[branch]);
    const years = Math.max(0, NOW_YEAR - batch - 1);
    const lvl = level(years);
    const female = chance(0.42);

    let fullName, first, surname;
    do {
      surname = pick(SURNAMES);
      first = pick(female ? FEMALE_NAMES : MALE_NAMES);
      fullName = `${surname} ${first} ${pick(FATHER_NAMES)} ${pick(MOTHER_NAMES)}`;
    } while (realNames.has(fullName.toLowerCase()) || usedNames.has(fullName.toLowerCase()));
    usedNames.add(fullName.toLowerCase());

    // Placement at graduation: about the real on-campus rate, raised a little
    // so more profiles show a career path.
    const placement = chance(Math.min(0.85, placedRate[branch] + 0.35)) ? sample(placementsByBranch[branch]) : null;

    // Current employer: early on most people are still at their first job;
    // the longer since graduation, the likelier a move.
    const stayed = placement && chance([0.75, 0.4, 0.2, 0.1][lvl]);
    const currentId = stayed ? placement.company_id : sample(companiesByBranch[branch]);
    const current = companies.get(currentId);
    const firstCompany = placement ? companies.get(placement.company_id) : null;

    const designation = pick(DESIGNATIONS[branch][lvl]);
    const industry = industryFor(current, branch);
    const skills = skillsFor(branch, lvl, designation);
    const focus = pick(FOCUS[branch]);

    const avail = {
      mentorship_available: chance(0.75),
      mock_interview_available: chance(lvl >= 1 ? 0.6 : 0.35),
      referral_available: chance(lvl >= 1 ? 0.45 : 0.15),
      internship_available: chance(lvl >= 2 ? 0.35 : 0.1),
    };
    if (!Object.values(avail).some(Boolean)) avail.mentorship_available = true;

    const bioTemplates = firstCompany && !stayed ? BIOS : BIOS.filter((t) => !t.includes('{first}') && !t.includes('{switchYears}'));
    const bio = fill(pick(bioTemplates), {
      branch,
      batch,
      years: yearsText(years),
      company: current?.name ?? 'my current company',
      first: firstCompany?.name ?? '',
      switchYears: `${Math.max(1, Math.round(years / 2))} years`,
      designation,
      focus,
      industry,
    });

    people.push({
      studentId,
      email: `${ascii(first)}.${ascii(surname)}.${String(n).padStart(4, '0')}@example.com`,
      record: {
        student_id: studentId,
        full_name: fullName,
        branch,
        batch_year: batch,
        city: sample(cities),
        first_company_id: placement?.company_id ?? null,
        first_role: placement?.role ?? null,
        first_ctc_lpa: placement?.ctc ?? null,
        higher_ed_raw: chance(0.06) ? pick(['M.Tech', 'MBA', 'MS (USA)', 'M.E.', 'MS (Germany)']) : null,
      },
      verified: chance(0.9),
      profile: {
        current_company_id: currentId,
        designation,
        industry,
        location: pick(WORK_LOCATIONS),
        experience_years: years,
        skills,
        linkedin_url: null,
        bio,
        ...avail,
      },
    });
  }

  // Summary and a few samples, so a dry run can be judged before writing.
  const by = (f) => people.reduce((m, p) => ((m[f(p)] = (m[f(p)] ?? 0) + 1), m), {});
  console.log('\nBranches:', by((p) => p.record.branch));
  console.log('Seniority:', by((p) => ['0-2 yrs', '3-5 yrs', '6-9 yrs', '10+ yrs'][level(p.profile.experience_years)]));
  console.log('Verified:', people.filter((p) => p.verified).length, 'of', people.length);
  console.log('Open to mentorship / mock / referral / internship:', ['mentorship', 'mock_interview', 'referral', 'internship']
    .map((k) => people.filter((p) => p.profile[`${k}_available`]).length).join(' / '));
  console.log('Distinct current employers:', new Set(people.map((p) => p.profile.current_company_id)).size);
  for (const p of pickN(people, 3)) {
    console.log('\n', {
      ...p.record,
      email: p.email,
      company: companies.get(p.profile.current_company_id)?.name,
      ...p.profile,
    });
  }

  const todo = people.filter((p) => !existing.has(p.studentId));
  console.log(`\n${existing.size} already present; ${todo.length} to create.`);
  if (!COMMIT || todo.length === 0) return;

  let password = env.SYNTHETIC_ALUMNI_PASSWORD;
  if (!password) {
    password = crypto.randomBytes(12).toString('base64url'); // 16 characters; length is the app's only rule
    const entry = ['SYNTHETIC_ALUMNI_PASSWORD', password].join('=');
    fs.appendFileSync('.env.local', `\n# Shared password for the synthetic @example.com alumni (scripts/seed-synthetic-alumni.mjs)\n${entry}\n`);
    console.log('Generated SYNTHETIC_ALUMNI_PASSWORD and saved it to .env.local.');
  }

  let done = 0;
  const create = async (p) => {
    const { data: created, error: authError } = await db.auth.admin.createUser({
      email: p.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: p.record.full_name, synthetic: true },
    });
    if (authError) throw new Error(`${p.studentId} auth: ${authError.message}`);
    const userId = created.user.id;
    const claimedAt = new Date(Date.now() - Math.floor(rnd() * 150) * 86400000);

    const steps = [
      () => db.from('users').insert({ id: userId, role: 'alumni', full_name: p.record.full_name, email: p.email }),
      async () => {
        const res = await db
          .from('alumni_records')
          .insert({
            ...p.record,
            claim_status: p.verified ? 'verified' : 'claimed',
            claimed_by: userId,
            claimed_at: claimedAt.toISOString(),
            verified_by: p.verified ? admin.id : null,
            verified_at: p.verified ? new Date(claimedAt.getTime() + 2 * 86400000).toISOString() : null,
          })
          .select('id')
          .single();
        p.recordId = res.data?.id;
        return res;
      },
      () => db.from('alumni_profiles').insert({ user_id: userId, record_id: p.recordId, ...p.profile }),
    ];
    for (const step of steps) {
      const { error } = await step();
      if (error) throw new Error(`${p.studentId}: ${error.message} (run purge-synthetic-alumni.mjs --commit to clean up)`);
    }
    if (++done % 50 === 0) console.log(`created ${done} / ${todo.length}`);
  };
  // Each account is four round trips; eight at a time keeps a run to minutes.
  const queue = [...todo];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) await create(queue.shift());
  }));
  console.log(`Done: ${done} synthetic alumni created.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
