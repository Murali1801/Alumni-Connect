import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const studentProfileSchema = z.object({
  branch: z.string().min(1),
  batch_year: z.number().int().min(2013).max(2030),
  skills: z.array(z.string()).default([]),
  target_role: z.string().optional(),
  target_company: z.string().optional(),
  target_industry: z.string().optional(),
  location_pref: z.string().optional(),
  resume_url: z.string().url().optional().or(z.literal('')),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('student_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || null);
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const validated = studentProfileSchema.parse(body);

    const { error } = await supabase
      .from('student_profiles')
      .upsert({
        user_id: user.id,
        ...validated,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
    
    // Also ensure role is set to student if it's their first time
    await supabase.from('users').upsert({
      id: user.id,
      role: 'student',
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Student',
    }, { onConflict: 'id' });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Validation error' }, { status: 400 });
  }
}
