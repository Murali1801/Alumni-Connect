import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const alumniProfileSchema = z.object({
  current_company_id: z.string().uuid().optional().nullable(),
  designation: z.string().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
  experience_years: z.number().int().min(0).optional(),
  skills: z.array(z.string()).default([]),
  linkedin_url: z.string().url().optional().or(z.literal('')),
  bio: z.string().optional(),
  mentorship_available: z.boolean().default(false),
  mock_interview_available: z.boolean().default(false),
  referral_available: z.boolean().default(false),
  internship_available: z.boolean().default(false),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('alumni_profiles')
    .select(`
      *,
      current_company:companies(id, name, name_canonical, industry),
      alumni_records(full_name, branch, batch_year)
    `)
    .eq('user_id', user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const validated = alumniProfileSchema.parse(body);

    const { error } = await supabase
      .from('alumni_profiles')
      .update({
        ...validated,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (error) throw error;
    
    // Log engagement event
    await supabase.from('engagement_events').insert({
      user_id: user.id,
      event_type: 'profile_updated',
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Validation error' }, { status: 400 });
  }
}
