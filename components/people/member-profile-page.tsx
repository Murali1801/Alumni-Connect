import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowDown, BadgeCheck, Briefcase, Eye, GraduationCap, MapPin, MessageSquare, Newspaper, Send, Target } from 'lucide-react';
import { getNavBadges } from '@/lib/badges';
import { getFeed } from '@/lib/posts';
import { getMemberProfile, getProfileViews, recordProfileView, type ExperienceEntry } from '@/lib/people';
import { countConnections, getConnectionState, mutualCount } from '@/lib/network';
import { formatDate, formatMonthYear, formatShortMonthYear } from '@/lib/format';
import type { SessionUser } from '@/lib/session';
import { DashboardShell } from '@/components/dashboard/shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, MemberAvatar } from '@/components/patterns';
import { ConnectButton } from '@/components/network/connect-button';
import { PostCard } from '@/components/feed/post-card';
import {
  AboutEditor,
  AvailabilityEditor,
  EndorseButton,
  EntryEditor,
  IntroEditor,
  PhotoButton,
  SkillsEditor,
} from '@/components/people/profile-editors';

const COLLEGE = 'St John College of Engineering and Management';

function period(e: ExperienceEntry) {
  const from = formatShortMonthYear(e.start_date);
  const to = e.end_date ? formatShortMonthYear(e.end_date) : 'Present';
  return `${from} – ${to}`;
}

/** One work or education line, from the record or written by the member. */
function EntryRow({
  icon: Icon,
  title,
  org,
  meta,
  description,
  action,
}: {
  icon: typeof Briefcase;
  title: string;
  org: string | null;
  meta?: string | null;
  description?: string | null;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {org && <p className="text-sm text-foreground">{org}</p>}
        {meta && <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>}
        {description && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground">{description}</p>}
      </div>
      {action}
    </li>
  );
}

/**
 * A member's profile as any signed-in student or alumnus sees it, with their
 * posts. On your own profile every section has a pencil: everything shown is
 * editable in place, LinkedIn-style. Others can endorse your skills.
 */
export async function MemberProfilePage({
  viewer,
  userId,
  before,
}: {
  viewer: SessionUser;
  userId: string;
  before?: string;
}) {
  const self = userId === viewer.id;
  const [badges, person, posts, connection, connections, mutuals, views] = await Promise.all([
    getNavBadges(viewer),
    getMemberProfile(userId, viewer.id),
    getFeed({ viewerId: viewer.id, authorId: userId, cursor: before, limit: 10 }),
    getConnectionState(viewer.id, userId),
    countConnections(userId),
    self ? Promise.resolve(0) : mutualCount(viewer.id, userId),
    self ? getProfileViews(userId) : Promise.resolve(null),
  ]);
  if (!person) notFound();
  if (!self && person.role !== 'admin') await recordProfileView(viewer.id, person.id);

  const prefix = viewer.role === 'alumni' ? '/alumni' : '/student';
  const editable = self && (person.role === 'student' || person.role === 'alumni');
  const memberRole = person.role === 'alumni' ? 'alumni' : 'student';
  // Students reach out to alumni from the directory page, which carries the request form.
  const requestHref =
    viewer.role === 'student' && person.role === 'alumni' && person.record_id ? `/student/directory/${person.record_id}` : null;
  const work = person.entries.filter((e) => e.kind === 'work');
  const education = person.entries.filter((e) => e.kind === 'education');

  return (
    <DashboardShell
      user={viewer}
      badges={badges}
      bare
      title={self ? 'Your profile' : person.full_name}
      description={self ? 'How other members see you on AlumniBridge.' : person.headline}
    >
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-3">
          <Card className="gap-0 overflow-hidden py-0">
            <div className="relative h-28 bg-primary/15 sm:h-40">
              {person.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={person.cover_url} alt="" className="absolute inset-0 size-full object-cover" />
              )}
              {editable && <PhotoButton kind="cover" hasPhoto={!!person.cover_url} className="absolute right-3 top-3" />}
            </div>
            <div className="px-5 pb-5">
              <div className="-mt-12 flex items-end justify-between gap-3 sm:-mt-16">
                <span className="relative rounded-full ring-4 ring-card">
                  <MemberAvatar name={person.full_name} url={person.avatar_url} size="xl" className="sm:size-32 sm:text-3xl" />
                  {editable && <PhotoButton kind="avatar" hasPhoto={!!person.avatar_url} className="absolute -bottom-1 -right-1" />}
                </span>
                <div className="flex flex-wrap justify-end gap-2 pb-1">
                  {editable ? (
                    <IntroEditor role={memberRole} initial={person.edit} />
                  ) : person.role !== 'admin' ? (
                    <>
                      {connection.state === 'connected' && (
                        <Button size="sm" render={<Link href={`${prefix}/messages?peer=${person.id}`} />}>
                          <MessageSquare />
                          Message
                        </Button>
                      )}
                      <ConnectButton userId={person.id} name={person.full_name} initial={connection} size="sm" />
                      {requestHref && (
                        <Button size="sm" variant="outline" render={<Link href={requestHref} />}>
                          <Send />
                          Request mentorship
                        </Button>
                      )}
                    </>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <h1 className="font-display text-xl text-foreground sm:text-2xl">{person.full_name}</h1>
                {person.verified && <BadgeCheck className="size-5 text-primary" aria-label="Verified alumnus" />}
                <Badge variant="secondary" className="font-normal capitalize">
                  {person.role === 'alumni' ? 'Alumnus' : person.role}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-foreground">{person.headline}</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {person.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {person.location}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <GraduationCap className="size-3.5" />
                  {COLLEGE}
                </span>
                <span>Joined {formatMonthYear(person.joined_at)}</span>
              </p>
              <p className="mt-2 text-xs">
                <Link href={self ? `${prefix}/network?tab=connections` : `${prefix}/people/${person.id}`} className="font-semibold text-primary hover:underline">
                  {connections === 1 ? '1 connection' : `${connections >= 500 ? '500+' : connections} connections`}
                </Link>
                {!self && mutuals > 0 && <span className="text-muted-foreground"> · {mutuals} mutual{mutuals === 1 ? '' : 's'}</span>}
              </p>
            </div>
          </Card>

          {(person.bio || editable) && (
            <Card className="gap-0 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-foreground">About</h2>
                {editable && <AboutEditor initial={person.edit.bio} />}
              </div>
              {person.bio ? (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">{person.bio}</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Tell people what you do and how you can help. Use the pencil to add it.</p>
              )}
            </Card>
          )}

          {(person.experience.length > 0 || work.length > 0 || editable) && (
            <Card className="gap-0 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-foreground">Experience</h2>
                {editable && <EntryEditor kind="work" />}
              </div>
              <ul className="mt-3 space-y-4">
                {work.map((e) => (
                  <EntryRow
                    key={e.id}
                    icon={Briefcase}
                    title={e.title}
                    org={e.organisation}
                    meta={[period(e), e.location].filter(Boolean).join(' · ')}
                    description={e.description}
                    action={editable ? <EntryEditor kind="work" entry={e} /> : null}
                  />
                ))}
                {person.experience.map((e, i) => (
                  <EntryRow key={`r${i}`} icon={Briefcase} title={e.title} org={e.company} meta={e.detail} />
                ))}
                {person.experience.length === 0 && work.length === 0 && <li className="text-sm text-muted-foreground">Add your internships and jobs with the plus.</li>}
              </ul>
            </Card>
          )}

          <Card className="gap-0 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">Education</h2>
              {editable && <EntryEditor kind="education" />}
            </div>
            <ul className="mt-3 space-y-4">
              <EntryRow
                icon={GraduationCap}
                title={COLLEGE}
                org={[person.branch, person.batch_year && `Class of ${person.batch_year}`].filter(Boolean).join(' · ') || null}
              />
              {education.map((e) => (
                <EntryRow
                  key={e.id}
                  icon={GraduationCap}
                  title={e.organisation}
                  org={e.title}
                  meta={[period(e), e.location].filter(Boolean).join(' · ')}
                  description={e.description}
                  action={editable ? <EntryEditor kind="education" entry={e} /> : null}
                />
              ))}
            </ul>
          </Card>

          {person.goals.length > 0 && (
            <Card className="gap-0 p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Target className="size-4 text-muted-foreground" />
                Looking for
              </h2>
              <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {person.goals.map((g) => (
                  <div key={g.label}>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.label}</dt>
                    <dd className="mt-0.5 text-sm text-foreground">{g.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}

          <section className="space-y-3" aria-label="Posts">
            <h2 className="px-1 pt-1 text-base font-semibold text-foreground">{self ? 'Your posts' : 'Posts'}</h2>
            {posts.items.length === 0 ? (
              <EmptyState
                icon={Newspaper}
                title="No posts yet"
                description={self ? 'Share something from Home and it shows up here.' : `${person.full_name.split(' ')[0]} has not posted yet.`}
              />
            ) : (
              posts.items.map((post) => <PostCard key={post.id} post={post} viewer={viewer} />)
            )}
            {posts.next && (
              <div className="flex justify-center pt-1">
                <Button variant="outline" render={<Link href={`${prefix}/people/${person.id}?before=${encodeURIComponent(posts.next)}`} />}>
                  <ArrowDown className="size-4" />
                  Older posts
                </Button>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-[4.5rem]">
          {views && (
            <Card className="gap-0 p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Eye className="size-4 text-muted-foreground" />
                Who viewed your profile
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="tnum font-semibold text-foreground">{views.total}</span> {views.total === 1 ? 'person' : 'people'} in the last 90 days
              </p>
              {views.recent.length > 0 && (
                <ul className="mt-3 space-y-2.5">
                  {views.recent.map((v) => (
                    <li key={v.id}>
                      <Link href={`${prefix}/people/${v.id}`} className="flex items-center gap-2.5 rounded-lg transition-colors hover:bg-muted">
                        <MemberAvatar name={v.full_name} url={v.avatar_url} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{v.full_name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{v.headline}</span>
                        </span>
                        <span className="tnum shrink-0 text-[11px] text-muted-foreground">{formatDate(v.viewed_on)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card className="gap-0 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Skills</h2>
              {editable && <SkillsEditor initial={person.edit.skills} />}
            </div>
            {person.skills.length ? (
              <ul className="mt-3 space-y-2">
                {person.skills.slice(0, 20).map((s) => {
                  const e = person.endorsements[s.toLowerCase()] ?? { count: 0, mine: false };
                  return (
                    <li key={s} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-foreground">{s}</span>
                      {self || person.role === 'admin' ? (
                        e.count > 0 && <span className="tnum text-xs text-muted-foreground">{e.count} endorsement{e.count === 1 ? '' : 's'}</span>
                      ) : (
                        <EndorseButton userId={person.id} skill={s} count={e.count} mine={e.mine} />
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">{editable ? 'Add skills with the pencil so matching and endorsements work.' : 'No skills listed.'}</p>
            )}
          </Card>

          {person.role === 'alumni' && (
            <Card className="gap-0 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">Open to</h2>
                {editable && <AvailabilityEditor initial={person.edit} />}
              </div>
              {person.availability.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {person.availability.map((a) => (
                    <Badge key={a} variant="secondary" className="font-normal">
                      {a}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Not taking requests right now.</p>
              )}
              {requestHref && (
                <Button size="sm" className="mt-4 w-full" render={<Link href={requestHref} />}>
                  <Send />
                  Request mentorship
                </Button>
              )}
            </Card>
          )}
        </aside>
      </div>
    </DashboardShell>
  );
}
