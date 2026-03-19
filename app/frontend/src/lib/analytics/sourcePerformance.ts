// ============================================================
// BizPulse — Source Performance Analytics
//
// Reusable service: channel/source analysis with ROI,
// conversion rates, and efficiency metrics.
// Consumed by Marketing and Dashboard pages.
// ============================================================

import type { ChannelCampaignRow } from './revenueControlTower';

export interface SourcePerformanceRow {
  channelCampaignExternalId: string;
  name: string;
  sourceType: string;

  cost: number;
  leads: number;
  deals: number;
  wonDeals: number;
  revenue: number;

  conversionRate: number;        // leads → won (%)
  leadToDealRate: number;        // 0..1
  dealToPaidRate: number;        // 0..1
  roi: number | null;            // (revenue - cost) / cost * 100

  cpl: number | null;
  costPerWonDeal: number | null;

  expectedInflow: number;
  overdueAmount: number;
}

/**
 * Transform ChannelCampaignRows into enriched source performance data.
 */
export function computeSourcePerformance(
  rows: ChannelCampaignRow[],
  channelNameById: Map<string, string>,
): SourcePerformanceRow[] {
  return rows.map((r) => {
    const roi = r.marketingSpend > 0
      ? ((r.paidRevenue - r.marketingSpend) / r.marketingSpend) * 100
      : null;

    const conversionRate = r.leads > 0
      ? (r.wonDeals / r.leads) * 100
      : 0;

    return {
      channelCampaignExternalId: r.channelCampaignExternalId,
      name: channelNameById.get(r.channelCampaignExternalId) ?? r.channelCampaignExternalId,
      sourceType: 'unknown',

      cost: r.marketingSpend,
      leads: r.leads,
      deals: r.deals,
      wonDeals: r.wonDeals,
      revenue: r.paidRevenue,

      conversionRate,
      leadToDealRate: r.leadToDealConversion,
      dealToPaidRate: r.dealToPaidConversion,
      roi,

      cpl: r.cpl,
      costPerWonDeal: r.costPerWonDeal,

      expectedInflow: r.expectedInflow,
      overdueAmount: r.overdueAmount,
    };
  }).sort((a, b) => (b.roi ?? -999) - (a.roi ?? -999));
}

/**
 * Classify sources into best, worst, and average tiers.
 */
export function classifySources(rows: SourcePerformanceRow[]): {
  best: SourcePerformanceRow[];
  average: SourcePerformanceRow[];
  worst: SourcePerformanceRow[];
} {
  if (rows.length === 0) return { best: [], average: [], worst: [] };

  const sortedByRoi = [...rows].sort((a, b) => (b.roi ?? -999) - (a.roi ?? -999));
  const third = Math.max(1, Math.floor(sortedByRoi.length / 3));

  return {
    best: sortedByRoi.slice(0, third),
    average: sortedByRoi.slice(third, third * 2),
    worst: sortedByRoi.slice(third * 2),
  };
}
