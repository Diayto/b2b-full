import type { MarketingChannelRow, MarketingContentRow } from '@/lib/marketingAnalytics';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

const PACK_SHEET_NAMES = ['Полный_пакет', 'Full_pack', 'Данные', 'Data'];

export async function readSpreadsheetMatrix(
  file: File,
): Promise<{ headers: string[]; rows: unknown[][]; sheetName: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        complete: (res) => {
          const data = res.data as unknown[][];
          const headers = (data[0] ?? []).map((c) => String(c ?? '').trim() || 'column');
          const rows = data.slice(1).filter((r) => Array.isArray(r) && r.some((c) => c !== '' && c != null));
          resolve({ headers, rows, sheetName: 'csv' });
        },
        error: (e) => reject(e),
      });
    });
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const preferred = PACK_SHEET_NAMES.find((n) => wb.SheetNames.includes(n));
    const sheetName =
      preferred ?? wb.SheetNames.find((n) => !/инструк|instruction/i.test(n)) ?? wb.SheetNames[0]!;
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
    const headers = (matrix[0] ?? []).map((c) => String(c ?? '').trim() || 'column');
    const rows = matrix.slice(1).filter((r) => Array.isArray(r) && r.some((c) => c !== '' && c != null));
    return { headers, rows, sheetName };
  }
  throw new Error('unsupported');
}

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_');
}

function toNum(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/\s/g, '').replace(/,/g, '.'));
  return Number.isFinite(n) ? n : 0;
}

function colIndex(headers: string[], aliases: string[]): number {
  const norm = headers.map(normHeader);
  for (const a of aliases) {
    const i = norm.indexOf(a);
    if (i >= 0) return i;
  }
  for (let i = 0; i < norm.length; i++) {
    if (aliases.some((a) => norm[i].includes(a) || a.includes(norm[i]))) return i;
  }
  return -1;
}

function toYmdCell(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + v * 86400000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function minYmd(dates: string[]): string | null {
  const valid = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (valid.length === 0) return null;
  return valid.sort()[0];
}

function maxYmd(dates: string[]): string | null {
  const valid = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (valid.length === 0) return null;
  return valid.sort()[valid.length - 1];
}

function normBlock(raw: string): string {
  return raw.trim().toLowerCase();
}

const BLOCK_ALIASES = ['block', 'блок', 'section', 'тип', 'type', 'категория'];

export function isFullTestPackTable(headers: string[]): boolean {
  return colIndex(headers, BLOCK_ALIASES) >= 0;
}

export type FullTestPackParseResult = {
  periodStart: string;
  periodEnd: string;
  spend: number;
  leads: number;
  deals: number;
  revenue: number;
  cashInflow: number;
  cashOutflow: number;
  netCash: number;
  channels: MarketingChannelRow[];
  content: MarketingContentRow[];
  periodRowCount: number;
};

export function parseFullTestPackTable(headers: string[], rows: unknown[][]): FullTestPackParseResult {
  const blockIdx = colIndex(headers, BLOCK_ALIASES);
  const dateIdx = colIndex(headers, ['date', 'дата', 'period']);
  const spendIdx = colIndex(headers, ['spend', 'расход', 'budget']);
  const leadsIdx = colIndex(headers, ['leads', 'лиды', 'заявки']);
  const dealsIdx = colIndex(headers, ['deals', 'сделки']);
  const revIdx = colIndex(headers, ['revenue', 'выручка', 'доход']);
  const inIdx = colIndex(headers, ['cash_inflow', 'приток', 'inflow']);
  const outIdx = colIndex(headers, ['cash_outflow', 'отток', 'outflow']);
  const channelIdx = colIndex(headers, ['channel', 'канал', 'source', 'источник']);
  const idIdx = colIndex(headers, ['content_id', 'post_id', 'video_id', 'id']);
  const titleIdx = colIndex(headers, ['title', 'caption', 'заголовок', 'название']);
  const reachIdx = colIndex(headers, ['reach', 'охват', 'impressions', 'просмотры']);
  const convIdx = colIndex(headers, ['conversions', 'paid', 'оплаты', 'продажи']);

  if (blockIdx < 0) {
    throw new Error('Нет колонки block (свод / канал / контент)');
  }

  let sumSpend = 0;
  let sumLeads = 0;
  let sumDeals = 0;
  let sumRevenue = 0;
  let sumIn = 0;
  let sumOut = 0;
  const dates: string[] = [];
  let periodRowCount = 0;

  const channels: MarketingChannelRow[] = [];
  const content: MarketingContentRow[] = [];

  for (const row of rows) {
    const block = normBlock(String(row[blockIdx] ?? ''));
    if (!block) continue;

    if (/^(свод|period|summary|период)$/.test(block)) {
      periodRowCount++;
      if (dateIdx >= 0) {
        const y = toYmdCell(row[dateIdx]);
        if (y) dates.push(y);
      }
      if (spendIdx >= 0) sumSpend += toNum(row[spendIdx]);
      if (leadsIdx >= 0) sumLeads += toNum(row[leadsIdx]);
      if (dealsIdx >= 0) sumDeals += toNum(row[dealsIdx]);
      if (revIdx >= 0) sumRevenue += toNum(row[revIdx]);
      if (inIdx >= 0) sumIn += toNum(row[inIdx]);
      if (outIdx >= 0) sumOut += toNum(row[outIdx]);
      continue;
    }

    if (/^(канал|channel|source)$/.test(block)) {
      const name = channelIdx >= 0 ? String(row[channelIdx] ?? '').trim() : '';
      if (!name) continue;
      channels.push({
        name,
        spend: spendIdx >= 0 ? toNum(row[spendIdx]) : 0,
        leads: leadsIdx >= 0 ? Math.round(toNum(row[leadsIdx])) : 0,
        deals: dealsIdx >= 0 ? Math.round(toNum(row[dealsIdx])) : 0,
        revenue: revIdx >= 0 ? toNum(row[revIdx]) : 0,
      });
      continue;
    }

    if (/^(контент|content|post|video)$/.test(block)) {
      const id = idIdx >= 0 ? String(row[idIdx] ?? '').trim() : '';
      const title = titleIdx >= 0 ? String(row[titleIdx] ?? '').trim() : id;
      if (!id && !title) continue;
      content.push({
        id: id || title,
        title: title || id,
        reach: reachIdx >= 0 ? Math.round(toNum(row[reachIdx])) : 0,
        leads: leadsIdx >= 0 ? Math.round(toNum(row[leadsIdx])) : 0,
        conversions: convIdx >= 0 ? Math.round(toNum(row[convIdx])) : 0,
      });
    }
  }

  if (periodRowCount === 0) {
    throw new Error('Нет строк block=свод — добавьте хотя бы одну строку периода');
  }

  const today = new Date().toISOString().slice(0, 10);
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };

  const periodStart = minYmd(dates) ?? daysAgo(90);
  const periodEnd = maxYmd(dates) ?? today;

  return {
    periodStart,
    periodEnd,
    spend: sumSpend,
    leads: Math.round(sumLeads),
    deals: Math.round(sumDeals),
    revenue: sumRevenue,
    cashInflow: sumIn,
    cashOutflow: sumOut,
    netCash: sumIn - sumOut,
    channels,
    content,
    periodRowCount,
  };
}

export { minYmd, maxYmd, toYmdCell, toNum };
