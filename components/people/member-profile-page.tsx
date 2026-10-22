import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowDown, BadgeCheck, Briefcase, GraduationCap, MapPin, MessageSquare, Newspaper, Pencil, Send, Target } from 'lucide-react';
import { getNavBadges } from '@/lib/badges';
import { getFeed } from '@/lib/posts';
import { getMemberProfile, recordProfileView } from '@/lib/people';
import { countConnections, getConnectionState, mutualCount } from '@/lib/network';
import { formatMonthYear } from '@/lib/format';
import type { SessionUser } from '@/lib/session';
import { DashboardShell } from '@/components/dashboard/shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, MemberAvatar, SkillTags } from '@/components/patterns';
import { ConnectButton } from '@/components/network/connect-button';
import { PostCard } from '@/components/feed/post-card';

const COLLEGE = 'St John College of Engineering and Management';

/** A member's profile as any signed-in student or alumnus sees it, with their posts. */
export async function MemberProfilePage({
  viewer,
  userId,
  before,
}: {
  viewer: SessionUser;
  userId: string;
  before?: string;
}) {
  const [badges, person, posts, connection, connections, mutuals] = await Promise.all([
    getNavBadges(viewer),
    getMemberProfile(userId),
    getFeed({ viewerId: viewer.id, authorId: userId, cursor: before, limit: 10 }),
    getConnectionState(viewer.id, userId),
    countConnections(userId),
    viewer.id === userId ? Promise.resolve(0) : mutualCount(viewer.id, userId),
  ]);
  if (!person) notFound();
  if (person.id !== viewer.id && person.role !== 'admin') await recordProfileView(viewer.id, person.id);

  const prefix = viewer.role === 'alumni' ? '/alumni' : '/student';
  const self = person.id === viewer.id;
  const editHref = viewer.role === 'alumni' ? '/alumni/profile' : '/student/settings';
  // Students reach out to alumni from the directory page, which carries the request form.
  const requestHref =
    viewer.role === 'student' && person.role === 'alumni' && person.record_id ? `/student/directory/${person.record_id}` : null;

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
            <div
              className="h-28 bg-primary/15 sm:h-36"
            />
            <div className="px-5 pb-5">
              <div className="-mt-12 flex items-end justify-between gap-3 sm:-mt-14">
                <span className="rounded-full ring-4 ring-card">
                  <MemberAvatar name={person.full_name} url={person.avatar_url} size="xl" className="sm:size-28 sm:text-3xl" />
                </span>
                <div className="flex flex-wrap justify-end gap-2 pb-1">
                  {self ? (
                    <Button variant="outline" size="sm" render={<Link href={editHref} />}>
                      <Pencil />
                      Edit profile
                    </Button>
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
                <h2 className="font-display text-xl text-foreground sm:text-2xl">{person.full_name}</h2>
                {person.verified && (
                  <BadgeCheck className="size-5 text-primary" aria-label="Verified alumnus" />
                )}
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
                <Link
                  href={self ? `${prefix}/network?tab=connections` : `${prefix}/people/${person.id}`}
                  className="font-semibold text-primary hover:underline"
                >
                  {connections === 1 ? '1 connection' : `${connections >= 500 ? '500+' : connections} connections`}
                </Link>
                {!self && mutuals > 0 && (
                  <span className="text-muted-foreground"> · {mutuals} mutual{mutuals === 1 ? '' : 's'}</span>
                )}
              </p>
            </div>
          </Card>

          {person.bio && (
            <Card className="gap-0 p-5">
              <h3 className="text-base font-semibold text-foreground">About</h3>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">{person.bio}</p>
            </Card>
          )}

          {person.experience.length > 0 && (
            <Card className="gap-0 p-5">
              <h3 className="text-base font-semibold text-foreground">Experience</h3>
              <ul className="mt-3 space-y-4">
                {person.experience.map((e, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Briefcase className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{e.title}</p>
                      {e.company && <p className="text-sm text-foreground">{e.company}</p>}
                      {e.detail && <p className="mt-0.5 text-xs text-muted-foreground">{e.detail}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {person.goals.length > 0 && (
            <Card className="gap-0 p-5">
              <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Target className="size-4 text-muted-foreground" />
                Looking for
              </h3>
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
            <h3 className="px-1 pt-1 text-base font-semibold text-foreground">
              {self ? 'Your posts' : 'Posts'}
            </h3>
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

        <aside className="space-y-3 xl:sticky xl:top-4">
          <Card className="gap-0 p-5">
            <h3 className="text-sm font-semibold text-foreground">Skills</h3>
            <div className="mt-3">
              {person.skills.length ? (
                <SkillTags skills={person.skills} max={20} />
              ) : (
                <p className="text-xs text-muted-foreground">No skills listed.</p>
              )}
            </div>
          </Card>

          {person.role === 'alumni' && (
            <Card className="gap-0 p-5">
              <h3 className="text-sm font-semibold text-foreground">Open to</h3>
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

          {(person.branch || person.batch_year) && (
            <Card className="gap-0 p-5">
              <h3 className="text-sm font-semibold text-foreground">Education</h3>
              <div className="mt-3 flex gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <GraduationCap className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{COLLEGE}</p>
                  <p className="text-xs text-muted-foreground">
                    {[person.branch, person.batch_year && `Class of ${person.batch_year}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </DashboardShell>
  );
}
