import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { POST_BODY_MAX, POST_IMAGE_BUCKET, POST_IMAGE_MAX_BYTES, POST_IMAGE_TYPES } from '@/lib/posts';

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

/** Publish a post: multipart form with `body` and an optional `image`. */
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

  if (!body && !file) return NextResponse.json({ error: 'Write something or add a photo.' }, { status: 400 });
  if (body.length > POST_BODY_MAX) {
    return NextResponse.json({ error: `Keep posts under ${POST_BODY_MAX} characters.` }, { status: 400 });
  }

  const db = createAdminClient();
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

  const { data, error } = await db
    .from('posts')
    .insert({ author_id: auth.user.id, body, image_path: imagePath })
    .select('id')
    .single();

  if (error || !data) {
    if (imagePath) await db.storage.from(POST_IMAGE_BUCKET).remove([imagePath]);
    return NextResponse.json({ error: 'Could not publish the post.' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
