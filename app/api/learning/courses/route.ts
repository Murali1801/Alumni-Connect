import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthorCourses, listCatalogue } from '@/lib/learning';
import { bad, courseSchema, readBody } from '@/lib/learning-schemas';

export const dynamic = 'force-dynamic';

/**
 * Students get the published catalogue (`?q=&topic=&level=&skill=`); alumni
 * get their own courses with learner stats.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;
  if (auth.user.role === 'alumni') return NextResponse.json({ courses: await getAuthorCourses(auth.user.id) });
  const p = new URL(request.url).searchParams;
  const courses = await listCatalogue(
    {
      q: p.get('q') ?? undefined,
      topic: p.get('topic') ?? undefined,
      level: p.get('level') ?? undefined,
      skill: p.get('skill') ?? undefined,
    },
    auth.user.id
  );
  return NextResponse.json({ courses });
}

/** Start a course as a draft; it is published once it has content. */
export async function POST(request: Request) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const body = await readBody(request, courseSchema, 'Check the course details.');
  if (!body.ok) return body.response;

  const db = createAdminClient();
  const { data, error } = await db
    .from('courses')
    .insert({ ...body.data, author_id: auth.user.id, published: false })
    .select('id')
    .single();
  if (error || !data) return bad('Could not create the course.', 500);
  return NextResponse.json({ id: data.id }, { status: 201 });
}
