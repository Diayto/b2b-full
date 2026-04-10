import { getSupabaseClient } from '@/lib/supabaseClient';

export type ClearSupabaseCompanyResult = {
  ok: boolean;
  errors: string[];
};

/**
 * Deletes owner-scoped rows the dashboard uses (RLS: company_id = auth.uid()).
 * Does not delete auth user or profiles row.
 */
export async function clearSupabaseCompanyData(): Promise<ClearSupabaseCompanyResult> {
  const sb = getSupabaseClient();
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();
  if (userErr || !user) {
    return { ok: false, errors: ['Не выполнен вход в Supabase'] };
  }

  const errors: string[] = [];
  const tables = ['insights', 'processed_metrics', 'connected_sources'] as const;

  for (const table of tables) {
    const { error } = await sb.from(table).delete().eq('company_id', user.id);
    if (error) errors.push(`${table}: ${error.message}`);
  }

  return { ok: errors.length === 0, errors };
}
