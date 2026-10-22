/**
 * Adds 500 Home-feed posts written by the synthetic alumni, with likes and
 * comments from other synthetic alumni, so the feed has life before real
 * members start posting.
 *
 * Every post, like and comment belongs to a synthetic account (the SYNTH_*
 * records from seed-synthetic-alumni.mjs). Deleting those accounts with
 * purge-synthetic-alumni.mjs deletes all of this too; --purge here removes only
 * the posts, likes and comments and keeps the accounts.
 *
 *   node scripts/seed-synthetic-posts.mjs           # dry run, prints samples
 *   node scripts/seed-synthetic-posts.mjs --commit  # actually writes
 *   node scripts/seed-synthetic-posts.mjs --purge   # removes synthetic posts, likes, comments
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const COMMIT = process.argv.includes('--commit');
const PURGE = process.argv.includes('--purge');
const COUNT = 500;
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

/* ------------------------------ post pools ------------------------------- */

const TOPICS = {
  COMP: ['system design', 'DSA', 'cloud', 'React', 'backend APIs', 'machine learning', 'DevOps', 'open source'],
  IT: ['SQL', 'cloud', 'cybersecurity', 'data analytics', 'Power BI', 'business analysis', 'networking'],
  EXTC: ['embedded systems', 'IoT', 'VLSI', 'firmware', '5G', 'PCB design', 'signal processing'],
  CIVIL: ['site execution', 'structural design', 'project planning', 'quantity surveying', 'AutoCAD', 'STAAD Pro'],
};

const CERTS = {
  COMP: ['AWS Certified Solutions Architect – Associate', 'Kubernetes (CKAD)', 'Google Cloud Associate Cloud Engineer', 'Azure Developer Associate'],
  IT: ['Microsoft Azure Fundamentals', 'CompTIA Security+', 'Power BI Data Analyst', 'AWS Cloud Practitioner'],
  EXTC: ['ARM Accredited Engineer', 'Cisco CCNA', 'Embedded Linux', 'IoT Fundamentals'],
  CIVIL: ['Primavera P6', 'PMP', 'Autodesk Revit Certified Professional', 'Green Building (IGBC AP)'],
};

// Each kind: templates use {company} {designation} {topic} {years} {branch} {batch} {cert} {city} {first}.
const KINDS = [
  {
    kind: 'career',
    weight: 14,
    posts: [
      "Some personal news: I've started a new role as {designation} at {company}! 🎉\n\nGrateful to everyone who helped along the way, especially the SJCEM {branch} faculty who pushed us to keep building. Looking forward to learning a lot here.",
      "Happy to share that I've been promoted to {designation} at {company}.\n\n{years} years ago I walked out of SJCEM not knowing much beyond the syllabus. Consistency really does compound. Thank you to my team and mentors.",
      "Wrapped up my time at {first} and joined {company} as {designation} this week. New city, new team, same habit of asking too many questions. If you're from SJCEM and in {city}, say hi!",
      "Completed {years} years at {company} today. Started as a fresher, now working as {designation}. To the juniors: the first year is the hardest, don't judge your whole career by it.",
    ],
  },
  {
    kind: 'advice',
    weight: 22,
    posts: [
      "For SJCEM students preparing for placements in {topic}:\n\n1. Build one project you can explain end to end.\n2. Practise explaining your decisions out loud.\n3. Read the job description and map every line to something you've done.\n\nThe interview is a conversation, not an exam.",
      "I've taken around 40 interviews this year at {company}. The most common reason freshers don't clear the round isn't knowledge, it's not asking clarifying questions. Ask before you answer.",
      "Resume tip from someone who screens them: put your strongest project at the top, with one line on the problem, one on what YOU did, and one on the result. Skip the 'objective' section.",
      "Unpopular opinion: you don't need ten certifications. You need one solid {topic} project and the ability to talk about what went wrong while building it.",
      "Things I wish I'd known in my final year at SJCEM:\n• Internships matter more than CGPA after your first job\n• Your batchmates are your first network\n• It's okay to switch domains early\n\nWhat would you add?",
      "If you are a {branch} student wondering whether to go for higher studies or a job first: I worked for {years} years before deciding. Both paths are valid. Happy to talk it through in a mentorship session here.",
      "Mock interview season! I'm opening a few slots this month for {topic} mock interviews. Request one through my AlumniBridge profile and include the role you're targeting.",
    ],
  },
  {
    kind: 'hiring',
    weight: 16,
    posts: [
      "We're hiring at {company}! 🚀\n\nLooking for freshers and 0–2 years' experience to join as {designation}s in {city}. If you're from SJCEM, send me a request on AlumniBridge with your resume and I'll refer the strong profiles.",
      "My team at {company} has two openings for interns this summer ({topic}). Six months, stipend, real project work. Final-year students, check the Opportunities page; I'll post the details there.",
      "Referral window is open at {company} for {designation}-track roles. I can only refer people whose work I've seen, so share a project link along with your resume.",
      "Hiring alert: {company} is running a campus drive for {branch} graduates next month. Prepare {topic} basics and aptitude. Ask me anything about the process in the comments.",
    ],
  },
  {
    kind: 'learning',
    weight: 14,
    posts: [
      "Just cleared the {cert} exam! It took about two months of evenings and weekends. Happy to share my notes with anyone from SJCEM preparing for it.",
      "This month I went deep into {topic}. Biggest lesson: the fundamentals you think you can skip are exactly the ones production will test you on.",
      "Gave a talk on {topic} at an internal tech day at {company}. Slides were simple, demo broke once, audience still learned something. Ship it anyway.",
      "Reading list for anyone getting into {topic}: start with the official docs, build something small, then read other people's code. Tutorials alone won't get you there.",
    ],
  },
  {
    kind: 'campus',
    weight: 10,
    posts: [
      "Visited the SJCEM campus after {years} years today. The canteen chai is exactly the same, the labs are much better. Nostalgia hit hard. 🏫",
      "Shoutout to the {branch} department at SJCEM. A project we did in third year ended up being the thing I talked about in my first interview at {first}.",
      "Class of {batch}, where are you all now? Drop a comment, let's plan a meetup in {city}.",
      "Met three SJCEM juniors at {company} this week, all doing great work. The network is getting stronger every year. Proud of this community.",
    ],
  },
  {
    kind: 'project',
    weight: 12,
    posts: [
      "Our team at {company} just shipped a project I've been working on for months, centred on {topic}. Lots of late nights, lots of learning. Big thanks to the team.",
      "Weekend project: built a small tool around {topic} to automate a boring part of my job. Saved my team a couple of hours a week. Small automations add up.",
      "CIVIL:Six months ago this site was an empty plot. Today the structure is complete. Proud of the whole crew. {topic} done right is all about planning and communication.",
      "Wrote up what I learned migrating a legacy system at {company}. Short version: measure first, change one thing at a time, and keep the old path working until you're sure.",
    ],
  },
  {
    kind: 'question',
    weight: 12,
    posts: [
      "Question for the network: for students starting out in {topic}, what's the one resource you'd recommend? Building a list to share with my mentees.",
      "Alumni in {city}: is anyone else from SJCEM {branch} working in {topic}? Would love to connect and maybe run a joint session for students.",
      "What do you think matters more for a fresher in {topic}: a strong internship or a strong personal project? Curious to hear from both students and alumni.",
    ],
  },
];

const COMMENTS = {
  career: ['Congratulations! 🎉', 'Many congratulations, well deserved!', 'Congrats! All the best for the new role.', 'So happy for you, this is great news.', 'Congratulations! {company} is lucky to have you.'],
  advice: ['Very helpful, thank you for sharing.', 'This is gold for freshers.', 'Point 2 is so underrated.', 'Saving this. Thanks!', 'Couldn’t agree more.', 'Would love a session on this.'],
  hiring: ['Is this open for 2026 graduates?', 'Sent you a request on AlumniBridge!', 'Thanks for sharing, will apply.', 'Does the role need prior internship experience?', 'Great opportunity for juniors.'],
  learning: ['Congrats on clearing it!', 'Would love your notes, thanks!', 'Great job, keep going.', 'Very inspiring.', 'How long did you prepare for it?'],
  campus: ['The canteen chai never changes 😄', 'Class of {batch} here!', 'Count me in for the meetup.', 'Miss those days.', 'Proud to be an SJCEMite.'],
  project: ['Amazing work!', 'Congratulations to the whole team.', 'Would love to read more about this.', 'Great effort, well done.'],
  question: ['Following this thread.', 'Great question.', 'Personal projects, for sure.', 'Internships, they teach you how teams work.', 'Happy to connect!'],
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

const chunks = (arr, n = 200) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function main() {
  const records = await fetchAll(
    'alumni_records',
    'branch, batch_year, claimed_by, first_company:companies!first_company_id(name), alumni_profiles(designation, location, experience_years, current_company:companies!current_company_id(name))',
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
        company: p.current_company?.name ?? 'my company',
        first: r.first_company?.name ?? 'my first company',
        city: p.location && p.location !== 'Remote' ? p.location : 'Mumbai',
        years: Math.max(1, p.experience_years ?? 1),
      };
    })
    .filter(Boolean);
  const ids = authors.map((a) => a.id);
  console.log(`${authors.length} synthetic alumni found.`);
  if (authors.length === 0) throw new Error('No synthetic alumni; run seed-synthetic-alumni.mjs --commit first.');

  // In batches: 500 ids in one in() filter is too long for a request URL.
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
      const { error } = await db.from('posts').delete().in('author_id', part);
      if (error) throw new Error(`posts: ${error.message}`);
    }
    console.log(`Removed ${existing.length} synthetic posts with their likes and comments.`);
    return;
  }

  if (existing.length > 0) {
    console.log(`${existing.length} synthetic posts already exist. Run with --purge first to regenerate.`);
    return;
  }

  const weighted = KINDS.flatMap((k) => Array(k.weight).fill(k));
  const now = Date.now();
  const posts = [];
  for (let n = 0; n < COUNT; n++) {
    const a = pick(authors);
    const kind = pick(weighted);
    const vars = {
      ...a,
      topic: pick(TOPICS[a.branch] ?? TOPICS.COMP),
      cert: pick(CERTS[a.branch] ?? CERTS.COMP),
    };
    // Skew toward recent days, as a living feed would be.
    const ageDays = Math.pow(rnd(), 1.8) * DAYS;
    const created = new Date(now - ageDays * 86_400_000 - Math.floor(rnd() * 3_600_000));
    // "CIVIL:" marks a template that only reads true for that branch.
    // A move between employers needs two different ones.
    const fits = kind.posts.filter(
      (t) => (!/^[A-Z]+:/.test(t) || t.startsWith(`${a.branch}:`)) && !(t.includes('{first}') && a.first === a.company)
    );
    const body = fill(pick(fits).replace(/^[A-Z]+:/, ''), vars);
    posts.push({ id: crypto.randomUUID(), author: a, kind: kind.kind, body, created_at: created.toISOString(), vars });
  }

  // Likes: most posts get a handful, a few get many. Comments: fewer, from other synthetic alumni.
  const likes = [];
  const comments = [];
  for (const p of posts) {
    const n = Math.floor(Math.pow(rnd(), 2.2) * 80);
    for (const u of pickN(ids.filter((id) => id !== p.author.id), n)) {
      likes.push({ post_id: p.id, user_id: u, created_at: new Date(new Date(p.created_at).getTime() + Math.floor(rnd() * 3 * 86_400_000)).toISOString() });
    }
    const c = chance(0.7) ? Math.floor(Math.pow(rnd(), 1.6) * 7) : 0;
    let t = new Date(p.created_at).getTime();
    for (const u of pickN(ids.filter((id) => id !== p.author.id), c)) {
      t += Math.floor(rnd() * 20 * 3_600_000) + 300_000;
      comments.push({ post_id: p.id, author_id: u, body: fill(pick(COMMENTS[p.kind]), p.vars), created_at: new Date(Math.min(t, now)).toISOString() });
    }
  }

  const by = (f) => posts.reduce((m, p) => ((m[f(p)] = (m[f(p)] ?? 0) + 1), m), {});
  console.log('Kinds:', by((p) => p.kind));
  console.log(`Authors: ${new Set(posts.map((p) => p.author.id)).size}, likes: ${likes.length}, comments: ${comments.length}`);
  for (const p of pickN(posts, 3)) console.log('\n---', p.kind, p.created_at.slice(0, 10), '\n' + p.body);

  if (!COMMIT) {
    console.log('\nDry run: nothing written. Pass --commit to write.');
    return;
  }

  for (const part of chunks(posts)) {
    const { error } = await db
      .from('posts')
      .insert(part.map((p) => ({ id: p.id, author_id: p.author.id, body: p.body, created_at: p.created_at, updated_at: p.created_at })));
    if (error) throw new Error(`posts: ${error.message} (run with --purge to clean up)`);
  }
  for (const part of chunks(likes, 1000)) {
    const { error } = await db.from('post_likes').insert(part);
    if (error) throw new Error(`post_likes: ${error.message} (run with --purge to clean up)`);
  }
  for (const part of chunks(comments, 500)) {
    const { error } = await db.from('post_comments').insert(part);
    if (error) throw new Error(`post_comments: ${error.message} (run with --purge to clean up)`);
  }
  console.log(`\nDone: ${posts.length} posts, ${likes.length} likes, ${comments.length} comments.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
