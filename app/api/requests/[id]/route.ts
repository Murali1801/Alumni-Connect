import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const updateRequestSchema = z.object({
  status: z.enum(['accepted', 'declined', 'closed']),
  response_note: z.string().optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const reqId = (await params).id;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const validated = updateRequestSchema.parse(body);

    // Verify ownership (only alumni can accept/decline, only student/alumni can close, etc.)
    const { data: currentReq, error: fetchErr } = await supabase.from('requests').select('*').eq('id', reqId).single();
    if (fetchErr || !currentReq) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

    const isAlumni = currentReq.alumni_id === user.id;
    const isStudent = currentReq.student_id === user.id;

    if (validated.status === 'accepted' || validated.status === 'declined') {
      if (!isAlumni) return NextResponse.json({ error: 'Only the requested alumni can accept or decline' }, { status: 403 });
    }
    
    if (validated.status === 'closed') {
      if (!isAlumni && !isStudent) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error: updateErr } = await supabase
      .from('requests')
      .update({
        status: validated.status,
        response_note: validated.response_note,
        responded_at: new Date().toISOString(),
      })
      .eq('id', reqId);

    if (updateErr) throw updateErr;

    // Log engagement event for responding
    if (isAlumni && (validated.status === 'accepted' || validated.status === 'declined')) {
      await supabase.from('engagement_events').insert({
        user_id: user.id,
        event_type: 'request_responded',
        metadata: { request_id: reqId, status: validated.status }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Validation error' }, { status: 400 });
  }
}
