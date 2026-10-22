/**
 * Smoke test for search (migration 0011): runs real queries through each
 * search function with the service key and prints hit counts, the top hit and
 * timing. Read-only. Exits non-zero if a function errors or a query that must
 * find something finds nothing.
 *
 *   node scripts/smoke-search.mjs
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
  auth: { persistSession: false, autoRefreshToken: false },
});

// [function, args, must find at least one, how to label the top row]
const CASES = [
  ['search_people', { q: 'software engineer' }, true],
  ['search_people', { q: 'rahul' }, true],
  ['search_people', { q: 'rahl vartak' }, false],
  ['search_people', { q: 'python', p_role: 'alumni' }, false],
  ['search_people', { q: 'data', p_branch: 'COMP' }, false],
  ['search_posts', { q: 'hiring' }, true],
  ['search_posts', { q: '"placement drive"' }, false],
  ['search_posts', { q: 'interns -remote' }, false],
  ['search_jobs', { q: 'react' }, true],
  ['search_jobs', { q: 'intern', p_type: 'internship' }, false],
  ['search_jobs', { q: 'any data analyst roles in mumbai?', p_any: true }, true],
  ['search_jobs', { q: 'java', p_open_only: false }, false],
  ['search_companies', { q: 'infosys' }, true],
  ['search_companies', { q: 'tata cons' }, true],
  ['search_companies', { q: 'acenture' }, false],
  ['search_knowledge', { q: 'How is the match score calculated?', p_role: 'student' }, true],
  ['search_knowledge', { q: 'how do I cancel a video session', p_role: 'alumni' }, true],
  ['search_knowledge', { q: 'how do I control how much I am asked for', p_role: 'student' }, false],
  ['search_knowledge', { q: 'proctoring tab switch', p_role: 'student' }, true],
  ['search_people', { q: "'; drop table users; --" }, false],
  ['search_posts', { q: '!!! ::: &&& |||' }, false],
];

const label = async (fn, row) => {
  if (!row) return '';
  if (fn === 'search_companies') return `${row.name} (${row.alumni_count} alumni, ${row.open_jobs} open)`;
  if (fn === 'search_knowledge') return `${row.id}`;
  const table = { search_people: ['users', 'full_name'], search_posts: ['posts', 'body'], search_jobs: ['opportunities', 'title'] }[fn];
  const { data } = await db.from(table[0]).select(table[1]).eq('id', row.id).maybeSingle();
  return String(data?.[table[1]] ?? row.id).replace(/\s+/g, ' ').slice(0, 60);
};

let failed = 0;
for (const [fn, args, mustFind] of CASES) {
  const t0 = Date.now();
  const { data, error } = await db.rpc(fn, args);
  const ms = Date.now() - t0;
  if (error) {
    failed++;
    console.log(`FAIL ${fn}(${JSON.stringify(args)}): ${error.message}`);
    continue;
  }
  const rows = data ?? [];
  const total = rows[0]?.total ?? rows.length;
  const ok = !mustFind || rows.length > 0;
  if (!ok) failed++;
  const top = await label(fn, rows[0]);
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${fn.padEnd(17)} ${JSON.stringify(args).slice(0, 70).padEnd(72)} ${String(rows.length).padStart(2)} shown / ${String(total).padStart(3)} total  ${String(ms).padStart(4)}ms  ${top ? `top: ${top}` : ''}`
  );
}

// The functions are for the server only: the anon key must not be able to call them.
if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await anon.rpc('search_people', { q: 'rahul' });
  const denied = Boolean(error);
  if (!denied) failed++;
  console.log(`${denied ? 'ok  ' : 'FAIL'} anon key cannot call search_people${denied ? ` (${error.code ?? error.message})` : ''}`);
}

const { count } = await db.from('knowledge_docs').select('id', { count: 'exact', head: true });
console.log(`knowledge_docs: ${count} rows`);

console.log(failed ? `${failed} failure(s)` : 'All search smoke checks passed.');
process.exit(failed ? 1 : 0);
