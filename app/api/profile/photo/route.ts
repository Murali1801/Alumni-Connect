import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 3 * 1024 * 1024;
const COLUMN = { avatar: 'avatar_path', cover: 'cover_path' } as const;

function looksLike(type: string, head: Uint8Array): boolean {
  const at = (offset: number, ...bytes: number[]) => bytes.every((b, i) => head[offset + i] === b);
  if (type === 'image/jpeg') return at(0, 0xff, 0xd8, 0xff);
  if (type === 'image/png') return at(0, 0x89, 0x50, 0x4e, 0x47);
  if (type === 'image/webp') return at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50);
  return false;
}

function kindOf(request: Request): keyof typeof COLUMN | null {
  const k = new URL(request.url).searchParams.get('kind');
  return k === 'avatar' || k === 'cover' ? k : null;
}

/** Upload your profile photo (`?kind=avatar`) or cover banner (`?kind=cover`); replaces the old one. */
export async function POST(request: Request) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;
  const kind = kindOf(request);
  if (!kind) return NextResponse.json({ error: 'Say which photo: avatar or cover.' }, { status: 400 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: 'Choose an image.' }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Photos must be JPEG, PNG or WebP.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Photos must be 3 MB or smaller.' }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLike(file.type, bytes.subarray(0, 12))) return NextResponse.json({ error: 'That file is not a valid image.' }, { status: 400 });

  const db = createAdminClient();
  const { data: user } = await db.from('users').select(COLUMN[kind]).eq('id', auth.user.id).single();
  const old = (user as Record<string, string | null> | null)?.[COLUMN[kind]] ?? null;

  const path = `${auth.user.id}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error: upError } = await db.storage.from('avatars').upload(path, bytes, { contentType: file.type, upsert: false });
  if (upError) return NextResponse.json({ error: 'Could not upload the photo.' }, { status: 500 });

  const { error } = await db.from('users').update({ [COLUMN[kind]]: path }).eq('id', auth.user.id);
  if (error) {
    await db.storage.from('avatars').remove([path]);
    return NextResponse.json({ error: 'Could not save the photo.' }, { status: 500 });
  }
  if (old) await db.storage.from('avatars').remove([old]);
  return NextResponse.json({ url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}` }, { status: 201 });
}

/** Remove your profile photo or cover banner. */
export async function DELETE(request: Request) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;
  const kind = kindOf(request);
  if (!kind) return NextResponse.json({ error: 'Say which photo: avatar or cover.' }, { status: 400 });

  const db = createAdminClient();
  const { data: user } = await db.from('users').select(COLUMN[kind]).eq('id', auth.user.id).single();
  const old = (user as Record<string, string | null> | null)?.[COLUMN[kind]] ?? null;
  await db.from('users').update({ [COLUMN[kind]]: null }).eq('id', auth.user.id);
  if (old) await db.storage.from('avatars').remove([old]);
  return NextResponse.json({ success: true });
}
