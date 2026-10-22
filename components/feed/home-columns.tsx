import Link from 'next/link';
import { Briefcase, CalendarClock, ChevronRight, MapPin, Wand2 } from 'lucide-react';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { HomeContext } from '@/lib/home';
import type { SessionUser } from '@/lib/session';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { InitialsAvatar } from '@/components/patterns';

const COLLEGE = 'St John College of Engineering and Management';

/** Left column: who you are on the network, and your own numbers. */
export function ProfileCard({ user, home }: { user: SessionUser; home: HomeContext }) {
  return (
    <div className="space-y-3">
      <Card className="gap-0 overflow-hidden py-0">
        <div
          className="h-16 bg-primary/15"
        />
        <div className="px-4 pb-4">
          <Link href={home.selfHref} className="-mt-9 inline-block rounded-full ring-4 ring-card">
            <InitialsAvatar name={user.full_name} size="xl" />
          </Link>
          <Link href={home.selfHref} className="mt-2 block">
            <h2 className="text-base font-semibold leading-snug text-foreground hover:underline">{user.full_name}</h2>
          </Link>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground">{home.headline}</p>
          {home.location && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              {home.location}
            </p>
          )}
          <p className="mt-2 text-xs font-medium text-foreground">{COLLEGE}</p>
        </div>

        {home.profileStrength !== null && home.profileStrength < 100 && (
          <Link href={home.profileHref} className="block border-t border-border px-4 py-3 transition-colors hover:bg-muted">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Profile strength</span>
              <span className="tnum font-semibold text-foreground">{home.profileStrength}%</span>
            </div>
            <Progress value={home.profileStrength} className="mt-2 h-1.5" />
            <p className="mt-1.5 text-[11px] text-primary">Complete your profile to get better matches</p>
          </Link>
        )}

        <div className="border-t border-border py-1">
          {home.stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="flex items-center justify-between px-4 py-1.5 text-xs transition-colors hover:bg-muted"
            >
              <span className="text-muted-foreground">{s.label}</span>
              <span className="tnum font-semibold text-primary">{formatNumber(s.value)}</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

/** Right column: people to meet, open roles, and your next session. */
export function HomeRail({ home, opportunitiesHref, calendarHref }: { home: HomeContext; opportunitiesHref: string; calendarHref: string }) {
  return (
    <div className="space-y-3">
      <Card className="gap-0 py-0">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-sm font-semibold text-foreground">{home.people.title}</h2>
          <Wand2 className="size-4 text-muted-foreground" />
        </div>
        {home.people.items.length === 0 ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">No suggestions yet. Complete your profile to see some.</p>
        ) : (
          <ul className="py-2">
            {home.people.items.map((p) => {
              const inner = (
                <>
                  <InitialsAvatar name={p.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.detail}</p>
                  </div>
                  {p.note && <span className="tnum shrink-0 text-[11px] font-medium text-primary">{p.note}</span>}
                </>
              );
              return (
                <li key={p.key}>
                  {p.href ? (
                    <Link href={p.href} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-muted">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-2">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Link
          href={home.people.moreHref}
          className="flex items-center gap-1 border-t border-border px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          See all suggestions <ChevronRight className="size-3.5" />
        </Link>
      </Card>

      <Card className="gap-0 py-0">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-sm font-semibold text-foreground">Open opportunities</h2>
          <Briefcase className="size-4 text-muted-foreground" />
        </div>
        {home.opportunities.length === 0 ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">Nothing open right now.</p>
        ) : (
          <ul className="py-2">
            {home.opportunities.map((o) => (
              <li key={o.id}>
                <Link href={opportunitiesHref} className="block px-4 py-2 transition-colors hover:bg-muted">
                  <p className="truncate text-sm font-medium text-foreground">{o.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal capitalize">
                      {o.type}
                    </Badge>
                    {[o.company, o.location].filter(Boolean).join(' · ')}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={opportunitiesHref}
          className="flex items-center gap-1 border-t border-border px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          All opportunities <ChevronRight className="size-3.5" />
        </Link>
      </Card>

      <Card className="gap-0 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Your next session</h2>
          <CalendarClock className="size-4 text-muted-foreground" />
        </div>
        {home.nextSession ? (
          <Link href={calendarHref} className="mt-2 block rounded-lg bg-muted px-3 py-2 transition-colors hover:bg-muted/70">
            <p className="truncate text-sm font-medium text-foreground">{home.nextSession.title}</p>
            <p className="tnum mt-0.5 text-xs text-muted-foreground">{formatDateTime(home.nextSession.scheduled_at)}</p>
          </Link>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Nothing scheduled.{' '}
            <Link href={calendarHref} className="text-primary hover:underline">
              Open your schedule
            </Link>
          </p>
        )}
      </Card>
    </div>
  );
}
