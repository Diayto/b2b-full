import { parseISO } from 'date-fns';
import type { DateRange } from '../types';

export function isValidYmd(dateStr: string | undefined | null): boolean {
  if (!dateStr) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = parseISO(dateStr);
  return !Number.isNaN(d.getTime());
}

export function toMidnightDate(dateStr: string): Date {
  // Expect YYYY-MM-DD
  const d = parseISO(dateStr);
  // Normalize time to midnight for stable comparisons.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isDateInRangeInclusive(dateStr: string, range: DateRange): boolean {
  if (!isValidYmd(dateStr)) return false;
  const d = toMidnightDate(dateStr).getTime();
  const from = toMidnightDate(range.from).getTime();
  const to = toMidnightDate(range.to).getTime();
  return d >= from && d <= to;
}

export function getPreviousDateRange(range: DateRange): DateRange {
  const from = toMidnightDate(range.from);
  const to = toMidnightDate(range.to);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);

  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));

  const prevFromStr = prevFrom.toISOString().split('T')[0];
  const prevToStr = prevTo.toISOString().split('T')[0];
  return { from: prevFromStr, to: prevToStr };
}

export function parseMonthKey(monthKey: string): { start: Date; end: Date } | null {
  // YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;
  const [y, m] = monthKey.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0); // last day of month
  return { start, end };
}

export function isMonthOverlappingRange(monthKey: string, range: DateRange): boolean {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return false;
  const from = toMidnightDate(range.from).getTime();
  const to = toMidnightDate(range.to).getTime();
  const monthStart = parsed.start.getTime();
  const monthEnd = parsed.end.getTime();
  return monthEnd >= from && monthStart <= to;
}

export function getTodayMidnight(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

