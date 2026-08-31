import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const createRequestSchema = z.object({
  alumni_id: z.string().uuid(),
  type: z.enum(['mentorship', 'mock_interview', 'internship', 'referral']),
  message: z.string().min(20).max(500),
  match_score: z.number().int().min(0).max(100),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get user role
  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = userData?.role;

  let query = supabase.from('requests').select(`
    *,
    student:users!student_id(full_name),
    alumni:users!alumni_id(full_name)
  `).order('created_at', { ascending: false });

  if (role === 'student') {
    query = query.eq('student_id', user.id);
  } else if (role === 'alumni') {
    query = query.eq('alumni_id', user.id);
  } else if (role === 'admin') {
    // Admin sees all
  } else {
    return NextResponse.json({ error: 'Invalid role' }, { status: 403 });
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const validated = createRequestSchema.parse(body);

    const { data, error } = await supabase
      .from('requests')
      .insert({
        student_id: user.id,
        alumni_id: validated.alumni_id,
        type: validated.type,
        message: validated.message,
        match_score: validated.match_score,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'You already have a pending request of this type with this alumnus.' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Validation error' }, { status: 400 });
  }
}
