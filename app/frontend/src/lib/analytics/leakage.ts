// ============================================================
// BizPulse — Funnel Leakage Analysis Engine
//
// Tracks value loss across the entire revenue funnel:
//   lost leads, stalled deals, won-not-invoiced,
//   invoiced-not-paid, overdue, organic-no-conversion
// ============================================================

import type { Deal, Invoice, Lead } from '../types';
import type { ContentMetric, LeakageItem, LeakageSummary, LeakageCategory } from './domain';
import { LEAKAGE_LABELS } from './domain';
import type { RevenueControlTowerModel } from './model';

export interface LeakageAnalysisInput {
  model: RevenueControlTowerModel;
  contentMetrics?: ContentMetric[];
  averageDealValue?: number;
}

/**
 * Compute full-funnel leakage analysis.
 * Identifies every point where potential revenue is lost.
 */
export function computeLeakageAnalysis(input: LeakageAnalysisInput): LeakageSummary {
  const { model, contentMetrics, averageDealValue } = input;
  const avgDealVal = averageDealValue ?? estimateAverageDealValue(model);
  const items: LeakageItem[] = [];

  // 1. Lost leads — leads with status 'lost' or no deal created
  const leadsWithDeals = new Set<string>();
  for (const deal of model.deals) {
    if (deal.leadExternalId) leadsWithDeals.add(deal.leadExternalId);
  }

  for (const lead of model.leads) {
    if (lead.status === 'lost') {
      items.push({
        category: 'lost_lead',
        stage: 'lead',
        entityId: lead.leadExternalId,
        entityType: 'lead',
        amount: avgDealVal * 0.2, // estimated at 20% of avg deal value
        reason: 'Лид потерян (status: lost)',
        date: lead.createdDate,
        managerId: lead.managerExternalId,
      });
    }
  }

  // 2. Stalled deals — open deals without recent activity
  const today = new Date();
  const todayTs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const STALL_THRESHOLD_DAYS = 14;

  for (const deal of model.deals) {
    if (deal.status !== 'open') continue;
    const lastActivity = deal.lastActivityDate
      ? new Date(deal.lastActivityDate + 'T00:00:00').getTime()
      : deal.createdDate
        ? new Date(deal.createdDate + 'T00:00:00').getTime()
        : NaN;

    if (!Number.isFinite(lastActivity)) continue;
    const daysSinceActivity = Math.floor((todayTs - lastActivity) / 86_400_000);

    if (daysSinceActivity >= STALL_THRESHOLD_DAYS) {
      items.push({
        category: 'stalled_deal',
        stage: 'deal',
        entityId: deal.dealExternalId,
        entityType: 'deal',
        amount: avgDealVal * 0.5,
        reason: `${daysSinceActivity} дней без активности`,
        date: deal.lastActivityDate ?? deal.createdDate,
        managerId: deal.managerExternalId,
      });
    }
  }

  // 3. Lost deals
  for (const deal of model.deals) {
    if (deal.status !== 'lost') continue;
    items.push({
      category: 'lost_deal',
      stage: 'deal',
      entityId: deal.dealExternalId,
      entityType: 'deal',
      amount: avgDealVal,
      reason: deal.lostReason ?? 'Причина не указана',
      date: deal.lostDate ?? deal.lastActivityDate,
      managerId: deal.managerExternalId,
    });
  }

  // 4. Won but not invoiced — won deals without linked invoices
  for (const deal of model.deals) {
    if (deal.status !== 'won') continue;
    const invoices = model.invoicesByDealExternalId.get(deal.dealExternalId);
    if (!invoices || invoices.length === 0) {
      items.push({
        category: 'won_not_invoiced',
        stage: 'won',
        entityId: deal.dealExternalId,
        entityType: 'deal',
        amount: avgDealVal,
        reason: 'Сделка выиграна, но счёт не выставлен',
        date: deal.wonDate,
        managerId: deal.managerExternalId,
      });
    }
  }

  // 5. Invoiced but not paid
  for (const invoice of model.invoices) {
    if (invoice.status !== 'unpaid') continue;
    if (!invoice.dueDate) continue;
    const dueTs = new Date(invoice.dueDate + 'T00:00:00').getTime();
    if (!Number.isFinite(dueTs)) continue;

    if (dueTs < todayTs) {
      // Overdue
      items.push({
        category: 'overdue_payment',
        stage: 'invoiced',
        entityId: invoice.invoiceExternalId ?? invoice.id,
        entityType: 'invoice',
        amount: invoice.amount,
        reason: `Просрочка: ${Math.floor((todayTs - dueTs) / 86_400_000)} дней`,
        date: invoice.dueDate,
      });
    } else {
      items.push({
        category: 'invoiced_not_paid',
        stage: 'invoiced',
        entityId: invoice.invoiceExternalId ?? invoice.id,
        entityType: 'invoice',
        amount: invoice.amount,
        reason: 'Счёт выставлен, оплата не поступила',
        date: invoice.invoiceDate,
      });
    }
  }

  // 6. Organic traffic with no lead conversion
  if (contentMetrics && contentMetrics.length > 0) {
    for (const cm of contentMetrics) {
      if (cm.reach > 0 && cm.leadsGenerated === 0) {
        items.push({
          category: 'organic_no_conversion',
          stage: 'traffic',
          entityId: cm.contentId,
          entityType: 'content',
          amount: 0,
          reason: `${cm.reach} охват, ${cm.impressions} показов — 0 лидов`,
          date: cm.publishedAt,
        });
      }
    }
  }

  return aggregateLeakage(items);
}

function aggregateLeakage(items: LeakageItem[]): LeakageSummary {
  const totalItems = items.length;
  const totalEstimatedLoss = items.reduce((sum, i) => sum + i.amount, 0);

  // By category
  const catMap = new Map<LeakageCategory, { count: number; loss: number }>();
  for (const item of items) {
    const prev = catMap.get(item.category) ?? { count: 0, loss: 0 };
    catMap.set(item.category, {
      count: prev.count + 1,
      loss: prev.loss + item.amount,
    });
  }

  const byCategory = Array.from(catMap.entries())
    .map(([category, data]) => ({
      category,
      label: LEAKAGE_LABELS[category],
      count: data.count,
      estimatedLoss: data.loss,
      percentage: totalItems > 0 ? (data.count / totalItems) * 100 : 0,
    }))
    .sort((a, b) => b.estimatedLoss - a.estimatedLoss);

  // By stage
  const stageMap = new Map<string, { count: number; loss: number }>();
  for (const item of items) {
    const prev = stageMap.get(item.stage) ?? { count: 0, loss: 0 };
    stageMap.set(item.stage, {
      count: prev.count + 1,
      loss: prev.loss + item.amount,
    });
  }

  const byStage = Array.from(stageMap.entries())
    .map(([stage, data]) => ({
      stage,
      count: data.count,
      estimatedLoss: data.loss,
    }))
    .sort((a, b) => b.estimatedLoss - a.estimatedLoss);

  return { totalItems, totalEstimatedLoss, byCategory, byStage };
}

function estimateAverageDealValue(model: RevenueControlTowerModel): number {
  const wonDeals = model.deals.filter((d) => d.status === 'won');
  if (wonDeals.length === 0) return 0;

  let totalValue = 0;
  let count = 0;
  for (const deal of wonDeals) {
    const invoices = model.invoicesByDealExternalId.get(deal.dealExternalId);
    if (invoices && invoices.length > 0) {
      totalValue += invoices.reduce((sum, inv) => sum + inv.amount, 0);
      count++;
    }
  }

  return count > 0 ? totalValue / count : 0;
}
