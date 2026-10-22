import Link from 'next/link';
import { Briefcase, Building2, CalendarClock, ExternalLink, GraduationCap, MapPin, Send, Users, Wallet, Timer } from 'lucide-react';
import { OPPORTUNITY_LABEL, WORK_MODE_LABEL } from '@/lib/feed-shared';
import { formatDate } from '@/lib/format';
import type { FeedOpportunity } from '@/lib/posts';
import type { SessionUser } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const KIND_ICON = { job: Briefcase, internship: GraduationCap, placement: Users, referral: Send } as const;

/** Days until a YYYY-MM-DD deadline, counted in IST like the rest of the app. */
function daysLeft(deadline: string): number {
  const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  return Math.round((new Date(deadline).getTime() - today.getTime()) / 86_400_000);
}

/**
 * The listing inside an opportunity post: what it is, the facts a student
 * needs to decide, and one clear way to respond. Server-rendered (the deadline
 * countdown reads the clock).
 */
export function OpportunityCard({
  opportunity: o,
  viewer,
  posterId,
  posterRecordId,
}: {
  opportunity: FeedOpportunity;
  viewer: SessionUser;
  posterId: string;
  posterRecordId: string | null;
}) {
  const Icon = KIND_ICON[o.type] ?? Briefcase;
  const left = o.deadline ? daysLeft(o.deadline) : null;
  const closed = !o.open || (left !== null && left < 0);
  const facts = [
    o.location && { icon: MapPin, text: [o.location, o.work_mode && WORK_MODE_LABEL[o.work_mode]].filter(Boolean).join(' · ') },
    !o.location && o.work_mode && { icon: MapPin, text: WORK_MODE_LABEL[o.work_mode] },
    o.experience && { icon: Briefcase, text: o.experience },
    o.compensation && { icon: Wallet, text: o.compensation },
    o.duration && { icon: Timer, text: o.duration },
  ].filter(Boolean) as { icon: typeof MapPin; text: string }[];

  // Students respond; the poster manages; other alumni can only look.
  const requestType = o.type === 'internship' ? 'internship' : 'referral';
  const requestHref =
    viewer.role === 'student' && posterRecordId
      ? `/student/directory/${posterRecordId}?request=${requestType}&about=${encodeURIComponent(o.title)}`
      : null;

  return (
    <section
      aria-label={`${OPPORTUNITY_LABEL[o.type]}: ${o.title}`}
      className="mx-4 mt-3 rounded-xl border border-border bg-[var(--surface)] p-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className="h-5 rounded-md bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
              {OPPORTUNITY_LABEL[o.type]}
            </Badge>
            {closed ? (
              <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[11px]">
                Closed
              </Badge>
            ) : (
              left !== null &&
              left <= 7 && (
                <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[11px] text-[var(--warning)]">
                  {left === 0 ? 'Closes today' : `${left} day${left === 1 ? '' : 's'} left`}
                </Badge>
              )
            )}
          </div>
          <h3 className="mt-1 text-[15px] font-semibold leading-snug text-foreground">{o.title}</h3>
          {o.company && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-foreground">
              <Building2 className="size-3.5 text-muted-foreground" />
              {o.company}
            </p>
          )}
        </div>
      </div>

      {facts.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {facts.map((f, i) => (
            <li key={i} className="inline-flex items-center gap-1">
              <f.icon className="size-3.5" />
              {f.text}
            </li>
          ))}
          {o.deadline && (
            <li className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" />
              Apply by {formatDate(o.deadline)}
            </li>
          )}
        </ul>
      )}

      {o.eligibility && <p className="mt-2 text-xs text-foreground"><span className="font-medium">Eligibility:</span> {o.eligibility}</p>}

      {o.skills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {o.skills.slice(0, 8).map((s) => (
            <span key={s} className="rounded-md bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border">
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {viewer.role === 'student' && !closed && o.apply_via === 'link' && o.application_link && (
          <Button size="sm" render={<a href={o.application_link} target="_blank" rel="noreferrer noopener nofollow" />}>
            <ExternalLink />
            Apply
          </Button>
        )}
        {requestHref && !closed && (
          <Button size="sm" variant={o.apply_via === 'link' ? 'outline' : 'default'} render={<Link href={requestHref} />}>
            <Send />
            {o.type === 'internship' ? 'Ask about this internship' : 'Request referral'}
          </Button>
        )}
        {viewer.role === 'student' && !closed && o.apply_via === 'message' && (
          <Button size="sm" variant="outline" render={<Link href={`/student/people/${posterId}`} />}>
            Message the poster
          </Button>
        )}
        {viewer.id === posterId && (
          <Button size="sm" variant="outline" render={<Link href="/alumni/opportunities" />}>
            Manage in My Postings
          </Button>
        )}
        {viewer.role !== 'student' && viewer.id !== posterId && (
          <span className={cn('text-xs text-muted-foreground')}>Students apply from this post.</span>
        )}
      </div>
    </section>
  );
}
