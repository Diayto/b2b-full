// ============================================================
// Chrona — Smart workbook import defaults
// Ensures strategic views (Marketing, linkage) work after one-shot XLSX import.
// ============================================================

import type { FileType, ParsedLeadRow, ParsedMarketingSpendRow, ValidationWarning } from '../types';
import { parseFromRows } from '../parsers';
import { addChannelCampaigns, getChannelCampaigns } from '../store';

/** When leads have no source column, attribute them here so channel analytics are not empty. */
export const CHRONA_DEFAULT_ORGANIC_CHANNEL_ID = 'chrona:organic_social';

const SMART_BATCH_IMPORT_ORDER: FileType[] = [
  'channels_campaigns',
  'managers',
  'customers',
  'leads',
  'deals',
  'invoices',
  'payments',
  'marketing_spend',
  'content_metrics',
  'transactions',
];

export function sortSmartBatchPlans<T extends { fileType: FileType; sheetName: string }>(plans: T[]): T[] {
  return [...plans].sort((a, b) => {
    const ia = SMART_BATCH_IMPORT_ORDER.indexOf(a.fileType);
    const ib = SMART_BATCH_IMPORT_ORDER.indexOf(b.fileType);
    const sa = ia === -1 ? 999 : ia;
    const sb = ib === -1 ? 999 : ib;
    if (sa !== sb) return sa - sb;
    return a.sheetName.localeCompare(b.sheetName, 'ru');
  });
}

export function ensureDefaultOrganicChannel(companyId: string): void {
  if (!companyId) return;
  const exists = getChannelCampaigns(companyId).some(
    (c) => c.channelCampaignExternalId === CHRONA_DEFAULT_ORGANIC_CHANNEL_ID,
  );
  if (exists) return;
  addChannelCampaigns(companyId, [
    {
      channelCampaignExternalId: CHRONA_DEFAULT_ORGANIC_CHANNEL_ID,
      name: 'Органика / соцсети (авто)',
      channelName: 'Organic',
      campaignName: 'Консультации и входящий трафик',
    },
  ]);
}

export type ParseFromRowsResult = Awaited<ReturnType<typeof parseFromRows>>;

/** Fill missing lead source + drop noisy warnings we intentionally fix at import. */
export function enrichLeadsWithDefaultChannel(parsed: ParseFromRowsResult): ParseFromRowsResult {
  const rows = parsed.rows as ParsedLeadRow[];
  const withChannel = rows.map((r) =>
    r.channelCampaignExternalId?.trim()
      ? r
      : { ...r, channelCampaignExternalId: CHRONA_DEFAULT_ORGANIC_CHANNEL_ID },
  );
  const filteredWarnings = (parsed.warnings ?? []).filter(
    (w) => !isAutoResolvedLeadSourceWarning(w),
  );
  return {
    ...parsed,
    rows: withChannel,
    warnings: filteredWarnings.length > 0 ? filteredWarnings : undefined,
  };
}

export function stripAutoResolvedLeadSourceWarnings(
  warnings: ValidationWarning[] | undefined,
): ValidationWarning[] | undefined {
  if (!warnings?.length) return undefined;
  const next = warnings.filter((w) => !isAutoResolvedLeadSourceWarning(w));
  return next.length > 0 ? next : undefined;
}

function isAutoResolvedLeadSourceWarning(w: ValidationWarning): boolean {
  const msg = String(w.message ?? '');
  const field = String(w.field ?? '');
  return (
    field.includes('channelCampaignExternalId') &&
    (msg.includes('Нет источника') || msg.includes('атрибуция выручки по источникам'))
  );
}

export function applyDefaultChannelToLeadRows(rows: ParsedLeadRow[]): ParsedLeadRow[] {
  return rows.map((r) =>
    r.channelCampaignExternalId?.trim()
      ? r
      : { ...r, channelCampaignExternalId: CHRONA_DEFAULT_ORGANIC_CHANNEL_ID },
  );
}

/** Создаёт записи каналов для synthetic id (chrona:svod:…), чтобы Dashboard/Marketing видели расходы. */
export function ensureChannelsForMarketingSpendRows(companyId: string, rows: ParsedMarketingSpendRow[]): void {
  if (!companyId || rows.length === 0) return;
  const existing = new Set(
    getChannelCampaigns(companyId).map((c) => c.channelCampaignExternalId),
  );
  const additions: Array<{
    channelCampaignExternalId: string;
    name: string;
    channelName?: string;
    campaignName?: string;
  }> = [];

  for (const r of rows) {
    const id = r.channelCampaignExternalId?.trim();
    if (!id || existing.has(id)) continue;
    existing.add(id);
    additions.push({
      channelCampaignExternalId: id,
      name: humanizeSpendChannelId(id),
      channelName: id.startsWith('chrona:svod:') ? 'Свод / план' : 'Расходы',
      campaignName: id.startsWith('chrona:svod:') ? 'Из сводного листа' : 'Импорт',
    });
  }
  if (additions.length > 0) addChannelCampaigns(companyId, additions);
}

function humanizeSpendChannelId(id: string): string {
  if (id.startsWith('chrona:svod:')) {
    const parts = id.split(':').filter(Boolean);
    const line = parts.slice(2).join(' · ').replace(/_/g, ' ');
    return line ? `Свод · ${line}` : id;
  }
  if (id.startsWith('chrona:')) return id.replace(/^chrona:/, '').replace(/:/g, ' · ');
  return id;
}
