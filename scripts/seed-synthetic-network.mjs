/**
 * Connects the synthetic alumni (from seed-synthetic-alumni.mjs) into a network
 * that looks like a college's: most connections are with colleagues at the same
 * employer and with people from the same branch and nearby batches.
 *
 * The showcase demo accounts (student1 and alumni1 @v3.demo.com) also get a few
 * connections and pending invitations from synthetic alumni, so My Network has
 * something to show in a demo.
 *
 * Every row involves a synthetic account, so purge-synthetic-alumni.mjs removes
 * it with them; --purge here removes only the connections.
 *
 *   node scripts/seed-synthetic-network.mjs           # dry run
 *   node scripts/seed-synthetic-network.mjs --commit  # writes
 *   node scripts/seed-synthetic-network.mjs --purge   # removes synthetic connections
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const COMMIT = process.argv.includes('--commit');
const PURGE = process.argv.includes('--purge');
const DEMO_EMAILS = ['student1@v3.demo.com', 'alumni1@v3.demo.com'];

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
let seed = 6006;
function rnd() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const chunks = (arr, n = 100) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** Draw `n` distinct items, each in proportion to its weight. */
function weightedSample(items, weights, n) {
  const pool = items.map((item, i) => ({ item, w: weights[i] })).filter((x) => x.w > 0);
  const out = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, x) => s + x.w, 0);
    let r = rnd() * total;
    const i = pool.findIndex((x) => (r -= x.w) <= 0);
    out.push(pool.splice(i < 0 ? pool.length - 1 : i, 1)[0].item);
  }
  return out;
}

async function main() {
  const { data: rows, error } = await db
    .from('alumni_records')
    .select('branch, batch_year, claimed_by, alumni_profiles(current_company_id)')
    .like('student_id', 'SYNTH_%')
    .not('claimed_by', 'is', null);
  if (error) throw new Error(error.message);
  const people = rows.map((r) => ({
    id: r.claimed_by,
    branch: r.branch,
    batch: r.batch_year,
    company: (Array.isArray(r.alumni_profiles) ? r.alumni_profiles[0] : r.alumni_profiles)?.current_company_id ?? null,
  }));
  const ids = new Set(people.map((p) => p.id));
  console.log(`${people.length} synthetic alumni.`);

  if (PURGE) {
    let removed = 0;
    for (const part of chunks([...ids])) {
      const list = part.join(',');
      const { count } = await db
        .from('connections')
        .delete({ count: 'exact' })
        .or(`requester_id.in.(${list}),addressee_id.in.(${list})`);
      removed += count ?? 0;
    }
    console.log(`Removed ${removed} connections involving synthetic alumni.`);
    return;
  }

  const { count: existing } = await db
    .from('connections')
    .select('id', { count: 'exact', head: true })
    .in('requester_id', people.slice(0, 100).map((p) => p.id));
  if (existing) {
    console.log(`${existing}+ synthetic connections already exist. Run with --purge first to regenerate.`);
    return;
  }

  const pairs = new Map();
  const add = (a, b, status, createdAt) => {
    const key = [a, b].sort().join('|');
    if (a !== b && !pairs.has(key)) pairs.set(key, { requester_id: a, addressee_id: b, status, created_at: createdAt });
  };
  const now = Date.now();
  const when = () => new Date(now - Math.floor(rnd() * 200) * 86_400_000).toISOString();

  for (const p of people) {
    const want = 8 + Math.floor(Math.pow(rnd(), 1.5) * 28);
    const weights = people.map((q) => {
      if (q.id === p.id) return 0;
      let w = 0.2;
      if (p.company && q.company === p.company) w += 5;
      if (q.branch === p.branch) w += 1.5;
      if (q.branch === p.branch && Math.abs(q.batch - p.batch) <= 2) w += 3;
      return w;
    });
    for (const q of weightedSample(people, weights, want)) add(p.id, q.id, 'accepted', when());
  }

  // The showcase demo accounts: some connections, and a few invitations to answer.
  const { data: demos } = await db.from('users').select('id, email').in('email', DEMO_EMAILS);
  for (const d of demos ?? []) {
    const picks = weightedSample(people, people.map(() => 1), 18);
    picks.slice(0, 12).forEach((q) => add(q.id, d.id, 'accepted', when()));
    picks.slice(12).forEach((q) => add(q.id, d.id, 'pending', new Date(now - Math.floor(rnd() * 6) * 86_400_000).toISOString()));
  }

  const all = [...pairs.values()].map((c) => ({
    ...c,
    responded_at: c.status === 'accepted' ? c.created_at : null,
  }));
  const perPerson = new Map();
  for (const c of all) for (const id of [c.requester_id, c.addressee_id]) perPerson.set(id, (perPerson.get(id) ?? 0) + 1);
  const counts = [...perPerson.values()].sort((a, b) => a - b);
  console.log(
    `${all.length} connections (${all.filter((c) => c.status === 'pending').length} pending for the demo accounts); per person min ${counts[0]}, median ${counts[counts.length >> 1]}, max ${counts.at(-1)}.`
  );
  if (!COMMIT) {
    console.log('Dry run: nothing written. Pass --commit to write.');
    return;
  }

  for (const part of chunks(all, 500)) {
    const { error: e } = await db.from('connections').insert(part);
    if (e) throw new Error(`connections: ${e.message} (run with --purge to clean up)`);
  }
  // The insert trigger files an invitation notification for every row; between
  // two synthetic accounts that is noise, so clear those.
  const synthetic = [...ids];
  for (const part of chunks(synthetic)) {
    await db.from('notifications').delete().in('user_id', part).in('type', ['connection_request', 'connection_accepted']);
  }
  // Seeded accepted connections to the demo accounts should not read as invitations either.
  for (const d of demos ?? []) {
    const { data: accepted } = await db.from('connections').select('id').eq('addressee_id', d.id).eq('status', 'accepted');
    for (const part of chunks((accepted ?? []).map((c) => c.id))) {
      await db.from('notifications').delete().eq('user_id', d.id).eq('type', 'connection_request').in('data->>connection_id', part);
    }
  }
  console.log(`Done: ${all.length} connections written.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
