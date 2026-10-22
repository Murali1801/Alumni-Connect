import { requireUser } from '@/lib/session';
import { SearchPage } from '@/components/search/search-page';

export const metadata = { title: 'Search' };
export const dynamic = 'force-dynamic';

export default async function StudentSearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; page?: string }> }) {
  const user = await requireUser(['student']);
  const { q, type, page } = await searchParams;
  return <SearchPage user={user} q={q} type={type} page={page} />;
}
