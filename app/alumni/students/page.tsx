import Link from 'next/link';
import { GraduationCap, MapPin, Search, Target, Users } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getAlumniProfile } from '@/lib/queries';
import { getStudentDirectory } from '@/lib/students';
import { createAdminClient } from '@/lib/supabase/admin';
import { DashboardShell } from '@/components/dashboard/shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, MemberAvatar, MatchScore } from '@/components/patterns';
import { ConnectButton, type ButtonState } from '@/components/network/connect-button';

export const metadata = { title: 'Find students' };
export const dynamic = 'force-dynamic';

type SP = { q?: string; branch?: string; batch?: string; skill?: string; sort?: string };

/**
 * The student directory, the alumni mirror of the alumni directory: search
 * and filter every student with a profile, ranked by how well each fits what
 * this alumnus can offer, with the reasons shown.
 */
export default async function FindStudentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(['alumni']);
  const sp = await searchParams;
  const sort = sp.sort === 'name' || sp.sort === 'batch' ? sp.sort : 'match';
  const [badges, profile] = await Promise.all([getNavBadges(user), getAlumniProfile(user.id)]);
  const me = {
    designation: profile?.designation ?? null,
    industry: profile?.industry ?? null,
    location: profile?.location ?? null,
    skills: profile?.skills ?? [],
    current_company: profile?.current_company ?? null,
  };
  const dir = await getStudentDirectory({ q: sp.q, branch: sp.branch, batch: sp.batch, skill: sp.skill, sort }, me);

  // One query for every card's connection state.
  const db = createAdminClient();
  const { data: links } = await db
    .from('connections')
    .select('id, requester_id, addressee_id, status')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
  const stateFor = (id: string): ButtonState => {
    const l = (links ?? []).find((x) => x.requester_id === id || x.addressee_id === id);
    if (!l) return { state: 'none' };
    if (l.status === 'accepted') return { state: 'connected', id: l.id };
    if (l.requester_id === user.id) return { state: 'pending_out', id: l.id };
    return l.status === 'pending' ? { state: 'pending_in', id: l.id } : { state: 'none' };
  };

  const select = 'h-9 rounded-lg border border-input bg-background px-2 text-sm';

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Find students"
      description="Every student on AlumniBridge, ranked by how well what they want matches what you can offer."
    >
      <Card className="gap-0 p-4">
        <form className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto]" role="search">
          <label className="relative">
            <span className="sr-only">Search students</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={sp.q} placeholder="Name, target role or company" className="h-9 pl-9" />
          </label>
          <select name="branch" defaultValue={sp.branch ?? ''} className={select} aria-label="Branch">
            <option value="">All branches</option>
            {dir.branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select name="batch" defaultValue={sp.batch ?? ''} className={select} aria-label="Graduating year">
            <option value="">All years</option>
            {dir.batches.map((b) => (
              <option key={b} value={b}>
                Class of {b}
              </option>
            ))}
          </select>
          <Input name="skill" defaultValue={sp.skill} placeholder="Skill" className="h-9 sm:w-32" aria-label="Skill" />
          <select name="sort" defaultValue={sort} className={select} aria-label="Sort">
            <option value="match">Best fit</option>
            <option value="batch">Graduating soonest</option>
            <option value="name">Name</option>
          </select>
          <Button type="submit" className="h-9">
            Search
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          {dir.items.length} of {dir.total} students
          {(sp.q || sp.branch || sp.batch || sp.skill) && (
            <>
              {' · '}
              <Link href="/alumni/students" className="text-primary hover:underline">
                Clear filters
              </Link>
            </>
          )}
        </p>
      </Card>

      {dir.items.length === 0 ? (
        <EmptyState icon={Users} title="No students match" description="Try fewer filters, or a broader skill." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dir.items.map((s) => (
            <li key={s.id}>
              <Card className="h-full gap-0 p-4">
                <div className="flex items-start gap-3">
                  <Link href={`/alumni/people/${s.id}`} tabIndex={-1}>
                    <MemberAvatar name={s.full_name} url={s.avatar_url} size="lg" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/alumni/people/${s.id}`} className="line-clamp-1 text-sm font-semibold text-foreground hover:text-primary hover:underline">
                      {s.full_name}
                    </Link>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <GraduationCap className="size-3.5" />
                      {s.branch} · Class of {s.batch_year}
                    </p>
                    {s.target_role && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-foreground">
                        <Target className="size-3.5 text-muted-foreground" />
                        {s.target_role}
                        {s.target_company ? ` at ${s.target_company}` : ''}
                      </p>
                    )}
                    {s.location && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3.5" />
                        {s.location}
                      </p>
                    )}
                  </div>
                  <MatchScore score={s.fit.score} matchable size={44} />
                </div>
                {s.skills.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {s.skills.slice(0, 6).map((k) => (
                      <span key={k} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {k}
                      </span>
                    ))}
                  </div>
                )}
                {s.fit.signals[0] && <p className="mt-2 text-xs text-primary">{s.fit.signals[0]}</p>}
                <div className="mt-3 flex gap-2">
                  <ConnectButton userId={s.id} name={s.full_name} initial={stateFor(s.id)} size="sm" />
                  <Button size="sm" variant="ghost" render={<Link href={`/alumni/people/${s.id}`} />}>
                    View profile
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </DashboardShell>
  );
}
