// ============================================================
// Chrona — Strategic next steps (owner-facing)
// Собирает сигналы из уже загруженных сущностей и ведёт по продукту.
// ============================================================

import type { ChannelCampaign, Deal, Invoice, Lead, MarketingSpend, PaymentTransaction } from '../types';
import type { ContentMetric } from './domain';
import { computeLinkageDiagnostics } from './linkageDiagnostics';

export type StrategicStepHref = '/uploads' | '/marketing' | '/sales-cash' | '/marketing/data';

export interface StrategicNextStep {
  id: string;
  title: string;
  detail?: string;
  href: StrategicStepHref;
  /** Меньше — выше в списке */
  priority: number;
}

export interface StrategicNextStepsInput {
  leads: Lead[];
  deals: Deal[];
  invoices: Invoice[];
  payments: PaymentTransaction[];
  marketingSpend: MarketingSpend[];
  channelCampaigns: ChannelCampaign[];
  contentMetrics: ContentMetric[];
}

/**
 * До 5 шагов: что улучшить в данных и куда в интерфейсе идти дальше.
 */
export function computeStrategicNextSteps(input: StrategicNextStepsInput): StrategicNextStep[] {
  const { leads, deals, invoices, payments, marketingSpend, channelCampaigns, contentMetrics } = input;
  const steps: StrategicNextStep[] = [];

  const linkage = computeLinkageDiagnostics({ leads, deals, invoices, payments });
  const unpaidInvoices = invoices.filter((i) => i.status === 'unpaid');
  const dealsWithoutLead = deals.filter((d) => !d.leadExternalId?.trim()).length;

  if (leads.length === 0 && deals.length === 0) {
    steps.push({
      id: 'core_funnel',
      title: 'Добавить лиды и сделки',
      detail: 'Умная загрузка Excel: листы «Консультации» и «ПРОДАЖИ» — основа воронки и Sales/Cash.',
      href: '/uploads',
      priority: 5,
    });
  }

  if (payments.length > 0 && linkage.totalPayments > 0 && linkage.linkageCoveragePercent < 75) {
    steps.push({
      id: 'money_chain',
      title: 'Починить цепочку до денег',
      detail: linkage.actions[0] ?? 'Сверьте телефон/ID между оплатами, счетами, сделками и лидами.',
      href: '/marketing/data',
      priority: 12,
    });
  }

  if (invoices.length > 0 && payments.length === 0) {
    steps.push({
      id: 'payments',
      title: 'Загрузить оплаты',
      detail: 'Без платежей на дашборде не будет фактического притока и роста.',
      href: '/uploads',
      priority: 15,
    });
  }

  if (dealsWithoutLead > 0 && leads.length > 0) {
    steps.push({
      id: 'deal_lead',
      title: 'Связать сделки с лидами',
      detail: `≈${dealsWithoutLead} сделок без leadExternalId — маркетинговая атрибуция и воронка искажены.`,
      href: '/uploads',
      priority: 18,
    });
  }

  if (marketingSpend.length === 0 && (leads.length > 0 || deals.length > 0)) {
    steps.push({
      id: 'spend',
      title: 'Добавить расходы (или лист «СВОД»)',
      detail: 'Нужны для CAC, ROI и сравнения с выручкой за месяц или год.',
      href: '/uploads',
      priority: 22,
    });
  }

  if (leads.length > 0 && leads.some((l) => !l.channelCampaignExternalId?.trim())) {
    steps.push({
      id: 'channels_on_leads',
      title: 'Проверить источники у лидов',
      detail: 'Часть лидов без канала — таблица эффективности источников будет беднее.',
      href: '/marketing',
      priority: 28,
    });
  }

  if (unpaidInvoices.length >= 3) {
    steps.push({
      id: 'cash_execution',
      title: 'Разобрать неоплаченные счета',
      detail: `${unpaidInvoices.length} счетов в статусе не оплачен — фокус в Sales/Cash.`,
      href: '/sales-cash',
      priority: 25,
    });
  }

  if (contentMetrics.length === 0 && leads.length > 0) {
    steps.push({
      id: 'organic',
      title: 'Органика: опционально загрузить метрики контента',
      detail: 'Связка охват → лиды станет нагляднее (ручной импорт, без Meta API).',
      href: '/marketing/data',
      priority: 45,
    });
  }

  if (steps.length === 0 && (leads.length > 0 || deals.length > 0)) {
    steps.push({
      id: 'iterate',
      title: 'Углубиться в маркетинг и деньги',
      detail: 'Данные на базовом уровне есть — смотрите каналы и утечки денег.',
      href: '/marketing',
      priority: 90,
    });
  }

  steps.sort((a, b) => a.priority - b.priority);
  return steps.slice(0, 5);
}
