import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Ensure the user is an admin
  const { data: userRecord } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userRecord?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // 1. Network Liveness & Claim Rate by Batch
    const { data: recordsData } = await supabase.from('alumni_records').select('batch_year, claim_status');
    const records = recordsData || [];
    
    let totalRecords = records.length;
    let claimedRecords = 0;
    const batchMap = new Map<number, { batch: number, total: number, claimed: number }>();
    
    // Initialize 2013-2024
    for (let i = 2013; i <= 2024; i++) {
      batchMap.set(i, { batch: i, total: 0, claimed: 0 });
    }

    for (const r of records) {
      if (r.claim_status === 'claimed' || r.claim_status === 'verified') {
        claimedRecords++;
      }
      const b = batchMap.get(r.batch_year);
      if (b) {
        b.total++;
        if (r.claim_status === 'claimed' || r.claim_status === 'verified') b.claimed++;
      }
    }

    const networkLiveness = { claimed: claimedRecords, total: totalRecords };
    const claimRateByBatch = Array.from(batchMap.values()).sort((a, b) => a.batch - b.batch);

    // 2. Request Activity
    const { data: requestsData } = await supabase.from('requests').select('status, created_at, responded_at');
    const requests = requestsData || [];
    
    let sent = requests.length;
    let accepted = 0;
    let declined = 0;
    let pending = 0;
    let responseTimes: number[] = [];

    for (const req of requests) {
      if (req.status === 'accepted') accepted++;
      else if (req.status === 'declined') declined++;
      else if (req.status === 'pending') pending++;

      if (req.responded_at) {
        const diffHours = (new Date(req.responded_at).getTime() - new Date(req.created_at).getTime()) / (1000 * 60 * 60);
        responseTimes.push(diffHours);
      }
    }

    const responseRate = sent > 0 ? Math.round(((accepted + declined) / sent) * 100) : 0;
    responseTimes.sort((a, b) => a - b);
    const medianHours = responseTimes.length > 0 
      ? Math.round(responseTimes[Math.floor(responseTimes.length / 2)]) 
      : 0;

    const requestActivity = { sent, accepted, declined, pending, responseRate, medianHours };

    // 3. Verification Queue
    const { count: pendingVerification } = await supabase
      .from('alumni_records')
      .select('*', { count: 'exact', head: true })
      .eq('claim_status', 'claimed');

    // 4. Company Clusters
    // For MVP, we will pull all profiles and all companies to do the join in memory.
    const { data: companies } = await supabase.from('companies').select('id, name');
    const { data: profiles } = await supabase.from('alumni_profiles').select('current_company_id, mentorship_available, referral_available');
    const { data: recordsForCompany } = await supabase.from('alumni_records').select('first_company_id');

    const companyStats = new Map<string, any>();
    
    if (companies) {
      for (const c of companies) {
        companyStats.set(c.id, { id: c.id, company: c.name, alumni_count: 0, claimed: 0, mentors: 0, referrers: 0 });
      }

      for (const r of (recordsForCompany || [])) {
        if (r.first_company_id && companyStats.has(r.first_company_id)) {
          companyStats.get(r.first_company_id).alumni_count++;
        }
      }

      for (const p of (profiles || [])) {
        if (p.current_company_id && companyStats.has(p.current_company_id)) {
          const stats = companyStats.get(p.current_company_id);
          stats.claimed++;
          if (p.mentorship_available) stats.mentors++;
          if (p.referral_available) stats.referrers++;
        }
      }
    }

    const companyClusters = Array.from(companyStats.values())
      .filter(c => c.alumni_count > 0 || c.claimed > 0)
      .sort((a, b) => b.alumni_count - a.alumni_count)
      .slice(0, 15);

    return NextResponse.json({
      networkLiveness,
      claimRateByBatch,
      requestActivity,
      verificationQueue: pendingVerification || 0,
      companyClusters
    });

  } catch (err: any) {
    console.error('Stats generation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
