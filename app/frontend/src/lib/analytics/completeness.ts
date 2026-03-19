// ============================================================
// BizPulse — Data Completeness Scoring Engine
//
// Measures how complete the data is for each analytics area.
// Enables trust indicators: "exact" / "estimated" / "incomplete"
// ============================================================

import type { Deal, Invoice, Lead, PaymentTransaction, MarketingSpend, ChannelCampaign } from '../types';
import type { ContentMetric, CompletenessScore, SystemCompleteness } from './domain';

interface CompletenessInput {
  leads: Lead[];
  deals: Deal[];
  invoices: Invoice[];
  payments: PaymentTransaction[];
  marketingSpend: MarketingSpend[];
  channelCampaigns: ChannelCampaign[];
  contentMetrics?: ContentMetric[];
}

/**
 * Compute completeness scores for all analytics areas.
 */
export function computeSystemCompleteness(input: CompletenessInput): SystemCompleteness {
  const areas: CompletenessScore[] = [
    computeMarketingCompleteness(input),
    computeSalesFunnelCompleteness(input),
    computePaymentLinkageCompleteness(input),
    computeOrganicDataCompleteness(input),
  ];

  const overall = areas.length > 0
    ? Math.round(areas.reduce((sum, a) => sum + a.score, 0) / areas.length)
    : 0;

  return { overall, areas };
}

function computeMarketingCompleteness(input: CompletenessInput): CompletenessScore {
  const missing: string[] = [];
  const notes: string[] = [];
  let populated = 0;
  const total = 5;

  // Has channel campaigns?
  if (input.channelCampaigns.length > 0) populated++;
  else missing.push('channelCampaigns');

  // Has marketing spend?
  if (input.marketingSpend.length > 0) populated++;
  else missing.push('marketingSpend');

  // Marketing spend linked to channels?
  const linkedSpend = input.marketingSpend.filter((s) => s.channelCampaignExternalId).length;
  const spendLinkage = input.marketingSpend.length > 0 ? linkedSpend / input.marketingSpend.length : 0;
  if (spendLinkage > 0.8) populated++;
  else if (spendLinkage > 0) {
    populated += 0.5;
    notes.push(`${Math.round(spendLinkage * 100)}% расходов привязаны к каналам`);
  } else {
    missing.push('spend→channel linkage');
  }

  // Leads linked to channels?
  const linkedLeads = input.leads.filter((l) => l.channelCampaignExternalId).length;
  const leadLinkage = input.leads.length > 0 ? linkedLeads / input.leads.length : 0;
  if (leadLinkage > 0.8) populated++;
  else if (leadLinkage > 0) {
    populated += 0.5;
    notes.push(`${Math.round(leadLinkage * 100)}% лидов привязаны к каналам`);
  } else {
    missing.push('lead→channel linkage');
  }

  // Has content metrics?
  if (input.contentMetrics && input.contentMetrics.length > 0) populated++;
  else notes.push('Нет данных по контенту/органике');

  const score = Math.round((populated / total) * 100);

  return {
    area: 'marketing',
    label: 'Маркетинг',
    score,
    totalFields: total,
    populatedFields: Math.round(populated),
    missingCritical: missing,
    notes,
  };
}

function computeSalesFunnelCompleteness(input: CompletenessInput): CompletenessScore {
  const missing: string[] = [];
  const notes: string[] = [];
  let populated = 0;
  const total = 5;

  // Has leads?
  if (input.leads.length > 0) populated++;
  else missing.push('leads');

  // Has deals?
  if (input.deals.length > 0) populated++;
  else missing.push('deals');

  // Deals linked to leads?
  const linkedDeals = input.deals.filter((d) => d.leadExternalId).length;
  const dealLinkage = input.deals.length > 0 ? linkedDeals / input.deals.length : 0;
  if (dealLinkage > 0.8) populated++;
  else if (dealLinkage > 0) {
    populated += 0.5;
    notes.push(`${Math.round(dealLinkage * 100)}% сделок привязаны к лидам`);
  } else {
    missing.push('deal→lead linkage');
  }

  // Deals have managers?
  const managedDeals = input.deals.filter((d) => d.managerExternalId).length;
  const managerCoverage = input.deals.length > 0 ? managedDeals / input.deals.length : 0;
  if (managerCoverage > 0.8) populated++;
  else if (managerCoverage > 0) {
    populated += 0.5;
    notes.push(`${Math.round(managerCoverage * 100)}% сделок имеют менеджера`);
  }

  // Lost deals have reasons?
  const lostDeals = input.deals.filter((d) => d.status === 'lost');
  if (lostDeals.length > 0) {
    const withReason = lostDeals.filter((d) => d.lostReason).length;
    const reasonCoverage = withReason / lostDeals.length;
    if (reasonCoverage > 0.5) populated++;
    else notes.push(`${Math.round(reasonCoverage * 100)}% потерянных сделок имеют причину`);
  } else {
    populated++;
  }

  const score = Math.round((populated / total) * 100);

  return {
    area: 'sales_funnel',
    label: 'Воронка продаж',
    score,
    totalFields: total,
    populatedFields: Math.round(populated),
    missingCritical: missing,
    notes,
  };
}

function computePaymentLinkageCompleteness(input: CompletenessInput): CompletenessScore {
  const missing: string[] = [];
  const notes: string[] = [];
  let populated = 0;
  const total = 4;

  // Has invoices?
  if (input.invoices.length > 0) populated++;
  else missing.push('invoices');

  // Has payments?
  if (input.payments.length > 0) populated++;
  else missing.push('payments');

  // Invoices have externalId?
  const withExtId = input.invoices.filter((i) => i.invoiceExternalId).length;
  const extIdRate = input.invoices.length > 0 ? withExtId / input.invoices.length : 0;
  if (extIdRate > 0.8) populated++;
  else if (extIdRate > 0) {
    populated += 0.5;
    notes.push(`${Math.round(extIdRate * 100)}% счетов имеют invoiceExternalId`);
  } else {
    missing.push('invoice.invoiceExternalId');
  }

  // Invoices linked to deals?
  const withDeal = input.invoices.filter((i) => i.dealExternalId).length;
  const dealLinkRate = input.invoices.length > 0 ? withDeal / input.invoices.length : 0;
  if (dealLinkRate > 0.8) populated++;
  else if (dealLinkRate > 0) {
    populated += 0.5;
    notes.push(`${Math.round(dealLinkRate * 100)}% счетов привязаны к сделкам`);
  } else {
    missing.push('invoice→deal linkage');
  }

  const score = Math.round((populated / total) * 100);

  return {
    area: 'payment_linkage',
    label: 'Связь оплат',
    score,
    totalFields: total,
    populatedFields: Math.round(populated),
    missingCritical: missing,
    notes,
  };
}

function computeOrganicDataCompleteness(input: CompletenessInput): CompletenessScore {
  const missing: string[] = [];
  const notes: string[] = [];
  const total = 3;
  let populated = 0;

  const cm = input.contentMetrics ?? [];

  if (cm.length > 0) {
    populated++;

    // Have engagement data?
    const withEngagement = cm.filter((c) => c.likes + c.comments + c.saves > 0).length;
    if (withEngagement > cm.length * 0.5) populated++;
    else notes.push(`${Math.round((withEngagement / cm.length) * 100)}% контента с данными вовлечения`);

    // Have conversion data?
    const withConversion = cm.filter((c) => c.leadsGenerated > 0 || c.inboundMessages > 0).length;
    if (withConversion > cm.length * 0.3) populated++;
    else notes.push(`${Math.round((withConversion / cm.length) * 100)}% контента с конверсией в лиды`);
  } else {
    missing.push('contentMetrics');
    notes.push('Данные по контенту/органике не загружены');
  }

  const score = Math.round((populated / total) * 100);

  return {
    area: 'organic',
    label: 'Органика / контент',
    score,
    totalFields: total,
    populatedFields: populated,
    missingCritical: missing,
    notes,
  };
}
