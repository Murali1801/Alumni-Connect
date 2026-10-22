import { requireUser } from '@/lib/session';
import { getMemberProfile } from '@/lib/people';
import { MemberProfilePage } from '@/components/people/member-profile-page';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const person = await getMemberProfile((await params).id);
  return { title: person?.full_name ?? 'Profile' };
}

export default async function StudentPersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ before?: string }>;
}) {
  const user = await requireUser(['student']);
  const [{ id }, { before }] = await Promise.all([params, searchParams]);
  return <MemberProfilePage viewer={user} userId={id} before={before} />;
}
