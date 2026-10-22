/**
 * Fills the Home feed with posts by the synthetic alumni: mostly openings
 * (jobs, internships, placement drives and referrals, each a real listing on
 * the Jobs page), plus career updates, advice and campus posts, with reactions,
 * comments and reposts from other synthetic alumni.
 *
 * Every row belongs to a synthetic account (the SYNTH_* records from
 * seed-synthetic-alumni.mjs), so purge-synthetic-alumni.mjs removes all of it;
 * --purge here removes only the posts, listings, reactions, comments and their
 * notifications, and keeps the accounts.
 *
 * Openings never carry application links: links to real companies' careers
 * sites would be invented, so students respond through AlumniBridge requests or
 * messages instead.
 *
 *   node scripts/seed-synthetic-posts.mjs           # dry run, prints samples
 *   node scripts/seed-synthetic-posts.mjs --commit  # writes
 *   node scripts/seed-synthetic-posts.mjs --purge   # removes what this script wrote
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const COMMIT = process.argv.includes('--commit');
const PURGE = process.argv.includes('--purge');
const COUNT = 500;
const OPENING_SHARE = 0.7;
const DAYS = 120;

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
let seed = 5005;
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
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const chunks = (arr, n = 200) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const isoDay = (d) => d.toISOString().slice(0, 10);
const tagOf = (s) => '#' + s.replace(/[^A-Za-z0-9]/g, '').toLowerCase();

/* ------------------------------ pools ------------------------------------ */

const TOPICS = {
  COMP: ['system design', 'DSA', 'cloud', 'React', 'backend APIs', 'machine learning', 'DevOps', 'open source'],
  IT: ['SQL', 'cloud', 'cybersecurity', 'data analytics', 'Power BI', 'business analysis', 'networking'],
  EXTC: ['embedded systems', 'IoT', 'VLSI', 'firmware', '5G', 'PCB design', 'signal processing'],
  CIVIL: ['site execution', 'structural design', 'project planning', 'quantity surveying', 'AutoCAD', 'STAAD Pro'],
};

const SKILLS = {
  COMP: ['Java', 'Python', 'JavaScript', 'React', 'Node.js', 'SQL', 'Data Structures', 'AWS', 'Docker', 'Spring Boot', 'Git'],
  IT: ['SQL', 'Python', 'Power BI', 'Excel', 'Azure', 'Linux', 'Networking', 'ServiceNow', 'Tableau'],
  EXTC: ['Embedded C', 'Microcontrollers', 'IoT', 'MATLAB', 'Verilog', 'PCB Design', 'RTOS', 'Python'],
  CIVIL: ['AutoCAD', 'STAAD Pro', 'ETABS', 'Estimation', 'Site Supervision', 'MS Project', 'Revit', 'Quantity Surveying'],
};

const ROLES = {
  COMP: { job: ['Software Engineer', 'Associate Software Engineer', 'Backend Developer', 'Frontend Developer', 'Data Engineer', 'QA Engineer'], intern: ['Software Engineering Intern', 'Full Stack Intern', 'Data Science Intern', 'Backend Intern'] },
  IT: { job: ['Systems Engineer', 'Data Analyst', 'Cloud Support Engineer', 'Associate Consultant', 'Business Analyst'], intern: ['Data Analyst Intern', 'Cloud Intern', 'IT Support Intern', 'Business Analyst Intern'] },
  EXTC: { job: ['Embedded Engineer', 'Graduate Engineer Trainee', 'Network Engineer', 'Test Engineer', 'Firmware Engineer'], intern: ['Embedded Systems Intern', 'IoT Intern', 'Hardware Design Intern', 'Network Intern'] },
  CIVIL: { job: ['Site Engineer', 'Graduate Engineer Trainee', 'Junior Structural Engineer', 'Billing Engineer', 'Planning Engineer'], intern: ['Site Engineering Intern', 'Structural Design Intern', 'Quantity Surveying Intern', 'Planning Intern'] },
};

const PAY = {
  COMP: ['₹4–6 LPA', '₹5–8 LPA', '₹6–9 LPA', '₹3.6–4.5 LPA', '₹7–10 LPA'],
  IT: ['₹3.5–5 LPA', '₹4–6 LPA', '₹4.5–6.5 LPA', '₹3.25 LPA'],
  EXTC: ['₹3.5–5 LPA', '₹4–5.5 LPA', '₹3–4 LPA', '₹4.5–6 LPA'],
  CIVIL: ['₹3–4.2 LPA', '₹3.5–5 LPA', '₹2.8–3.6 LPA', '₹4–5 LPA'],
};
const STIPEND = ['₹10,000 / month', '₹15,000 / month', '₹12,000 / month', '₹20,000 / month', '₹8,000 / month', 'Unpaid, with certificate and PPO chance'];
const DURATION = ['2 months', '3 months', '6 months', '6 months (Jan–Jun)'];
const EXPERIENCE = ['Freshers', 'Freshers (2025/2026 batch)', '0–1 year', '0–2 years', '1–3 years'];
const BATCHES = ['2025 and 2026 graduates', '2026 graduates', 'Final-year students (2026 batch)', '2024–2026 graduates'];
const CGPA = ['CGPA 6.5+', 'CGPA 7.0+', '60% throughout', 'No active backlogs'];

const OPENING_BODIES = {
  job: [
    "We're hiring at {company}! 🚀\n\nLooking for {title}s to join my team in {city}. {experience} welcome. If you're from SJCEM, send me a referral request through AlumniBridge with your resume and the projects you're proudest of.\n\n#hiring #jobs {tagBranch}",
    "Opening on my team at {company}: {title}.\n\nYou'd work on {topic} from week one, with proper mentoring. I'll review every SJCEM request personally, so tell me what you've built.\n\n#hiring {tagTopic} #freshers",
    "{company} is hiring {title}s ({experience}). Pay is {compensation}. We care more about fundamentals in {topic} than about years of experience.\n\nRequest a referral below and include your GitHub or portfolio. #jobs #referral {tagBranch}",
  ],
  internship: [
    "Internship alert 🎓\n\n{company} is taking {title}s for {duration} in {city}, stipend {compensation}. You'll ship real work in {topic}, and strong interns get a PPO.\n\nFinal-year SJCEM students, ask me about it below. #internship #summerinternship {tagBranch}",
    "My team at {company} has two {title} seats for {duration}. Stipend: {compensation}. Looking for curiosity and basics in {topic}.\n\n#internship #hiring {tagTopic}",
  ],
  placement: [
    "Campus drive at SJCEM: {company} 🎯\n\nRoles: {title}. Package: {compensation}. Rounds: online aptitude test, technical interview, then HR.\nEligibility: {eligibility}.\n\nRegister before the deadline. I'm an alumnus working there; ask me anything about the process in the comments. #placements #campusdrive {tagBranch}",
    "{company} is coming to campus for {title} roles ({compensation}).\n\nHow to prepare: revise {topic}, practise aptitude daily, and keep one project you can explain end to end. Eligibility: {eligibility}.\n\n#placements #sjcem",
  ],
  referral: [
    "Referrals open at {company} 🤝\n\nI can refer SJCEM students and alumni for {title} roles. Send a referral request through AlumniBridge with your resume and one line on why this team. I only refer profiles I've reviewed.\n\n#referral #jobs {tagBranch}",
    "Happy to refer for {title} openings at {company} ({experience}). Requests with a clear resume and a project link get answered first.\n\n#referral #hiring {tagTopic}",
  ],
};

const GENERAL = {
  career: [
    "Some personal news: I've started a new role as {designation} at {company}! 🎉\n\nGrateful to the SJCEM {branch} faculty who pushed us to keep building. #newjob #careergrowth",
    "Completed {years} years at {company} today. Started as a fresher, now working as {designation}. To the juniors: the first year is the hardest, don't judge your whole career by it. #workanniversary",
  ],
  advice: [
    "For SJCEM students preparing for placements in {topic}:\n\n1. Build one project you can explain end to end.\n2. Practise explaining your decisions out loud.\n3. Map every line of the job description to something you've done.\n\n#placements #careeradvice",
    "Resume tip from someone who screens them at {company}: strongest project first, one line on the problem, one on what YOU did, one on the result. Skip the 'objective' section. #resume #careeradvice",
    "Mock interview season! I'm opening a few slots this month for {topic} mock interviews. Request one through my AlumniBridge profile with the role you're targeting. #mockinterview #mentorship",
  ],
  learning: [
    "This month I went deep into {topic}. Biggest lesson: the fundamentals you think you can skip are exactly the ones production will test you on. #learning {tagTopic}",
  ],
  campus: [
    "Visited the SJCEM campus after {years} years today. The canteen chai is exactly the same, the labs are much better. 🏫 #sjcem #alumni",
    "Class of {batch}, where are you all now? Drop a comment, let's plan a meetup in {city}. #sjcem #reunion",
  ],
};

const COMMENTS = {
  opening: ['Is this open for the 2026 batch?', 'Sent you a referral request!', 'Very relevant for juniors, sharing in our class group.', 'Does the role need prior internship experience?', 'Interested, I have requested through AlumniBridge.', 'What does the technical round focus on?', 'Thanks for posting this, sir!'],
  career: ['Congratulations! 🎉', 'Many congratulations, well deserved!', 'Congrats! All the best for the new role.'],
  advice: ['Very helpful, thank you for sharing.', 'This is gold for freshers.', 'Saving this. Thanks!', 'Would love a session on this.'],
  learning: ['Great insight.', 'Very inspiring, keep going.'],
  campus: ['Miss those days.', 'Count me in for the meetup.', 'Proud to be an SJCEMite.'],
};

const REACTION_MIX = {
  opening: [['like', 55], ['insightful', 20], ['support', 12], ['celebrate', 8], ['curious', 5]],
  career: [['celebrate', 55], ['like', 30], ['support', 15]],
  advice: [['insightful', 45], ['like', 40], ['support', 10], ['curious', 5]],
  learning: [['insightful', 50], ['like', 40], ['celebrate', 10]],
  campus: [['like', 55], ['support', 25], ['celebrate', 20]],
};
const reactionFor = (group) => {
  const mix = REACTION_MIX[group];
  let r = rnd() * mix.reduce((s, [, w]) => s + w, 0);
  for (const [name, w] of mix) if ((r -= w) <= 0) return name;
  return 'like';
};

/* --------------------------------- main --------------------------------- */

async function fetchAll(table, columns, build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(db.from(table).select(columns)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

async function main() {
  const records = await fetchAll(
    'alumni_records',
    'branch, batch_year, claimed_by, first_company:companies!first_company_id(name), alumni_profiles(designation, location, experience_years, current_company_id, current_company:companies!current_company_id(name))',
    (q) => q.like('student_id', 'SYNTH_%').not('claimed_by', 'is', null)
  );
  const authors = records
    .map((r) => {
      const p = Array.isArray(r.alumni_profiles) ? r.alumni_profiles[0] : r.alumni_profiles;
      if (!p) return null;
      return {
        id: r.claimed_by,
        branch: r.branch,
        batch: r.batch_year,
        designation: p.designation,
        companyId: p.current_company_id,
        company: p.current_company?.name ?? 'my company',
        first: r.first_company?.name ?? 'my first company',
        city: p.location && p.location !== 'Remote' ? p.location : 'Mumbai',
        years: Math.max(1, p.experience_years ?? 1),
      };
    })
    .filter(Boolean);
  const ids = authors.map((a) => a.id);
  console.log(`${authors.length} synthetic alumni found.`);
  if (!authors.length) throw new Error('No synthetic alumni; run seed-synthetic-alumni.mjs --commit first.');

  const existing = [];
  for (const part of chunks(ids, 100)) existing.push(...(await fetchAll('posts', 'id', (q) => q.in('author_id', part))));

  if (PURGE) {
    // Stored photos first: deleting a post row does not delete its file.
    for (const part of chunks(ids, 100)) {
      const { data: withPhotos } = await db.from('posts').select('image_path').in('author_id', part).not('image_path', 'is', null);
      const paths = (withPhotos ?? []).map((p) => p.image_path);
      if (paths.length) await db.storage.from('post-images').remove(paths);
    }
    for (const part of chunks(ids, 100)) {
      await db.from('post_comments').delete().in('author_id', part);
      await db.from('post_likes').delete().in('user_id', part);
      await db.from('saved_posts').delete().in('user_id', part);
      const { error } = await db.from('posts').delete().in('author_id', part);
      if (error) throw new Error(`posts: ${error.message}`);
      await db.from('opportunities').delete().in('posted_by', part);
      await db.from('notifications').delete().in('user_id', part);
    }
    console.log(`Removed ${existing.length} synthetic posts with their listings, reactions, comments and notifications.`);
    return;
  }
  if (existing.length) {
    console.log(`${existing.length} synthetic posts already exist. Run with --purge first to regenerate.`);
    return;
  }

  const now = Date.now();
  const posts = [];
  for (let n = 0; n < COUNT; n++) {
    const a = pick(authors);
    const topic = pick(TOPICS[a.branch] ?? TOPICS.COMP);
    const ageDays = Math.pow(rnd(), 1.8) * DAYS;
    const created = new Date(now - ageDays * 86_400_000 - Math.floor(rnd() * 3_600_000));
    const vars = { ...a, topic, tagBranch: tagOf(a.branch), tagTopic: tagOf(topic) };

    if (chance(OPENING_SHARE)) {
      const kind = pick(['job', 'job', 'job', 'internship', 'internship', 'placement', 'referral', 'referral']);
      const roles = ROLES[a.branch] ?? ROLES.COMP;
      const title = kind === 'internship' ? pick(roles.intern) : pick(roles.job);
      // Most openings are still open; older ones have passed their deadline.
      const deadline = new Date(created.getTime() + (7 + Math.floor(rnd() * 30)) * 86_400_000);
      const o = {
        type: kind,
        title: kind === 'placement' ? `Campus drive: ${title}` : title,
        company_id: a.companyId,
        location: a.city,
        work_mode: kind === 'placement' ? 'onsite' : pick(['onsite', 'onsite', 'hybrid', 'hybrid', 'remote']),
        experience: kind === 'internship' ? null : pick(EXPERIENCE),
        compensation: kind === 'internship' ? pick(STIPEND) : pick(PAY[a.branch] ?? PAY.COMP),
        duration: kind === 'internship' ? pick(DURATION) : null,
        deadline: isoDay(deadline),
        eligibility: `${pick(BATCHES)}, ${a.branch}${chance(0.5) ? '/IT' : ''}, ${pick(CGPA)}`,
        target_skills: pickN(SKILLS[a.branch] ?? SKILLS.COMP, 3 + Math.floor(rnd() * 3)),
        apply_via: chance(0.8) ? 'request' : 'message',
        is_open: deadline.getTime() > now,
      };
      const body = fill(pick(OPENING_BODIES[kind]), { ...vars, ...o, title });
      posts.push({ id: crypto.randomUUID(), author: a, group: 'opening', kind, body, created_at: created.toISOString(), opportunity: o });
    } else {
      const group = pick(['career', 'advice', 'advice', 'learning', 'campus']);
      const body = fill(pick(GENERAL[group]), vars);
      posts.push({ id: crypto.randomUUID(), author: a, group, kind: group, body, created_at: created.toISOString() });
    }
  }

  // Reactions, comments and reposts from other synthetic alumni.
  const reactions = [];
  const comments = [];
  const reposts = [];
  for (const p of posts) {
    const others = ids.filter((id) => id !== p.author.id);
    const n = Math.floor(Math.pow(rnd(), 2) * (p.group === 'opening' ? 70 : 50));
    for (const u of pickN(others, n)) {
      reactions.push({ post_id: p.id, user_id: u, reaction: reactionFor(p.group), created_at: new Date(new Date(p.created_at).getTime() + Math.floor(rnd() * 3 * 86_400_000)).toISOString() });
    }
    const c = chance(0.7) ? Math.floor(Math.pow(rnd(), 1.6) * 7) : 0;
    let t = new Date(p.created_at).getTime();
    for (const u of pickN(others, c)) {
      t += Math.floor(rnd() * 20 * 3_600_000) + 300_000;
      comments.push({ post_id: p.id, author_id: u, body: pick(COMMENTS[p.group]), created_at: new Date(Math.min(t, now)).toISOString() });
    }
    // Openings get shared onward, as they would be.
    if (p.group === 'opening' && chance(0.12)) {
      const by = pick(others);
      const at = new Date(Math.min(now, new Date(p.created_at).getTime() + Math.floor(rnd() * 2 * 86_400_000) + 600_000));
      reposts.push({
        id: crypto.randomUUID(),
        author_id: by,
        body: chance(0.5) ? pick(['Sharing for juniors from SJCEM 👇', 'Great opening, do apply!', 'Sharing with my network. #hiring', 'Relevant for the 2026 batch. #placements']) : '',
        repost_of: p.id,
        created_at: at.toISOString(),
      });
    }
  }

  const by = (f) => posts.reduce((m, p) => ((m[f(p)] = (m[f(p)] ?? 0) + 1), m), {});
  console.log('Kinds:', by((p) => p.kind));
  console.log(`Authors: ${new Set(posts.map((p) => p.author.id)).size}; reactions ${reactions.length}; comments ${comments.length}; reposts ${reposts.length}`);
  for (const p of pickN(posts.filter((x) => x.opportunity), 2)) console.log('\n---', p.kind, p.created_at.slice(0, 10), '\n' + p.body, '\n', p.opportunity);

  if (!COMMIT) {
    console.log('\nDry run: nothing written. Pass --commit to write.');
    return;
  }

  // Listings first; posts point at them.
  const openings = posts.filter((p) => p.opportunity);
  for (const part of chunks(openings, 200)) {
    const { data, error } = await db
      .from('opportunities')
      .insert(part.map((p) => ({ posted_by: p.author.id, description: p.body, created_at: p.created_at, ...p.opportunity })))
      .select('id');
    if (error) throw new Error(`opportunities: ${error.message} (run with --purge to clean up)`);
    data.forEach((row, i) => (part[i].opportunity_id = row.id));
  }
  const hashtags = (text) => [...new Set([...text.matchAll(/(^|\s)#([\p{L}\p{N}_]{2,40})/gu)].map((m) => m[2].toLowerCase()))].slice(0, 10);
  for (const part of chunks(posts)) {
    const { error } = await db.from('posts').insert(
      part.map((p) => ({
        id: p.id,
        author_id: p.author.id,
        body: p.body,
        created_at: p.created_at,
        updated_at: p.created_at,
        opportunity_id: p.opportunity_id ?? null,
        hashtags: hashtags(p.body),
      }))
    );
    if (error) throw new Error(`posts: ${error.message} (run with --purge to clean up)`);
  }
  for (const part of chunks(reposts)) {
    const { error } = await db
      .from('posts')
      .insert(part.map((r) => ({ ...r, updated_at: r.created_at, hashtags: hashtags(r.body) })));
    if (error) throw new Error(`reposts: ${error.message} (run with --purge to clean up)`);
  }
  for (const part of chunks(reactions, 1000)) {
    const { error } = await db.from('post_likes').insert(part);
    if (error) throw new Error(`post_likes: ${error.message} (run with --purge to clean up)`);
  }
  for (const part of chunks(comments, 500)) {
    const { error } = await db.from('post_comments').insert(part);
    if (error) throw new Error(`post_comments: ${error.message} (run with --purge to clean up)`);
  }
  // The triggers filed a notification for every reaction, comment and repost;
  // between synthetic accounts that is noise.
  for (const part of chunks(ids, 100)) await db.from('notifications').delete().in('user_id', part);
  console.log(`\nDone: ${posts.length} posts (${openings.length} openings), ${reposts.length} reposts, ${reactions.length} reactions, ${comments.length} comments.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
