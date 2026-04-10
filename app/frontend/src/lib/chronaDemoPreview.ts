import type { ProcessedMetricsRow } from '@/lib/supabaseMetrics';

/**
 * Controlled preview mode for UI/product work. Real Supabase rows always win when visible under RLS.
 *
 * - `VITE_CHRONA_DEMO_PREVIEW=true` — allow packaged demo when cloud has no row for this user / on errors.
 * - `VITE_CHRONA_DEMO_PREVIEW=false` or unset — no demo fallback (empty or partial states only).
 *   Use explicit `true` for screenshots or UI work without real data.
 */
export function isChronaDemoPreviewEnabled(): boolean {
  const v = import.meta.env.VITE_CHRONA_DEMO_PREVIEW;
  if (v === 'false' || v === '0') return false;
  if (v === 'true' || v === '1') return true;
  return false;
}

/**
 * Live investor / accelerator demo: minimal nav, quiet UI, demo fallback even if VITE_CHRONA_DEMO_PREVIEW is off.
 * Set `VITE_CHRONA_ACCELERATOR_DEMO=true` for the presentation build or rehearsal.
 */
export function isAcceleratorDemoMode(): boolean {
  const v = import.meta.env.VITE_CHRONA_ACCELERATOR_DEMO;
  return v === 'true' || v === '1';
}

/** Session flag set from Data page — unified demo for dashboard + breakdown without .env. */
export const CHRONA_OWNER_DEMO_SESSION_KEY = 'chrona_owner_demo';

export function isOwnerDemoSessionActive(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(CHRONA_OWNER_DEMO_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function setOwnerDemoSessionActive(active: boolean): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (active) sessionStorage.setItem(CHRONA_OWNER_DEMO_SESSION_KEY, '1');
    else sessionStorage.removeItem(CHRONA_OWNER_DEMO_SESSION_KEY);
  } catch {
    /* quota / private mode */
  }
}

/** Demo-style fallback when cloud is empty or unreachable. */
export function allowChronaDemoFallback(): boolean {
  return isChronaDemoPreviewEnabled() || isAcceleratorDemoMode() || isOwnerDemoSessionActive();
}

function ymdToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function ymdDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Single canonical demo row: triggers rule 1 (lead→deal &lt; 15%, leads ≥ 10) with rich KPI/cash context.
 * IDs are placeholders — never written to Supabase by this module.
 */
export const CHRONA_DEMO_PROCESSED_METRICS_ROW: ProcessedMetricsRow = {
  id: '00000000-0000-4000-a000-000000000001',
  company_id: '00000000-0000-4000-a000-000000000002',
  period_start: ymdDaysAgo(30),
  period_end: ymdToday(),
  spend: 920_000,
  leads: 42,
  deals: 5,
  revenue: 2_650_000,
  cash_inflow: 1_720_000,
  cash_outflow: 2_050_000,
  net_cash: -330_000,
  raw_data: {
    source: 'chrona_demo_preview',
    scenario: 'sales_bottleneck',
  },
  created_at: new Date().toISOString(),
};
