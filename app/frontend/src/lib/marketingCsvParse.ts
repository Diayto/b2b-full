import type { MarketingChannelRow, MarketingContentRow } from '@/lib/marketingAnalytics';

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

export type MarketingCsvKind = 'channels' | 'content' | 'unknown';

export function detectMarketingCsvKind(headers: string[]): MarketingCsvKind {
  const h = headers.map(normHeader);
  const hasContent =
    h.some((x) => /post_id|content_id|video|ролик|пост/.test(x)) ||
    (colIndex(headers, ['platform', 'платформа']) >= 0 && colIndex(headers, ['reach', 'охват', 'impressions']) >= 0);
  const hasChannel =
    colIndex(headers, ['channel', 'канал', 'source', 'источник', 'utm_source', 'campaign', 'кампания']) >= 0 &&
    (colIndex(headers, ['spend', 'расход', 'budget']) >= 0 || colIndex(headers, ['leads', 'лиды']) >= 0);
  if (hasContent) return 'content';
  if (hasChannel) return 'channels';
  return 'unknown';
}

export function parseChannelsCsv(headers: string[], rows: unknown[][]): MarketingChannelRow[] {
  const nameIdx = colIndex(headers, [
    'channel',
    'канал',
    'source',
    'источник',
    'utm_source',
    'campaign',
    'кампания',
    'name',
    'название',
  ]);
  const spendIdx = colIndex(headers, ['spend', 'расход', 'budget', 'бюджет', 'cost', 'amount']);
  const leadsIdx = colIndex(headers, ['leads', 'лиды', 'заявки']);
  const dealsIdx = colIndex(headers, ['deals', 'сделки']);
  const revIdx = colIndex(headers, ['revenue', 'выручка', 'доход']);

  if (nameIdx < 0) return [];

  const out: MarketingChannelRow[] = [];
  for (const row of rows) {
    const name = String(row[nameIdx] ?? '').trim();
    if (!name) continue;
    out.push({
      name,
      spend: spendIdx >= 0 ? toNum(row[spendIdx]) : 0,
      leads: leadsIdx >= 0 ? Math.round(toNum(row[leadsIdx])) : 0,
      deals: dealsIdx >= 0 ? Math.round(toNum(row[dealsIdx])) : 0,
      revenue: revIdx >= 0 ? toNum(row[revIdx]) : 0,
    });
  }
  return out;
}

export function parseContentCsv(headers: string[], rows: unknown[][]): MarketingContentRow[] {
  const idIdx = colIndex(headers, ['content_id', 'post_id', 'video_id', 'id', 'id_поста', 'ролик']);
  const titleIdx = colIndex(headers, ['title', 'caption', 'заголовок', 'текст', 'название']);
  const reachIdx = colIndex(headers, ['reach', 'охват', 'impressions', 'просмотры', 'views']);
  const leadsIdx = colIndex(headers, ['leads', 'лиды', 'заявки']);
  const convIdx = colIndex(headers, ['conversions', 'paid', 'оплаты', 'продажи', 'paid_conversions']);

  if (idIdx < 0 && titleIdx < 0) return [];

  const out: MarketingContentRow[] = [];
  for (const row of rows) {
    const id = idIdx >= 0 ? String(row[idIdx] ?? '').trim() : '';
    const title = titleIdx >= 0 ? String(row[titleIdx] ?? '').trim() : id;
    if (!id && !title) continue;
    out.push({
      id: id || title,
      title: title || id,
      reach: reachIdx >= 0 ? Math.round(toNum(row[reachIdx])) : 0,
      leads: leadsIdx >= 0 ? Math.round(toNum(row[leadsIdx])) : 0,
      conversions: convIdx >= 0 ? Math.round(toNum(row[convIdx])) : 0,
    });
  }
  return out;
}
