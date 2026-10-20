import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Same normalisation the ingest used, so "TCS Ltd." and "TCS ltd" collapse. */
export function canonicalise(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(pvt|private|ltd|limited|inc|llp|llc|co|company|corp|corporation)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find an employer by canonical name, creating it if it is new. Returns null for
 * a name with no usable characters.
 */
export async function findOrCreateCompany(
  db: SupabaseClient,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const canonical = canonicalise(name);
  if (!canonical) return null;

  const { data: existing } = await db
    .from('companies')
    .select('id, name')
    .eq('name_canonical', canonical)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await db
    .from('companies')
    .insert({ name: name.trim(), name_canonical: canonical })
    .select('id, name')
    .single();
  if (error) {
    // Lost a race with another insert of the same employer: read the winner.
    const { data: again } = await db
      .from('companies')
      .select('id, name')
      .eq('name_canonical', canonical)
      .maybeSingle();
    if (again) return again;
    throw error;
  }
  return data;
}
