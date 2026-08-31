import Link from 'next/link';
import { Users, MapPin, Building2, GraduationCap, Sparkles } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getDirectory, getDirectoryFacets, getStudentProfile, type DirectoryItem } from '@/lib/queries';
import { DashboardShell } from '@/components/dashboard/shell';
import { DirectoryFilters } from '@/components/directory/filters';
import { Pagination } from '@/components/directory/pagination';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InitialsAvatar, MatchScore, EmptyState } from '@/components/patterns';
import { formatNumber } from '@/lib/format';

export const metadata = { title: 'Alumni directory' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function StudentDirectoryPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['student']);
  const sp = await searchParams;

  const filters = {
    q: first(sp.q) ?? '',
    branch: first(sp.branch) ?? 'all',
    batch: first(sp.batch) ?? 'all',
    availability: first(sp.availability) ?? 'all',
    status: first(sp.status) ?? 'claimed',
    sort: first(sp.sort) ?? 'match',
    page: Number(first(sp.page) ?? 1) || 1,
    pageSize: 12,
  };

  const [badges, profile, facets] = await Promise.all([
    getNavBadges(user),
    getStudentProfile(user.id),
    getDirectoryFacets(),
  ]);
  const result = await getDirectory(filters, profile);

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Alumni directory"
      description={`${formatNumber(result.total)} alumni match your filters. Claimed profiles are ranked against your own; dormant records are shown for reference only.`}
      actions={
        !profile ? (
          <Button className="h-9 w-full px-4 sm:w-auto" render={<Link href="/student/settings" />}>
            <Sparkles className="size-4" />
            Add your profile to unlock matching
          </Button>
        ) : undefined
      }
    >
      <DirectoryFilters
        basePath="/student/directory"
        branches={facets.branches}
        batches={facets.batches}
        current={filters}
      />

      {result.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No alumni match these filters"
          description="Try widening the batch range, clearing the availability filter, or including unclaimed records."
          action={
            <Button variant="outline" size="sm" render={<Link href="/student/directory" />}>
              Reset filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {result.items.map((item) => (
            <AlumniCard key={item.record.id} item={item} />
          ))}
        </div>
      )}

      <Pagination
        basePath="/student/directory"
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        params={sp}
      />
    </DashboardShell>
  );
}

function AlumniCard({ item }: { item: DirectoryItem }) {
  const { record, match } = item;
  const profile = record.alumni_profiles;
  const company = profile?.current_company?.name ?? record.first_company?.name ?? null;

  const offers = profile
    ? [
        profile.mentorship_available && 'Mentorship',
        profile.mock_interview_available && 'Mock interviews',
        profile.referral_available && 'Referrals',
        profile.internship_available && 'Internships',
      ].filter(Boolean as unknown as (v: unknown) => v is string)
    : [];

  return (
    <Card className="group gap-0 p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <InitialsAvatar name={record.full_name} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">{record.full_name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {profile?.designation ?? record.first_role ?? 'Role not shared'}
          </p>
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <GraduationCap className="size-3 shrink-0" />
            {record.branch} · {record.batch_year}
          </p>
        </div>
        <MatchScore score={match.score} matchable={match.matchable} />
      </div>

      <dl className="mt-4 space-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Building2 className="size-3 shrink-0" />
          <span className="truncate">{company ?? 'Employer not on file'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{profile?.location ?? record.city ?? 'Location not on file'}</span>
        </div>
      </dl>

      {offers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {offers.map((o) => (
            <Badge key={o} variant="secondary" className="font-normal">
              {o}
            </Badge>
          ))}
        </div>
      )}

      {!match.matchable && (
        <p className="mt-3 rounded-md bg-muted px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {match.fallbackReason ??
            'This alumnus has not claimed their profile, so only branch and batch are known.'}
        </p>
      )}

      <Button
        variant={match.matchable ? 'default' : 'outline'}
        size="sm"
        className="mt-4 w-full"
        render={<Link href={`/student/directory/${record.id}`} />}
      >
        {match.matchable ? 'View profile and request' : 'View record'}
      </Button>
    </Card>
  );
}
