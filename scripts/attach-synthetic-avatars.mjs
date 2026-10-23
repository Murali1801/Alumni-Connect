/**
 * Gives the most visible synthetic alumni (those who post most) profile photos
 * and cover banners, from folders of ChatGPT-generated images of fictional
 * people. Headshot files are named f*-NN.jpg (women) and m*-NN.jpg (men); a
 * photo goes to someone whose first name reads the same way. Everyone else
 * keeps initials, as many real profiles do.
 *
 * Only synthetic accounts (SYNTH_* records) are touched, and
 * purge-synthetic-alumni.mjs removes these files with the accounts.
 *
 *   node scripts/attach-synthetic-avatars.mjs <avatars dir> <banners dir>           # dry run
 *   node scripts/attach-synthetic-avatars.mjs <avatars dir> <banners dir> --commit  # uploads
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const [avatarDir, bannerDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const COMMIT = process.argv.includes('--commit');
const EXTRA_BANNERS = 60;
if (!avatarDir || !bannerDir) {
  console.error('Usage: node scripts/attach-synthetic-avatars.mjs <avatars dir> <banners dir> [--commit]');
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
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// The women's first names seed-synthetic-alumni.mjs draws from.
const FEMALE = new Set([
  'Aditi', 'Aishwarya', 'Ankita', 'Anushka', 'Bhakti', 'Divya', 'Gauri', 'Isha', 'Janhavi', 'Kavya',
  'Ketaki', 'Komal', 'Mansi', 'Megha', 'Mrunal', 'Neha', 'Nikita', 'Pooja', 'Pranali', 'Priya',
  'Rutuja', 'Sakshi', 'Sayali', 'Shivani', 'Shruti', 'Sneha', 'Snehal', 'Tanvi', 'Tejal', 'Vaishnavi',
  'Riya', 'Sharon', 'Leona', 'Glenda', 'Nirali', 'Hetal', 'Dhwani', 'Khushi', 'Prachi', 'Rashmi',
]);

async function main() {
  const { data: recs, error } = await db.from('alumni_records').select('claimed_by, full_name').like('student_id', 'SYNTH_%').not('claimed_by', 'is', null);
  if (error) throw new Error(error.message);
  const people = recs.map((r) => ({ id: r.claimed_by, female: FEMALE.has(r.full_name.split(/\s+/)[1]) }));

  // Most posts first, so the feed shows faces.
  const postCount = new Map();
  for (let i = 0; i < people.length; i += 100) {
    const { data } = await db.from('posts').select('author_id').in('author_id', people.slice(i, i + 100).map((p) => p.id));
    for (const p of data ?? []) postCount.set(p.author_id, (postCount.get(p.author_id) ?? 0) + 1);
  }
  people.sort((a, b) => (postCount.get(b.id) ?? 0) - (postCount.get(a.id) ?? 0) || a.id.localeCompare(b.id));

  const files = fs.readdirSync(avatarDir).filter((f) => /\.jpe?g$/i.test(f)).sort();
  const women = files.filter((f) => f.startsWith('f'));
  const men = files.filter((f) => f.startsWith('m'));
  const banners = fs.readdirSync(bannerDir).filter((f) => /\.jpe?g$/i.test(f)).sort();

  const plan = [];
  const take = (list, female) => {
    for (const file of list) {
      const who = people.find((p) => p.female === female && !plan.some((x) => x.id === p.id));
      if (who) plan.push({ id: who.id, avatar: file });
    }
  };
  take(women, true);
  take(men, false);
  // Banners: everyone with a photo, plus the next most active people.
  const withBanner = [...plan.map((p) => p.id), ...people.filter((p) => !plan.some((x) => x.id === p.id)).slice(0, EXTRA_BANNERS).map((p) => p.id)];
  console.log(`${files.length} headshots (${women.length} women, ${men.length} men), ${banners.length} banners; ${plan.length} photos and ${withBanner.length} banners to assign.`);

  if (!COMMIT) {
    console.log('Dry run: nothing uploaded. Pass --commit to upload.');
    return;
  }

  // Upload each banner once per person path (public URLs must be per user folder).
  let n = 0;
  for (const p of plan) {
    const objectPath = `${p.id}/avatar-${crypto.randomUUID()}.jpg`;
    const { error: e } = await db.storage.from('avatars').upload(objectPath, fs.readFileSync(path.join(avatarDir, p.avatar)), { contentType: 'image/jpeg' });
    if (e) throw new Error(`${p.avatar}: ${e.message}`);
    await db.from('users').update({ avatar_path: objectPath }).eq('id', p.id);
    n++;
  }
  let b = 0;
  for (const [i, id] of withBanner.entries()) {
    const file = banners[i % banners.length];
    const objectPath = `${id}/cover-${crypto.randomUUID()}.jpg`;
    const { error: e } = await db.storage.from('avatars').upload(objectPath, fs.readFileSync(path.join(bannerDir, file)), { contentType: 'image/jpeg' });
    if (e) throw new Error(`${file}: ${e.message}`);
    await db.from('users').update({ cover_path: objectPath }).eq('id', id);
    b++;
  }
  console.log(`Done: ${n} profile photos and ${b} banners attached.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
