import { requireUser } from '@/lib/session';
import { HomePage } from '@/components/feed/home-page';

export const metadata = { title: 'Home' };
export const dynamic = 'force-dynamic';

export default async function StudentHomePage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; mine?: string; show?: string; tag?: string; sort?: string }>;
}) {
  const user = await requireUser(['student']);
  return <HomePage user={user} basePath="/student/home" searchParams={await searchParams} />;
}
