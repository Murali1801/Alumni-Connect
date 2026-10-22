import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Role } from '@/lib/session';
import { avatarUrl } from '@/lib/network';

/* ------------------------------------------------------------------ */
/* Member profiles: what any signed-in member sees when they open one  */
/* ------------------------------------------------------------------ */

export type MemberProfile = {
  id: string;
  role: Role;
  full_name: string;
  joined_at: string;
  avatar_url: string | null;
  cover_url: string | null;
  headline: string;
  location: string | null;
  branch: string | null;
  batch_year: number | null;
  bio: string | null;
  skills: string[];
  /** Alumni only. */
  record_id: string | null;
  verified: boolean;
  experience: { title: string; company: string | null; detail: string | null }[];
  availability: string[];
  /** Students only. */
  goals: { label: string; value: string }[];
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * One member's public profile. Contact details, claim tokens and resumes are
 * never read here: the profile is visible to every signed-in member.
 */
export async function getMemberProfile(userId: string): Promise<MemberProfile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const db = createAdminClient();
  const { data: user } = await db
    .from('users')
    .select('id, role, full_name, created_at, avatar_path, cover_path')
    .eq('id', userId)
    .maybeSingle();
  if (!user) return null;

  const base = {
    id: user.id,
    role: user.role as Role,
    full_name: user.full_name,
    joined_at: user.created_at,
    avatar_url: avatarUrl(user.avatar_path),
    cover_url: avatarUrl(user.cover_path),
    location: null,
    branch: null,
    batch_year: null,
    bio: null,
    skills: [],
    record_id: null,
    verified: false,
    experience: [],
    availability: [],
    goals: [],
  };

  if (user.role === 'alumni') {
    const { data: p } = await db
      .from('alumni_profiles')
      .select(
        'designation, industry, location, experience_years, skills, bio, mentorship_available, mock_interview_available, referral_available, internship_available, current_company:companies!current_company_id(name), record:alumni_records!record_id(id, branch, batch_year, city, claim_status, first_role, first_company:companies!first_company_id(name))'
      )
      .eq('user_id', userId)
      .maybeSingle();
    const record: any = one((p as any)?.record);
    const company = one((p as any)?.current_company as any)?.name ?? null;
    const firstCompany = one(record?.first_company)?.name ?? null;
    const work = [p?.designation, company].filter(Boolean).join(' at ');
    const cohort = record ? `${record.branch} · Class of ${record.batch_year}` : null;

    const experience: MemberProfile['experience'] = [];
    if (p?.designation || company) {
      experience.push({
        title: p?.designation ?? 'Current role',
        company,
        detail: [p?.industry, p?.experience_years ? `${p.experience_years} years since graduating` : null].filter(Boolean).join(' · ') || null,
      });
    }
    if (record?.first_role || firstCompany) {
      if (!(firstCompany && firstCompany === company && !record?.first_role)) {
        experience.push({ title: record?.first_role ?? 'First job', company: firstCompany, detail: 'First job after SJCEM, from the college placement record' });
      }
    }

    return {
      ...base,
      headline: [work || 'Alumnus', cohort].filter(Boolean).join(' · '),
      location: p?.location ?? record?.city ?? null,
      branch: record?.branch ?? null,
      batch_year: record?.batch_year ?? null,
      bio: p?.bio ?? null,
      skills: p?.skills ?? [],
      record_id: record?.id ?? null,
      verified: record?.claim_status === 'verified',
      experience,
      availability: [
        p?.mentorship_available && 'Mentorship',
        p?.mock_interview_available && 'Mock interviews',
        p?.referral_available && 'Referrals',
        p?.internship_available && 'Internships',
      ].filter(Boolean) as string[],
    };
  }

  if (user.role === 'student') {
    const { data: s } = await db
      .from('student_profiles')
      .select('branch, batch_year, skills, target_role, target_company, target_industry, location_pref')
      .eq('user_id', userId)
      .maybeSingle();
    return {
      ...base,
      headline: s ? `Student · ${s.branch} · Class of ${s.batch_year}` : 'Student',
      location: s?.location_pref ?? null,
      branch: s?.branch ?? null,
      batch_year: s?.batch_year ?? null,
      skills: s?.skills ?? [],
      goals: [
        s?.target_role && { label: 'Target role', value: s.target_role },
        s?.target_company && { label: 'Target company', value: s.target_company },
        s?.target_industry && { label: 'Industry', value: s.target_industry },
      ].filter(Boolean) as MemberProfile['goals'],
    };
  }

  return { ...base, headline: 'AlumniBridge team' };
}

/** Note that `viewerId` looked at `viewedId`'s profile today (once per day). */
export async function recordProfileView(viewerId: string, viewedId: string): Promise<void> {
  if (viewerId === viewedId) return;
  const db = createAdminClient();
  await db
    .from('profile_views')
    .upsert({ viewer_id: viewerId, viewed_id: viewedId }, { onConflict: 'viewer_id,viewed_id,viewed_on', ignoreDuplicates: true });
}
