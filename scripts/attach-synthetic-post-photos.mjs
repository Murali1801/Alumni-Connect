/**
 * Attaches photos to synthetic Home-feed posts (from seed-synthetic-posts.mjs).
 *
 * Takes a folder of JPEGs and a manifest saying which kind of post each photo
 * suits, e.g. { "grid-01": { "tr": { "kind": "project", "branch": ["CIVIL"], "text": "site|structural" } } }
 * for grid-01-tr.jpg; `text` is an optional pattern the post must mention. Each photo is uploaded to the post-images bucket under its
 * author's folder and set on one matching synthetic post with no photo yet,
 * favouring recent posts so the top of the feed has pictures.
 *
 *   node scripts/attach-synthetic-post-photos.mjs <photos dir> <manifest.json>           # dry run
 *   node scripts/attach-synthetic-post-photos.mjs <photos dir> <manifest.json> --commit  # uploads and attaches
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const [dir, manifestPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const COMMIT = process.argv.includes('--commit');
if (!dir || !manifestPath) {
  console.error('Usage: node scripts/attach-synthetic-post-photos.mjs <photos dir> <manifest.json> [--commit]');
  process.exit(1);
}

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
let seed = 4040;
function rnd() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// The kinds seed-synthetic-posts.mjs writes, recognised from their wording.
const KIND_OF = [
  ['hiring', /hiring|openings for interns|Referral window|campus drive/i],
  ['career', /new role|been promoted|Wrapped up my time|Completed \d+ years/i],
  ['learning', /Just cleared|went deep|Gave a talk|Reading list/i],
  ['project', /just shipped|Weekend project|empty plot|migrating a legacy/i],
  ['campus', /Visited the SJCEM campus|Shoutout to the|Class of \d{4}, where|Met three SJCEM/i],
  ['question', /^Question for the network|^Alumni in |^What do you think/i],
  ['advice', /.*/],
];
const kindOf = (body) => KIND_OF.find(([, re]) => re.test(body))[0];

const chunks = (arr, n = 100) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const photos = fs
    .readdirSync(dir)
    .filter((f) => /\.jpe?g$/i.test(f))
    .sort()
    .map((file) => {
      const m = file.match(/^(.*)-(tl|tr|bl|br)\.jpe?g$/i);
      const spec = m && manifest[m[1]]?.[m[2]];
      return spec ? { file, ...spec } : null;
    })
    .filter(Boolean);
  console.log(`${photos.length} photos with a manifest entry.`);

  const { data: records, error: recError } = await db
    .from('alumni_records')
    .select('branch, claimed_by')
    .like('student_id', 'SYNTH_%')
    .not('claimed_by', 'is', null);
  if (recError) throw new Error(recError.message);
  const branchOf = new Map(records.map((r) => [r.claimed_by, r.branch]));

  const posts = [];
  for (const part of chunks([...branchOf.keys()])) {
    const { data, error } = await db
      .from('posts')
      .select('id, author_id, body, image_path, created_at')
      .in('author_id', part)
      .is('image_path', null);
    if (error) throw new Error(error.message);
    posts.push(...data);
  }
  // Newest first; candidates come from the newest 250 so photos sit near the top.
  posts.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const all = posts.map((p) => ({ ...p, kind: kindOf(p.body), branch: branchOf.get(p.author_id) }));
  const pool = all.slice(0, 250);
  console.log(`${posts.length} synthetic posts without a photo; choosing from the newest ${pool.length}.`);

  const used = new Set();
  const plan = [];
  for (const photo of photos) {
    // `text` (a regex) keeps a topic photo, such as a construction site, on posts about that topic.
    const about = photo.text ? new RegExp(photo.text, 'i') : null;
    const open = (p) => !used.has(p.id) && p.kind === photo.kind && (!about || about.test(p.body));
    const fits = pool.filter((p) => open(p) && (!photo.branch || photo.branch.includes(p.branch)));
    // Fall back to any branch, then to older posts, before giving up on a photo.
    const loose = fits.length ? fits : pool.some(open) ? pool.filter(open) : all.filter(open);
    if (!loose.length) {
      console.log(`  ${photo.file}: no ${photo.kind} post left, skipped`);
      continue;
    }
    const post = loose[Math.floor(rnd() * loose.length)];
    used.add(post.id);
    plan.push({ photo, post });
    console.log(`  ${photo.file} -> ${post.kind}/${post.branch} ${post.created_at.slice(0, 10)}: ${post.body.slice(0, 60).replace(/\n/g, ' ')}…`);
  }

  if (!COMMIT) {
    console.log(`\nDry run: ${plan.length} photos would be attached. Pass --commit to upload.`);
    return;
  }

  for (const { photo, post } of plan) {
    const objectPath = `${post.author_id}/${crypto.randomUUID()}.jpg`;
    const bytes = fs.readFileSync(path.join(dir, photo.file));
    const { error: upError } = await db.storage
      .from('post-images')
      .upload(objectPath, bytes, { contentType: 'image/jpeg', upsert: false });
    if (upError) throw new Error(`${photo.file}: ${upError.message}`);
    const { error } = await db.from('posts').update({ image_path: objectPath }).eq('id', post.id);
    if (error) {
      await db.storage.from('post-images').remove([objectPath]);
      throw new Error(`${photo.file}: ${error.message}`);
    }
  }
  console.log(`\nDone: ${plan.length} photos uploaded and attached.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
