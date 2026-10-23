/**
 * Removes the synthetic alumni added by seed-synthetic-alumni.mjs, and nothing else.
 *
 * What it removes:
 *   - alumni_records with student_id 'SYNTH_*' and their alumni_profiles
 *   - the auth user behind each, which cascades to its users row and to any
 *     requests, opportunities, posts, likes, comments and engagement events
 *     involving it
 *   - the photos those accounts' posts stored in the post-images bucket, and
 *     their profile photos and banners in the avatars bucket
 *   - audit_log rows those accounts wrote (that table does not cascade)
 *
 *   node scripts/purge-synthetic-alumni.mjs           # dry run, prints the plan
 *   node scripts/purge-synthetic-alumni.mjs --commit  # actually deletes
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
  const records = await fetchAll('alumni_records', 'id, claimed_by', (q) => q.like('student_id', 'SYNTH_%'));
  const recordIds = records.map((r) => r.id);
  // Accounts come from both the records and the auth users the seed tagged
  // synthetic, so a run that stopped half-way (account made, record not yet)
  // is cleaned up too.
  const tagged = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth users: ${error.message}`);
    tagged.push(...data.users.filter((u) => u.user_metadata?.synthetic === true).map((u) => u.id));
    if (data.users.length < 1000) break;
  }
  const userIds = [...new Set([...records.map((r) => r.claimed_by).filter(Boolean), ...tagged])];

  console.log(`synthetic records: ${recordIds.length}, accounts: ${userIds.length}`);
  if (!COMMIT) {
    console.log('Dry run: nothing deleted. Pass --commit to delete.');
    return;
  }

  // Profile photos and banners, likewise only rows: remove the files first.
  for (const ids of chunks(userIds, 100)) {
    const { data: users } = await db.from('users').select('avatar_path, cover_path').in('id', ids);
    const paths = (users ?? []).flatMap((u) => [u.avatar_path, u.cover_path]).filter(Boolean);
    if (paths.length) {
      const { error } = await db.storage.from('avatars').remove(paths);
      if (error) throw new Error(`avatars: ${error.message}`);
    }
  }
  // Post photos: their rows cascade with the accounts, but the stored files do not.
  for (const ids of chunks(userIds, 100)) {
    const { data: withPhotos } = await db.from('posts').select('image_path').in('author_id', ids).not('image_path', 'is', null);
    const paths = (withPhotos ?? []).map((p) => p.image_path);
    if (paths.length) {
      const { error } = await db.storage.from('post-images').remove(paths);
      if (error) throw new Error(`post-images: ${error.message}`);
    }
  }
  for (const ids of chunks(recordIds)) {
    const { error: pe } = await db.from('alumni_profiles').delete().in('record_id', ids);
    if (pe) throw new Error(`alumni_profiles: ${pe.message}`);
    const { error: re } = await db.from('alumni_records').delete().in('id', ids);
    if (re) throw new Error(`alumni_records: ${re.message}`);
  }
  for (const ids of chunks(userIds)) {
    const { error } = await db.from('audit_log').delete().in('actor_id', ids);
    if (error) throw new Error(`audit_log: ${error.message}`);
  }
  let removed = 0;
  for (const id of userIds) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error && !/not found/i.test(error.message)) throw new Error(`auth user ${id}: ${error.message}`);
    removed++;
  }
  console.log(`Deleted ${recordIds.length} records and ${removed} accounts.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
