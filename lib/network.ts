import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Role } from '@/lib/session';

/* ------------------------------------------------------------------ */
/* Connections: mutual, LinkedIn-style                                  */
/* ------------------------------------------------------------------ */

export type ConnectionState =
  | { state: 'none' }
  | { state: 'self' }
  | { state: 'pending_out'; id: string }
  | { state: 'pending_in'; id: string }
  | { state: 'connected'; id: string };

/** A member as a small card: name, role and a one-line headline. */
export type MemberCard = {
  id: string;
  role: Role;
  full_name: string;
  headline: string;
  branch: string | null;
  batch_year: number | null;
  company: string | null;
  location: string | null;
  avatar_url: string | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const chunks = <T,>(arr: T[], n = 150) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** Public URL of a stored profile photo or cover. */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
}

/** Cards for many members at once, in the order given. */
export async function getMemberCards(ids: string[]): Promise<MemberCard[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return [];
  const db = createAdminClient();
  const users: any[] = [];
  const alumni: any[] = [];
  const students: any[] = [];
  for (const part of chunks(unique)) {
    const [u, a, s] = await Promise.all([
      db.from('users').select('id, role, full_name, avatar_path').in('id', part),
      db
        .from('alumni_profiles')
        .select('user_id, designation, location, current_company:companies!current_company_id(name), record:alumni_records!record_id(branch, batch_year, city)')
        .in('user_id', part),
      db.from('student_profiles').select('user_id, branch, batch_year, location_pref, target_role').in('user_id', part),
    ]);
    users.push(...(u.data ?? []));
    alumni.push(...(a.data ?? []));
    students.push(...(s.data ?? []));
  }
  const alumniBy = new Map(alumni.map((a) => [a.user_id, a]));
  const studentBy = new Map(students.map((s) => [s.user_id, s]));
  const byId = new Map<string, MemberCard>();
  for (const u of users) {
    const a = alumniBy.get(u.id);
    const s = studentBy.get(u.id);
    const record = one(a?.record) as any;
    const company = (one(a?.current_company) as any)?.name ?? null;
    const branch = record?.branch ?? s?.branch ?? null;
    const batch = record?.batch_year ?? s?.batch_year ?? null;
    const cohort = branch && batch ? `${branch} ${batch}` : null;
    const headline =
      u.role === 'alumni'
        ? [[a?.designation, company].filter(Boolean).join(' at ') || 'Alumnus', cohort].filter(Boolean).join(' · ')
        : u.role === 'student'
          ? [s?.target_role ? `Student · aiming for ${s.target_role}` : 'Student', cohort].filter(Boolean).join(' · ')
          : 'AlumniBridge team';
    byId.set(u.id, {
      id: u.id,
      role: u.role,
      full_name: u.full_name,
      headline,
      branch,
      batch_year: batch,
      company,
      location: a?.location ?? record?.city ?? s?.location_pref ?? null,
      avatar_url: avatarUrl(u.avatar_path),
    });
  }
  return unique.map((id) => byId.get(id)).filter(Boolean) as MemberCard[];
}

/** Where the viewer stands with another member. */
export async function getConnectionState(viewerId: string, otherId: string): Promise<ConnectionState> {
  if (viewerId === otherId) return { state: 'self' };
  const db = createAdminClient();
  const { data } = await db
    .from('connections')
    .select('id, requester_id, status')
    .or(`and(requester_id.eq.${viewerId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${viewerId})`)
    .maybeSingle();
  if (!data || data.status === 'ignored') {
    // An ignored invitation reads as "pending" to the person who sent it, as on LinkedIn.
    if (data?.status === 'ignored' && data.requester_id === viewerId) return { state: 'pending_out', id: data.id };
    return { state: 'none' };
  }
  if (data.status === 'accepted') return { state: 'connected', id: data.id };
  return data.requester_id === viewerId ? { state: 'pending_out', id: data.id } : { state: 'pending_in', id: data.id };
}

/** Ids of everyone the member is connected to. */
export async function connectionIds(userId: string): Promise<string[]> {
  const db = createAdminClient();
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from('connections')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .range(from, from + 999);
    for (const c of data ?? []) ids.push(c.requester_id === userId ? c.addressee_id : c.requester_id);
    if (!data || data.length < 1000) return ids;
  }
}

export async function countConnections(userId: string): Promise<number> {
  const db = createAdminClient();
  const { count } = await db
    .from('connections')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  return count ?? 0;
}

export async function countPendingInvitations(userId: string): Promise<number> {
  const db = createAdminClient();
  const { count } = await db
    .from('connections')
    .select('id', { count: 'exact', head: true })
    .eq('addressee_id', userId)
    .eq('status', 'pending');
  return count ?? 0;
}

/** How many connections two members share. */
export async function mutualCount(a: string, b: string): Promise<number> {
  const [x, y] = await Promise.all([connectionIds(a), connectionIds(b)]);
  const set = new Set(x);
  return y.filter((id) => set.has(id)).length;
}

export type Invitation = { id: string; message: string | null; created_at: string; member: MemberCard };

/** Invitations waiting on the member (received) and the ones they sent. */
export async function getInvitations(userId: string): Promise<{ received: Invitation[]; sent: Invitation[] }> {
  const db = createAdminClient();
  const [{ data: inbound }, { data: outbound }] = await Promise.all([
    db.from('connections').select('id, requester_id, message, created_at').eq('addressee_id', userId).eq('status', 'pending').order('created_at', { ascending: false }).limit(100),
    db.from('connections').select('id, addressee_id, message, created_at').eq('requester_id', userId).in('status', ['pending', 'ignored']).order('created_at', { ascending: false }).limit(100),
  ]);
  const cards = new Map(
    (await getMemberCards([...(inbound ?? []).map((r) => r.requester_id), ...(outbound ?? []).map((r) => r.addressee_id)])).map((c) => [c.id, c])
  );
  const shape = (rows: any[], key: 'requester_id' | 'addressee_id') =>
    rows
      .map((r) => ({ id: r.id, message: r.message, created_at: r.created_at, member: cards.get(r[key])! }))
      .filter((r) => r.member);
  return { received: shape(inbound ?? [], 'requester_id'), sent: shape(outbound ?? [], 'addressee_id') };
}

/** The member's connections as cards, newest first. */
export async function getConnections(userId: string, limit = 200): Promise<(MemberCard & { connected_at: string })[]> {
  const db = createAdminClient();
  const { data } = await db
    .from('connections')
    .select('requester_id, addressee_id, responded_at, created_at')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order('responded_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  const rows = (data ?? []).map((c) => ({
    peer: c.requester_id === userId ? c.addressee_id : c.requester_id,
    at: c.responded_at ?? c.created_at,
  }));
  const cards = new Map((await getMemberCards(rows.map((r) => r.peer))).map((c) => [c.id, c]));
  return rows.map((r) => (cards.has(r.peer) ? { ...cards.get(r.peer)!, connected_at: r.at } : null)).filter(Boolean) as any;
}

export type Suggestion = MemberCard & { mutuals: number; reason: string; score: number };

/**
 * People you may know: friends of friends first, then members who share the
 * viewer's branch, nearby batches, employer or city. Anyone already connected
 * or invited either way is left out.
 */
export async function peopleYouMayKnow(userId: string, limit = 12): Promise<Suggestion[]> {
  const db = createAdminClient();
  const [mine, { data: links }, me] = await Promise.all([
    connectionIds(userId),
    db.from('connections').select('requester_id, addressee_id').or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    getMemberCards([userId]).then((c) => c[0]),
  ]);
  const exclude = new Set<string>([userId, ...(links ?? []).flatMap((l) => [l.requester_id, l.addressee_id])]);

  // Second-degree: connections of the viewer's connections, counted.
  const mutuals = new Map<string, number>();
  for (const part of chunks(mine, 60)) {
    const { data } = await db
      .from('connections')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(part.map((id) => `requester_id.eq.${id},addressee_id.eq.${id}`).join(','))
      .limit(5000);
    const set = new Set(part);
    for (const c of data ?? []) {
      for (const [mineSide, other] of [
        [c.requester_id, c.addressee_id],
        [c.addressee_id, c.requester_id],
      ]) {
        if (set.has(mineSide) && !exclude.has(other)) mutuals.set(other, (mutuals.get(other) ?? 0) + 1);
      }
    }
  }

  // Same branch and nearby batches, from both alumni and students.
  const nearby = new Set<string>();
  if (me?.branch) {
    const lo = (me.batch_year ?? 2020) - 3;
    const hi = (me.batch_year ?? 2020) + 3;
    const [{ data: alumni }, { data: students }] = await Promise.all([
      db.from('alumni_directory').select('user_id').eq('branch', me.branch).gte('batch_year', lo).lte('batch_year', hi).not('user_id', 'is', null).limit(300),
      db.from('student_profiles').select('user_id').eq('branch', me.branch).limit(100),
    ]);
    for (const r of [...(alumni ?? []), ...(students ?? [])]) if (!exclude.has(r.user_id)) nearby.add(r.user_id);
  }

  const pool = [...new Set([...mutuals.keys(), ...nearby])].slice(0, 400);
  const cards = await getMemberCards(pool);
  const scored = cards.map((c) => {
    const m = mutuals.get(c.id) ?? 0;
    const sameBranch = !!me?.branch && c.branch === me.branch;
    const batchGap = me?.batch_year && c.batch_year ? Math.abs(me.batch_year - c.batch_year) : 9;
    const sameCompany = !!me?.company && c.company === me.company;
    const sameCity = !!me?.location && c.location === me.location;
    const score = 3 * m + (sameBranch ? 2 : 0) + Math.max(0, 1 - batchGap / 5) + (sameCompany ? 2 : 0) + (sameCity ? 0.5 : 0);
    const reason =
      m > 0
        ? `${m} mutual connection${m === 1 ? '' : 's'}`
        : sameCompany
          ? `Also at ${c.company}`
          : sameBranch && c.batch_year
            ? `${c.branch}, class of ${c.batch_year}`
            : 'From SJCEM';
    return { ...c, mutuals: m, reason, score };
  });
  return scored.sort((a, b) => b.score - a.score || a.full_name.localeCompare(b.full_name)).slice(0, limit);
}
