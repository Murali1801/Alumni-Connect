/**
 * Loads the assistant's knowledge base into `knowledge_docs`: the curated help
 * entries (lib/chatbot/facts.ts) and the product and policy docs
 * (lib/chatbot/docs.ts). Upserts by id, so re-running after an edit updates in
 * place. Run with tsx, which reads the TypeScript sources directly.
 *
 *   npx tsx scripts/seed-knowledge.mjs           # dry run: validates, prints what it would write
 *   npx tsx scripts/seed-knowledge.mjs --commit  # writes
 *   npx tsx scripts/seed-knowledge.mjs --commit --prune
 *       also deletes seeded rows (faq-, guide-, policy- ids) no longer in the source;
 *       rows added by hand under other ids are never touched
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { ALL_DOCS } from '../lib/chatbot/docs.ts';

const COMMIT = process.argv.includes('--commit');
const PRUNE = process.argv.includes('--prune');
const SEEDED = /^(faq|guide|policy)-/;

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

// The same limits the table enforces, checked here so a bad doc fails before any write.
const problems = [];
const ids = new Set();
for (const d of ALL_DOCS) {
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(d.id)) problems.push(`${d.id}: bad id`);
  if (ids.has(d.id)) problems.push(`${d.id}: duplicate id`);
  ids.add(d.id);
  if (d.title.length < 3 || d.title.length > 200) problems.push(`${d.id}: title length ${d.title.length}`);
  if (d.body.length < 10 || d.body.length > 4000) problems.push(`${d.id}: body length ${d.body.length}`);
  if (!['faq', 'guide', 'policy'].includes(d.source)) problems.push(`${d.id}: source ${d.source}`);
  if (d.url && (!d.url.startsWith('/') || d.url.length > 300)) problems.push(`${d.id}: url ${d.url}`);
}
if (problems.length) {
  console.error(`Not seeding, ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

const rows = ALL_DOCS.map((d) => ({
  id: d.id,
  title: d.title,
  body: d.body,
  source: d.source,
  url: d.url,
  roles: d.roles,
  keywords: d.keywords,
  updated_at: new Date().toISOString(),
}));

const bySource = rows.reduce((m, r) => ({ ...m, [r.source]: (m[r.source] ?? 0) + 1 }), {});
console.log(`${rows.length} docs: ${Object.entries(bySource).map(([k, n]) => `${n} ${k}`).join(', ')}`);

if (!COMMIT) {
  for (const r of rows.slice(0, 3)) console.log(`  ${r.id}  ${r.title}`);
  console.log('Dry run. Pass --commit to write.');
  process.exit(0);
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error } = await db.from('knowledge_docs').upsert(rows, { onConflict: 'id' });
if (error) {
  console.error('Upsert failed:', error.message);
  process.exit(1);
}
console.log(`Upserted ${rows.length}.`);

if (PRUNE) {
  const { data: existing, error: readErr } = await db.from('knowledge_docs').select('id');
  if (readErr) {
    console.error('Could not read existing ids:', readErr.message);
    process.exit(1);
  }
  const stale = (existing ?? []).map((r) => r.id).filter((id) => SEEDED.test(id) && !ids.has(id));
  if (stale.length) {
    const { error: delErr } = await db.from('knowledge_docs').delete().in('id', stale);
    if (delErr) {
      console.error('Prune failed:', delErr.message);
      process.exit(1);
    }
  }
  console.log(`Pruned ${stale.length}${stale.length ? `: ${stale.join(', ')}` : ''}.`);
}

const { count } = await db.from('knowledge_docs').select('id', { count: 'exact', head: true });
console.log(`knowledge_docs now holds ${count} rows.`);
