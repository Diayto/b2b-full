// ============================================================
// Chrona — Aggregate / summary Excel sheets (СВОД, итоги, бюджет)
// Routes rows to the right domain: расходы → marketing_spend (+ каналы),
// без ложного импорта лидов. Поддержка «широких» таблиц месяцев.
// ============================================================

import type { FileType, ParsedMarketingSpendRow } from '../types';
import type { ParseResult } from '../parsers';
import { parseFromRows } from '../parsers';
import { normalizeReferenceId } from '../idNormalization';
import { detectAndMap, mapWithPreset } from './detector';
import { applyColumnMappings } from './pipeline';

export interface WorkbookSheetPlan {
  sheetName: string;
  fileType: FileType;
  mappedRows: Record<string, unknown>[];
  parsed: ParseResult;
}

/** Листы, где строки обычно агрегаты / план / бюджет — не воронка лидов. */
export function isAggregateSheetNameNormalized(normalizedSheetLower: string): boolean {
  const n = normalizedSheetLower.trim();
  return (
    n.includes('свод') ||
    n.includes('итог') ||
    n.includes('summary') ||
    n.includes('бюджет') ||
    n.includes('budget') ||
    n.includes('kpi') ||
    n.includes('план расход') ||
    n.includes('план затрат') ||
    n.includes('маркетинг расход')
  );
}

const AGGREGATE_PRESET_ORDER: FileType[] = [
  'marketing_spend',
  'transactions',
  'invoices',
  'payments',
  'deals',
  'customers',
  'channels_campaigns',
  'managers',
  'content_metrics',
];

const RU_MONTH_HINT: Array<{ test: (s: string) => boolean; mm: string }> = [
  { test: (s) => s.includes('янв') && !s.includes('июн'), mm: '01' },
  { test: (s) => s.includes('фев'), mm: '02' },
  { test: (s) => s.includes('мар') && !s.includes('марк'), mm: '03' },
  { test: (s) => s.includes('апр'), mm: '04' },
  { test: (s) => s.includes('мая') || s === 'май' || s.startsWith('май'), mm: '05' },
  { test: (s) => s.includes('июн') && !s.includes('июл'), mm: '06' },
  { test: (s) => s.includes('июл'), mm: '07' },
  { test: (s) => s.includes('авг'), mm: '08' },
  { test: (s) => s.includes('сен') || s.includes('сент'), mm: '09' },
  { test: (s) => s.includes('окт'), mm: '10' },
  { test: (s) => s.includes('ноя'), mm: '11' },
  { test: (s) => s.includes('дек'), mm: '12' },
];

function parseMonthFromHeader(header: string): string | null {
  const t = String(header).trim();
  if (/^\d{4}-\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t.slice(0, 7);
  const mNum = /^m\s*(\d{1,2})$/i.exec(t);
  if (mNum) {
    const mm = Number(mNum[1]);
    if (mm >= 1 && mm <= 12) {
      const y = new Date().getFullYear();
      return `${y}-${String(mm).padStart(2, '0')}`;
    }
  }
  const lower = t.toLowerCase().replace(/\s+/g, ' ');
  const yearMatch = t.match(/20\d{2}/);
  const year = yearMatch ? yearMatch[0] : String(new Date().getFullYear());
  for (const { test, mm } of RU_MONTH_HINT) {
    if (test(lower)) return `${year}-${mm}`;
  }
  if (/^jan/i.test(t)) return `${year}-01`;
  if (/^feb/i.test(t)) return `${year}-02`;
  if (/^mar/i.test(t)) return `${year}-03`;
  if (/^apr/i.test(t)) return `${year}-04`;
  if (/^may/i.test(t)) return `${year}-05`;
  if (/^jun/i.test(t)) return `${year}-06`;
  if (/^jul/i.test(t)) return `${year}-07`;
  if (/^aug/i.test(t)) return `${year}-08`;
  if (/^sep/i.test(t)) return `${year}-09`;
  if (/^oct/i.test(t)) return `${year}-10`;
  if (/^nov/i.test(t)) return `${year}-11`;
  if (/^dec/i.test(t)) return `${year}-12`;
  return null;
}

function sheetSlug(sheetName: string): string {
  const base = normalizeReferenceId(sheetName) ?? 'svod';
  return base.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'svod';
}

function lineSlug(label: string): string {
  const base = normalizeReferenceId(label) ?? 'line';
  return base.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'line';
}

function isAggregateLabelRow(label: string): boolean {
  const s = label.toLowerCase();
  return (
    s.length === 0 ||
    s.includes('итог') ||
    s.includes('total') ||
    s.includes('всего') ||
    s === '—' ||
    s === '-'
  );
}

/**
 * Таблица вида: первая колонка — название строки, остальные — месяцы (YYYY-MM или «мар 2025» и т.д.).
 */
function tryWideMonthMatrixToSpend(
  sheetName: string,
  rows: Record<string, unknown>[],
  cols: string[],
): ParsedMarketingSpendRow[] {
  if (cols.length < 3 || rows.length === 0) return [];

  const monthCols: { col: string; month: string }[] = [];
  const nonMonthCols: string[] = [];
  for (const c of cols) {
    const m = parseMonthFromHeader(c);
    if (m) monthCols.push({ col: c, month: m });
    else nonMonthCols.push(c);
  }
  if (monthCols.length < 2) return [];

  const labelCol = nonMonthCols[0] ?? cols[0];
  if (monthCols.some((x) => x.col === labelCol)) return [];

  const slug = sheetSlug(sheetName);
  const out: ParsedMarketingSpendRow[] = [];

  for (const row of rows) {
    const labelRaw = row[labelCol];
    const label = String(labelRaw ?? '').trim();
    if (isAggregateLabelRow(label)) continue;

    for (const { col, month } of monthCols) {
      const raw = row[col];
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(n) || n === 0) continue;
      const ch = `chrona:svod:${slug}:${lineSlug(label)}`;
      out.push({
        month,
        amount: Math.abs(n),
        channelCampaignExternalId: ch,
      });
    }
  }
  return out;
}

function patchMarketingSpendDefaults(parsed: ParseResult, sheetName: string): ParseResult {
  const slug = sheetSlug(sheetName);
  const rows = parsed.rows as ParsedMarketingSpendRow[];
  const patched = rows.map((r) => ({
    ...r,
    channelCampaignExternalId:
      r.channelCampaignExternalId?.trim() ||
      `chrona:svod:${slug}:общий_расход`,
  }));
  const warnings = (parsed.warnings ?? []).filter(
    (w) =>
      !(
        w.field === 'channelCampaignExternalId' &&
        String(w.message).includes('Нет связки с каналом')
      ),
  );
  return {
    ...parsed,
    rows: patched,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function tryPresetPlans(sheetName: string, rows: Record<string, unknown>[], cols: string[]): WorkbookSheetPlan[] {
  for (const ft of AGGREGATE_PRESET_ORDER) {
    const det = mapWithPreset(cols, ft, rows);
    if (det.mappings.length === 0) continue;
    const mapped = applyColumnMappings(rows, det.mappings);
    let parsed = parseFromRows(mapped, ft);
    if (parsed.rows.length === 0) continue;
    if (ft === 'marketing_spend') {
      parsed = patchMarketingSpendDefaults(parsed, sheetName);
    }
    return [{ sheetName, fileType: ft, mappedRows: mapped, parsed }];
  }

  const det = detectAndMap(cols, rows);
  if (det.mappings.length > 0 && det.fileType !== 'leads') {
    const mapped = applyColumnMappings(rows, det.mappings);
    let parsed = parseFromRows(mapped, det.fileType);
    if (parsed.rows.length > 0) {
      if (det.fileType === 'marketing_spend') {
        parsed = patchMarketingSpendDefaults(parsed, sheetName);
      }
      return [{ sheetName, fileType: det.fileType, mappedRows: mapped, parsed }];
    }
  }

  return [];
}

/**
 * Построить планы импорта для сводного листа (без leads).
 */
export function buildAggregateSheetPlans(sheetName: string, rows: Record<string, unknown>[]): WorkbookSheetPlan[] {
  if (rows.length === 0) return [];
  const cols = Object.keys(rows[0] ?? {});
  if (!cols.length) return [];

  const fromPresets = tryPresetPlans(sheetName, rows, cols);
  if (fromPresets.length > 0) return fromPresets;

  const wide = tryWideMonthMatrixToSpend(sheetName, rows, cols);
  if (wide.length === 0) return [];

  const note =
    'Свод: строки развёрнуты по месяцам в расходы (marketing_spend). Каналы созданы автоматически.';
  const parsed: ParseResult = {
    rows: wide,
    errors: [],
    warnings: [{ row: 1, field: '_smart_svod', message: note }],
    preview: rows.slice(0, 20),
    totalRows: rows.length,
  };

  return [
    {
      sheetName,
      fileType: 'marketing_spend',
      mappedRows: rows,
      parsed,
    },
  ];
}
