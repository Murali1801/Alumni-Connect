import Link from 'next/link';
import { CalendarDays, Clock, MapPin, Users } from 'lucide-react';
import type { WorkshopCard } from '@/lib/learning';
import { formatMinutes } from '@/lib/learning-shared';
import { formatDateTime } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MemberAvatar } from '@/components/patterns';
import { RsvpButton } from '@/components/learning/rsvp-button';

/** A workshop as students see it, with the seat button. */
export function WorkshopCardView({ workshop: w, courseBase }: { workshop: WorkshopCard; courseBase: string }) {
  const left = Math.max(0, w.capacity - w.attendees);
  return (
    <Card className="h-full gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold leading-snug text-foreground">{w.title}</h3>
          <p className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden /> {formatDateTime(w.starts_at)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden /> {formatMinutes(w.duration_min)}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden /> {w.location}
            </span>
          </p>
        </div>
        <span className="tnum inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title={`${w.attendees} of ${w.capacity} seats taken`}>
          <Users className="size-3.5" aria-hidden />
          {left > 0 ? `${left} seats left` : 'Full'}
        </span>
      </div>
      {w.description && <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{w.description}</p>}
      {(w.topics.length > 0 || w.course) && (
        <div className="flex flex-wrap gap-1.5">
          {w.course && (
            <Badge variant="secondary" className="font-normal" render={<Link href={`${courseBase}/${w.course.id}`} />}>
              Course: {w.course.title}
            </Badge>
          )}
          {w.topics.map((t) => (
            <Badge key={t} variant="outline" className="font-normal text-muted-foreground">
              {t}
            </Badge>
          ))}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        {w.host ? (
          <div className="flex min-w-0 items-center gap-2">
            <MemberAvatar name={w.host.full_name} url={w.host.avatar_url} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{w.host.full_name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{w.host.headline}</p>
            </div>
          </div>
        ) : (
          <span />
        )}
        <RsvpButton
          workshopId={w.id}
          title={w.title}
          attending={w.attending}
          full={left === 0}
          cancelled={Boolean(w.cancelled_at)}
          roomPath={w.room_path}
        />
      </div>
    </Card>
  );
}
