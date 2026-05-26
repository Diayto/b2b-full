import type { ProcessedMetricsRow } from '@/lib/supabaseMetrics';
import { generateRandomDemoRow } from '@/lib/chronaDemoGenerator';

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
export const CHRONA_OWNER_DEMO_ROW_KEY = 'chrona_owner_demo_row';

export function isOwnerDemoSessionActive(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(CHRONA_OWNER_DEMO_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/** Start demo session with a fresh random scenario each time. */
export function activateOwnerDemoSession(): ProcessedMetricsRow {
  const row = generateRandomDemoRow();
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(CHRONA_OWNER_DEMO_SESSION_KEY, '1');
      sessionStorage.setItem(CHRONA_OWNER_DEMO_ROW_KEY, JSON.stringify(row));
    }
  } catch {
    /* private mode */
  }
  return row;
}

export function deactivateOwnerDemoSession(): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(CHRONA_OWNER_DEMO_SESSION_KEY);
    sessionStorage.removeItem(CHRONA_OWNER_DEMO_ROW_KEY);
  } catch {
    /* quota */
  }
}

/** @deprecated use activateOwnerDemoSession / deactivateOwnerDemoSession */
export function setOwnerDemoSessionActive(active: boolean): void {
  if (active) activateOwnerDemoSession();
  else deactivateOwnerDemoSession();
}

export function getOwnerDemoSessionRow(): ProcessedMetricsRow | null {
  if (!isOwnerDemoSessionActive()) return null;
  try {
    const raw = sessionStorage.getItem(CHRONA_OWNER_DEMO_ROW_KEY);
    if (raw) return JSON.parse(raw) as ProcessedMetricsRow;
  } catch {
    /* invalid json */
  }
  return activateOwnerDemoSession();
}

let envFallbackDemoRow: ProcessedMetricsRow | null = null;

/** Active demo row: session (random on each enable) → env fallback (random per tab load). */
export function getActiveDemoMetricsRow(): ProcessedMetricsRow {
  const sessionRow = getOwnerDemoSessionRow();
  if (sessionRow) return sessionRow;
  if (!envFallbackDemoRow) {
    envFallbackDemoRow = generateRandomDemoRow();
  }
  return envFallbackDemoRow;
}

/** Demo-style fallback when cloud is empty or unreachable. */
export function allowChronaDemoFallback(): boolean {
  return isChronaDemoPreviewEnabled() || isAcceleratorDemoMode() || isOwnerDemoSessionActive();
}
