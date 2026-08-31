import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const postOpportunitySchema = z.object({
  type: z.enum(['job', 'internship']),
  title: z.string().min(3),
  description: z.string().min(10),
  company_id: z.string().uuid(),
  location: z.string().min(2),
  target_skills: z.array(z.string()).default([]),
  application_link: z.string().url().optional().or(z.literal('')),
});

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Create an admin client to bypass RLS for the users table join
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabaseAdmin
    .from('opportunities')
    .select(`
      id,
      type,
      title,
      description,
      location,
      target_skills,
      application_link,
      is_open,
      created_at,
      companies (
        id,
        name
      ),
      users!posted_by (
        id,
        full_name
      )
    `)
    .eq('is_open', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching opportunities:', error);
    return NextResponse.json({ error: 'Failed to fetch opportunities' }, { status: 500 });
  }

  // Transform the data to flatten relationships for easier frontend usage
  const formattedData = data.map((opp: any) => ({
    id: opp.id,
    type: opp.type,
    title: opp.title,
    description: opp.description,
    location: opp.location,
    target_skills: opp.target_skills,
    application_link: opp.application_link,
    created_at: opp.created_at,
    company: opp.companies?.name || 'Unknown Company',
    company_id: opp.companies?.id,
    posted_by: opp.users?.full_name || 'Unknown Alumni'
  }));

  return NextResponse.json(formattedData);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify the user is an alumni
  const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userRow?.role !== 'alumni') {
    return NextResponse.json({ error: 'Only alumni can post opportunities' }, { status: 403 });
  }

  try {
    const json = await request.json();
    const body = postOpportunitySchema.parse(json);

    const { data, error } = await supabase.from('opportunities').insert({
      posted_by: user.id,
      type: body.type,
      title: body.title,
      description: body.description,
      company_id: body.company_id,
      location: body.location,
      target_skills: body.target_skills,
      application_link: body.application_link || null,
      is_open: true
    }).select().single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Error', issues: error.issues }, { status: 400 });
    }
    console.error('Error creating opportunity:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
