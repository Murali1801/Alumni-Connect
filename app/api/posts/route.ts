import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  OPPORTUNITY_KINDS,
  POST_BODY_MAX,
  POST_IMAGE_BUCKET,
  POST_IMAGE_MAX_BYTES,
  POST_IMAGE_TYPES,
  extractHashtags,
} from '@/lib/posts';

export const dynamic = 'force-dynamic';

/** Does the file start the way its declared image type does? */
function looksLike(type: string, head: Uint8Array): boolean {
  const at = (offset: number, ...bytes: number[]) => bytes.every((b, i) => head[offset + i] === b);
  switch (type) {
    case 'image/jpeg':
      return at(0, 0xff, 0xd8, 0xff);
    case 'image/png':
      return at(0, 0x89, 0x50, 0x4e, 0x47);
    case 'image/gif':
      return at(0, 0x47, 0x49, 0x46, 0x38);
    case 'image/webp':
      return at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50);
    default:
      return false;
  }
}

const opportunitySchema = z
  .object({
    type: z.enum(OPPORTUNITY_KINDS),
    title: z.string().trim().min(3, 'Give the role a title.').max(120),
    company_id: z.string().uuid().nullable().optional(),
    location: z.string().trim().max(120).optional(),
    work_mode: z.enum(['onsite', 'hybrid', 'remote']).nullable().optional(),
    experience: z.string().trim().max(60).optional(),
    compensation: z.string().trim().max(60).optional(),
    duration: z.string().trim().max(60).optional(),
    deadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a deadline date.')
      .optional()
      .or(z.literal('')),
    eligibility: z.string().trim().max(300).optional(),
    skills: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    apply_via: z.enum(['link', 'request', 'message']).default('request'),
    application_link: z.string().trim().url('The application link must be a full URL.').optional().or(z.literal('')),
  })
  .refine((o) => o.apply_via !== 'link' || !!o.application_link, {
    message: 'Add the application link, or let students apply through AlumniBridge.',
  });

/**
 * Publish a post: multipart form with `body`, and optionally `image`,
 * `opportunity` (JSON, alumni and admins only), `repost_of` and `mentions`
 * (JSON array of member ids).
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Send the post as a form.' }, { status: 400 });
  }

  const body = String(form.get('body') ?? '').trim();
  const image = form.get('image');
  const file = image instanceof File && image.size > 0 ? image : null;
  const repostOf = String(form.get('repost_of') ?? '').trim() || null;
  const rawOpportunity = String(form.get('opportunity') ?? '').trim();

  let opportunity: z.infer<typeof opportunitySchema> | null = null;
  if (rawOpportunity) {
    if (auth.user.role === 'student') {
      return NextResponse.json({ error: 'Only alumni can post openings.' }, { status: 403 });
    }
    try {
      opportunity = opportunitySchema.parse(JSON.parse(rawOpportunity));
    } catch (error: any) {
      const message = error instanceof z.ZodError ? error.issues[0]?.message : 'Check the opening details.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (!body && !file && !repostOf && !opportunity) {
    return NextResponse.json({ error: 'Write something or add a photo.' }, { status: 400 });
  }
  if (body.length > POST_BODY_MAX) {
    return NextResponse.json({ error: `Keep posts under ${POST_BODY_MAX} characters.` }, { status: 400 });
  }

  const db = createAdminClient();

  // Mentions: only real members, and only ones the text actually names.
  let mentions: string[] = [];
  try {
    const ids = JSON.parse(String(form.get('mentions') ?? '[]'));
    if (Array.isArray(ids) && ids.length) {
      const wanted = [...new Set(ids.filter((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 20);
      const { data: people } = wanted.length ? await db.from('users').select('id, full_name').in('id', wanted) : { data: [] };
      mentions = (people ?? []).filter((p) => body.includes(`@${p.full_name}`)).map((p) => p.id);
    }
  } catch {
    /* malformed mentions are dropped, not fatal */
  }

  if (repostOf) {
    const { data: original } = await db.from('posts').select('id, repost_of').eq('id', repostOf).maybeSingle();
    if (!original) return NextResponse.json({ error: 'That post no longer exists.' }, { status: 404 });
    // Reposting a repost shares the original, as LinkedIn does.
    if (original.repost_of) {
      return NextResponse.json({ error: 'Repost the original post instead.' }, { status: 400 });
    }
  }

  let imagePath: string | null = null;
  if (file) {
    const ext = POST_IMAGE_TYPES[file.type];
    if (!ext) return NextResponse.json({ error: 'Photos must be JPEG, PNG, WebP or GIF.' }, { status: 400 });
    if (file.size > POST_IMAGE_MAX_BYTES) return NextResponse.json({ error: 'Photos must be 5 MB or smaller.' }, { status: 400 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!looksLike(file.type, bytes.subarray(0, 12))) {
      return NextResponse.json({ error: 'That file is not a valid image.' }, { status: 400 });
    }

    imagePath = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await db.storage
      .from(POST_IMAGE_BUCKET)
      .upload(imagePath, bytes, { contentType: file.type, upsert: false });
    if (uploadError) return NextResponse.json({ error: 'Could not upload the photo.' }, { status: 500 });
  }

  // An opening is a real listing first, so it also shows on the Jobs page.
  let opportunityId: string | null = null;
  if (opportunity) {
    const { data: listing, error: listingError } = await db
      .from('opportunities')
      .insert({
        posted_by: auth.user.id,
        type: opportunity.type,
        title: opportunity.title,
        description: body || opportunity.title,
        company_id: opportunity.company_id ?? null,
        location: opportunity.location || null,
        work_mode: opportunity.work_mode ?? null,
        experience: opportunity.experience || null,
        compensation: opportunity.compensation || null,
        duration: opportunity.duration || null,
        deadline: opportunity.deadline || null,
        eligibility: opportunity.eligibility || null,
        target_skills: opportunity.skills,
        apply_via: opportunity.apply_via,
        application_link: opportunity.application_link || null,
      })
      .select('id')
      .single();
    if (listingError || !listing) {
      if (imagePath) await db.storage.from(POST_IMAGE_BUCKET).remove([imagePath]);
      return NextResponse.json({ error: 'Could not create the listing.' }, { status: 500 });
    }
    opportunityId = listing.id;
  }

  const { data, error } = await db
    .from('posts')
    .insert({
      author_id: auth.user.id,
      body,
      image_path: imagePath,
      repost_of: repostOf,
      opportunity_id: opportunityId,
      hashtags: extractHashtags(body),
      mentions,
    })
    .select('id')
    .single();

  if (error || !data) {
    if (imagePath) await db.storage.from(POST_IMAGE_BUCKET).remove([imagePath]);
    if (opportunityId) await db.from('opportunities').delete().eq('id', opportunityId);
    return NextResponse.json({ error: 'Could not publish the post.' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
