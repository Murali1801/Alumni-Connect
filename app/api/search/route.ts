import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { searchAll, searchCompanies, searchJobs, searchPeople, searchPosts } from '@/lib/search';
import {
  clampLimit,
  clampOffset,
  isSearchable,
  normaliseQuery,
  parseBatch,
  parseSearchType,
} from '@/lib/search-shared';
import { OPPORTUNITY_KINDS } from '@/lib/feed-shared';

export const dynamic = 'force-dynamic';

/**
 * Search for signed-in members.
 *
 *   GET /api/search?q=<text>&type=all|people|posts|jobs|companies
 *
 * Optional, by type:
 *   people     role=student|alumni, branch=COMP|IT|..., batch=2021
 *   jobs       kind=job|internship|placement|referral, open=0 to include closed
 *   all types  limit (1-50, default 20; 1-10 per group for type=all), offset
 *
 * `q` is cut to 100 characters and needs two letters or digits; shorter queries
 * return empty results rather than an error. Words all have to match, the last
 * as a prefix; "quoted phrases", `or` and `-word` follow web-search syntax.
 *
 * Response, type=all:
 *   { query, type: 'all', order: ['people'|'jobs'|'posts'|'companies', ...],
 *     people: Page<PersonHit>, posts: Page<PostHit>, jobs: Page<JobHit>, companies: Page<CompanyHit> }
 * Response, one type:
 *   { query, type, results: Page<...Hit> }
 *
 *   Page<T>     { items: T[], total, limit, offset }
 *   PersonHit   { id, role, full_name, headline, branch, batch_year, company, location, avatar_url, url, rank }
 *   PostHit     { id, url, snippet, hashtags, created_at, image_url, like_count, comment_count,
 *                 author: { id, full_name, role, headline, avatar_url },
 *                 opportunity: { id, type, title, company } | null, rank }
 *   JobHit      { id, type, title, company, location, work_mode, experience, compensation, duration,
 *                 deadline, is_open, target_skills, snippet, created_at,
 *                 posted_by: { id, full_name } | null, post_id, url, rank }
 *   CompanyHit  { id, name, industry, alumni_count, open_jobs, rank }
 *
 * `order` puts the group with the strongest hit first, so the page can lead with
 * it. Snippets are plain text. No contact details are ever included.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const query = normaliseQuery(params.get('q'));
  const type = parseSearchType(params.get('type'));
  const limit = clampLimit(params.get('limit'), type === 'all' ? 5 : 20, type === 'all' ? 10 : 50);
  const offset = clampOffset(params.get('offset'));
  const viewerRole = auth.user.role;

  if (!isSearchable(query)) {
    const empty = { items: [], total: 0, limit, offset };
    return NextResponse.json(
      type === 'all'
        ? { query, type, order: ['people', 'jobs', 'posts', 'companies'], people: empty, posts: empty, jobs: empty, companies: empty }
        : { query, type, results: empty }
    );
  }

  try {
    if (type === 'all') {
      return NextResponse.json({ type, ...(await searchAll(query, { perGroup: limit, viewerRole })) });
    }

    let results;
    if (type === 'people') {
      const role = params.get('role');
      results = await searchPeople(query, {
        limit,
        offset,
        viewerRole,
        role: role === 'student' || role === 'alumni' ? role : undefined,
        branch: params.get('branch')?.slice(0, 20) || null,
        batch: parseBatch(params.get('batch')),
      });
    } else if (type === 'posts') {
      results = await searchPosts(query, { limit, offset });
    } else if (type === 'jobs') {
      const kind = params.get('kind');
      results = await searchJobs(query, {
        limit,
        offset,
        viewerRole,
        type: OPPORTUNITY_KINDS.includes(kind as any) ? kind : null,
        openOnly: params.get('open') !== '0',
      });
    } else {
      results = await searchCompanies(query, { limit, offset });
    }
    return NextResponse.json({ query, type, results });
  } catch (err) {
    console.error('search failed', (err as Error).message);
    return NextResponse.json({ error: 'Search is unavailable right now. Try again in a moment.' }, { status: 500 });
  }
}
