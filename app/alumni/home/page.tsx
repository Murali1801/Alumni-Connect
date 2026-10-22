import { requireUser } from '@/lib/session';
import { HomePage } from '@/components/feed/home-page';

export const metadata = { title: 'Home' };
export const dynamic = 'force-dynamic';

export default async function AlumniHomePage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; mine?: string; show?: string; tag?: string }>;
}) {
  const user = await requireUser(['alumni']);
  return <HomePage user={user} basePath="/alumni/home" searchParams={await searchParams} />;
}
