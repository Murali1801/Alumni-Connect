import Link from 'next/link';
import { Briefcase, MapPin, ExternalLink, Building2, CalendarDays, GraduationCap, Send, Users, Wallet, CalendarClock } from 'lucide-react';
import { OPPORTUNITY_LABEL, WORK_MODE_LABEL } from '@/lib/feed-shared';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InitialsAvatar, EmptyState } from '@/components/patterns';
import type { OpportunityRow } from '@/lib/queries';
import { formatDate, formatDayMonth } from '@/lib/format';

const KIND_ICON = { job: Briefcase, internship: GraduationCap, placement: Users, referral: Send } as const;

/** Skills the viewer already has, so the card can mark the overlap. */
export type SkillMatch = { have: Set<string> } | null;

export function OpportunityList({
  opportunities,
  skills,
  emptyTitle,
  emptyBody,
  emptyAction,
  showStatus = false,
  manage,
}: {
  opportunities: OpportunityRow[];
  skills?: SkillMatch;
  emptyTitle: string;
  emptyBody: string;
  emptyAction?: React.ReactNode;
  /** Show the open/closed pill — used on the poster's own list. */
  showStatus?: boolean;
  /** Rendered in the card footer for the owner. */
  manage?: (o: OpportunityRow) => React.ReactNode;
}) {
  if (opportunities.length === 0) {
    return <EmptyState icon={Briefcase} title={emptyTitle} description={emptyBody} action={emptyAction} />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {opportunities.map((o) => {
        const matched = skills
          ? (o.target_skills ?? []).filter((s) => skills.have.has(s.toLowerCase())).length
          : 0;
        const total = (o.target_skills ?? []).length;
        const Icon = KIND_ICON[o.type] ?? Briefcase;

        return (
          <Card key={o.id} className="gap-0 p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{o.title}</h3>
                  <Badge variant="secondary" className="font-normal">
                    {OPPORTUNITY_LABEL[o.type] ?? o.type}
                  </Badge>
                  {showStatus && (
                    <Badge variant={o.is_open ? 'outline' : 'ghost'} className="font-normal">
                      {o.is_open ? 'Open' : 'Closed'}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="size-3" />
                    {o.company?.name ?? 'Company not stated'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" />
                    {[o.location ?? 'Location not stated', o.work_mode && WORK_MODE_LABEL[o.work_mode]].filter(Boolean).join(' · ')}
                  </span>
                  {o.compensation && (
                    <span className="inline-flex items-center gap-1">
                      <Wallet className="size-3" />
                      {o.compensation}
                    </span>
                  )}
                  {o.experience && (
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="size-3" />
                      {o.experience}
                    </span>
                  )}
                  {o.deadline && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="size-3" />
                      Apply by {formatDate(o.deadline)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3" />
                    {formatDayMonth(o.created_at)}
                  </span>
                </p>
              </div>
            </div>

            <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{o.description}</p>

            {total > 0 && (
              <div className="mt-3 space-y-1.5">
                {skills && (
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Skills · {matched} of {total} match your profile
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {(o.target_skills ?? []).map((s) => {
                    const have = skills?.have.has(s.toLowerCase());
                    return (
                      <Badge
                        key={s}
                        variant={have ? 'default' : 'outline'}
                        className={cn('font-normal', !have && 'text-muted-foreground')}
                      >
                        {s}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
              {o.poster && (
                <span className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
                  <InitialsAvatar name={o.poster.full_name} size="sm" />
                  Posted by {o.poster.full_name}
                </span>
              )}
              {manage
                ? manage(o)
                : o.application_link && (
                    <Button
                      size="sm"
                      render={
                        <a href={o.application_link} target="_blank" rel="noreferrer noopener">
                          <ExternalLink className="size-3.5" />
                          Apply
                        </a>
                      }
                    />
                  )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
