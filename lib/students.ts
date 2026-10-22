import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { roleOverlap, skillOverlap } from '@/lib/matching';
import { avatarUrl } from '@/lib/network';

/* ------------------------------------------------------------------ */
/* The student directory alumni browse                                 */
/* ------------------------------------------------------------------ */

export type AlumnusLens = {
  designation: string | null;
  industry: string | null;
  location: string | null;
  skills: string[] | null;
  current_company?: { name: string } | null;
};

export type StudentFit = { score: number; signals: string[] };

/**
 * How well a student fits an alumnus, scored the other way round from the
 * student-facing matcher: how much of what the student wants this alumnus is
 * positioned to give. Same signals as "Students to help".
 */
export function scoreStudentFor(
  s: { skills: string[] | null; target_role: string | null; target_company: string | null; location_pref: string | null },
  me: AlumnusLens
): StudentFit {
  const signals: string[] = [];
  let score = 0;
  const myCompany = me.current_company?.name?.toLowerCase() ?? '';
  const mySkills = me.skills ?? [];

  if (s.target_company && myCompany && myCompany.includes(s.target_company.toLowerCase())) {
    score += 40;
    signals.push(`Aiming for ${me.current_company?.name}, where you work`);
  }
  const role = roleOverlap(s.target_role, me.designation, me.industry);
  if (role > 0) {
    score += Math.round(role * 25);
    signals.push(`Wants a role like yours (${me.designation ?? 'your field'})`);
  }
  const skills = skillOverlap(s.skills ?? [], mySkills);
  if (skills > 0) {
    score += Math.round(skills * 25);
    const shared = (s.skills ?? []).filter((sk) => mySkills.some((m) => m.toLowerCase() === sk.toLowerCase()));
    if (shared.length) signals.push(`Shared skills: ${shared.slice(0, 4).join(', ')}`);
  }
  if (s.location_pref && me.location && s.location_pref.toLowerCase() === me.location.toLowerCase()) {
    score += 10;
    signals.push(`Both around ${me.location}`);
  }
  return { score: Math.min(100, score), signals };
}

export type StudentCard = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  branch: string;
  batch_year: number;
  skills: string[];
  target_role: string | null;
  target_company: string | null;
  location: string | null;
  fit: StudentFit;
};

export type StudentFilters = { q?: string; branch?: string; batch?: string; skill?: string; sort?: 'match' | 'batch' | 'name' };

/** Students with a profile, filtered and scored for this alumnus. */
export async function getStudentDirectory(filters: StudentFilters, me: AlumnusLens): Promise<{ items: StudentCard[]; total: number; branches: string[]; batches: number[] }> {
  const db = createAdminClient();
  const { data: profiles } = await db
    .from('student_profiles')
    .select('user_id, branch, batch_year, skills, target_role, target_company, location_pref')
    .limit(2000);
  const rows = profiles ?? [];
  const ids = rows.map((r) => r.user_id);
  const users = new Map<string, { full_name: string; avatar_path: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('users').select('id, full_name, avatar_path').in('id', ids.slice(i, i + 200));
    for (const u of data ?? []) users.set(u.id, u);
  }

  const q = filters.q?.trim().toLowerCase();
  const skill = filters.skill?.trim().toLowerCase();
  const all = rows
    .filter((r) => users.has(r.user_id))
    .map((r) => {
      const u = users.get(r.user_id)!;
      return {
        id: r.user_id,
        full_name: u.full_name,
        avatar_url: avatarUrl(u.avatar_path),
        branch: r.branch,
        batch_year: r.batch_year,
        skills: r.skills ?? [],
        target_role: r.target_role,
        target_company: r.target_company,
        location: r.location_pref,
        fit: scoreStudentFor(r, me),
      };
    });

  const items = all
    .filter((s) => !q || s.full_name.toLowerCase().includes(q) || (s.target_role ?? '').toLowerCase().includes(q) || (s.target_company ?? '').toLowerCase().includes(q))
    .filter((s) => !filters.branch || s.branch === filters.branch)
    .filter((s) => !filters.batch || String(s.batch_year) === filters.batch)
    .filter((s) => !skill || s.skills.some((x: string) => x.toLowerCase().includes(skill)))
    .sort((a, b) =>
      filters.sort === 'name'
        ? a.full_name.localeCompare(b.full_name)
        : filters.sort === 'batch'
          ? a.batch_year - b.batch_year || b.fit.score - a.fit.score
          : b.fit.score - a.fit.score || a.full_name.localeCompare(b.full_name)
    );

  return {
    items,
    total: all.length,
    branches: [...new Set(all.map((s) => s.branch))].sort(),
    batches: [...new Set(all.map((s) => s.batch_year))].sort((a, b) => a - b),
  };
}
