// ============================================================
// BizPulse — Lost Deal & Stalled Pipeline Analysis
//
// Reusable service for analyzing deal losses and pipeline stalls.
// Consumed by Sales/Cash page and Dashboard.
// ============================================================

import type { Deal, LostReason, Manager } from '../types';

export interface LostDealEnriched {
  dealExternalId: string;
  customerExternalId: string;
  managerExternalId?: string;
  managerName: string;
  lostDate?: string;
  lostReason: LostReason;
  lostStage: string;
}

export interface LostReasonBreakdown {
  reason: LostReason;
  label: string;
  count: number;
  percentage: number;
}

export interface ManagerLossBreakdown {
  managerId: string;
  managerName: string;
  lostCount: number;
  topReason?: LostReason;
}

export interface LostDealsAnalysis {
  total: number;
  deals: LostDealEnriched[];
  reasonBreakdown: LostReasonBreakdown[];
  managerBreakdown: ManagerLossBreakdown[];
  topReasonLabel: string;
  topReasonPercentage: number;
}

const LOST_REASON_LABELS: Record<LostReason, string> = {
  price: 'Цена',
  no_response: 'Нет ответа',
  not_relevant: 'Не актуально',
  competitor: 'Конкурент',
  timing: 'Не вовремя',
  other: 'Другое',
};

/**
 * Compute lost deals analysis from deals and managers.
 */
export function computeLostDealsAnalysis(
  deals: Deal[],
  managers: Manager[],
): LostDealsAnalysis {
  const managerNameById = new Map<string, string>();
  for (const m of managers) managerNameById.set(m.managerExternalId, m.name);

  const lostDeals = deals.filter((d) => d.status === 'lost');

  const enriched: LostDealEnriched[] = lostDeals.map((d) => ({
    dealExternalId: d.dealExternalId,
    customerExternalId: d.customerExternalId ?? '—',
    managerExternalId: d.managerExternalId,
    managerName: d.managerExternalId
      ? (managerNameById.get(d.managerExternalId) ?? d.managerExternalId)
      : '—',
    lostDate: d.lostDate ?? d.lastActivityDate ?? d.createdDate,
    lostReason: d.lostReason ?? 'other',
    lostStage: d.lostStage ?? (d.wonDate ? 'won_to_paid' : 'deal'),
  }));

  // Reason aggregation
  const reasonCounts = new Map<LostReason, number>();
  for (const d of enriched) {
    reasonCounts.set(d.lostReason, (reasonCounts.get(d.lostReason) ?? 0) + 1);
  }
  const total = enriched.length;
  const reasonBreakdown: LostReasonBreakdown[] = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({
      reason,
      label: LOST_REASON_LABELS[reason] ?? reason,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Manager aggregation
  const managerMap = new Map<string, { count: number; reasons: Map<LostReason, number> }>();
  for (const d of enriched) {
    const prev = managerMap.get(d.managerName) ?? { count: 0, reasons: new Map() };
    prev.count++;
    prev.reasons.set(d.lostReason, (prev.reasons.get(d.lostReason) ?? 0) + 1);
    managerMap.set(d.managerName, prev);
  }
  const managerBreakdown: ManagerLossBreakdown[] = Array.from(managerMap.entries())
    .map(([name, data]) => {
      let topReason: LostReason | undefined;
      let topCount = 0;
      for (const [reason, count] of data.reasons) {
        if (count > topCount) {
          topCount = count;
          topReason = reason;
        }
      }
      return {
        managerId: name,
        managerName: name,
        lostCount: data.count,
        topReason,
      };
    })
    .sort((a, b) => b.lostCount - a.lostCount);

  const topReasonEntry = reasonBreakdown[0];

  return {
    total,
    deals: enriched,
    reasonBreakdown,
    managerBreakdown,
    topReasonLabel: topReasonEntry?.label ?? '—',
    topReasonPercentage: topReasonEntry?.percentage ?? 0,
  };
}

export { LOST_REASON_LABELS };
