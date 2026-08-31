import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Column sets per dataset. Contact columns on `alumni_records` are deliberately
 * absent from every export — they exist for claim invitations only.
 */
const DATASETS = {
  alumni: {
    table: 'alumni_records',
    filename: 'sjcem-alumni-records',
    columns: 'student_id,full_name,branch,batch_year,city,first_role,first_ctc_lpa,higher_ed_raw,claim_status,claimed_at,verified_at',
  },
  companies: {
    table: 'companies',
    filename: 'sjcem-companies',
    columns: 'name,name_canonical,industry,created_at',
  },
  requests: {
    table: 'requests',
    filename: 'sjcem-requests',
    columns: 'id,type,status,match_score,created_at,responded_at',
  },
  opportunities: {
    table: 'opportunities',
    filename: 'sjcem-opportunities',
    columns: 'id,type,title,location,target_skills,is_open,created_at',
  },
} as const;

type DatasetKey = keyof typeof DATASETS;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = Array.isArray(value) ? value.join('; ') : String(value);
  // Quote when the value could otherwise break the row, and double any quotes.
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export async function GET(request: Request) {
  const auth = await requireApiUser(['admin']);
  if (!auth.ok) return auth.response;

  const key = (new URL(request.url).searchParams.get('dataset') ?? 'alumni') as DatasetKey;
  const spec = DATASETS[key];
  if (!spec) {
    return NextResponse.json(
      { error: `Unknown dataset. Choose one of: ${Object.keys(DATASETS).join(', ')}` },
      { status: 400 }
    );
  }

  const db = createAdminClient();

  // PostgREST caps a single response, so page through the whole table.
  // `spec` is a union of four dataset shapes, which defeats the client's
  // generated row typing — the rows are only ever stringified into CSV here.
  const table: string = spec.table;
  const columns: string = spec.columns;
  let rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data?.length) break;
    rows = rows.concat(data as unknown as Record<string, unknown>[]);
    if (data.length < 1000) break;
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'That dataset is empty.' }, { status: 404 });
  }

  const headers = Object.keys(rows[0]);
  const body = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(',')),
  ].join('\n');

  await db.from('audit_log').insert({
    actor_id: auth.user.id,
    action: 'export_csv',
    target_type: spec.table,
    target_id: null,
    detail: { dataset: key, rows: rows.length },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${body}`, {
    status: 200,
    headers: {
      // The BOM keeps Excel from mangling non-ASCII names.
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${spec.filename}-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
