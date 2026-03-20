import type { Deal, Invoice, Lead, PaymentTransaction } from '../types';
import { buildRevenueControlTowerModel, resolvePaymentAttribution } from './model';

export interface LinkageDiagnostics {
  paymentToInvoiceMissing: number;
  invoiceToDealMissing: number;
  dealToLeadMissing: number;
  leadToChannelMissing: number;
  fullyLinkedPayments: number;
  totalPayments: number;
  linkageCoveragePercent: number;
  topBreakReasons: Array<{ label: string; count: number }>;
  actions: string[];
}

export function computeLinkageDiagnostics(input: {
  leads: Lead[];
  deals: Deal[];
  invoices: Invoice[];
  payments: PaymentTransaction[];
}): LinkageDiagnostics {
  const model = buildRevenueControlTowerModel({
    leads: input.leads,
    deals: input.deals,
    invoices: input.invoices,
    payments: input.payments,
    channelCampaigns: [],
    customers: [],
    marketingSpend: [],
    managers: [],
  });

  let paymentToInvoiceMissing = 0;
  let invoiceToDealMissing = 0;
  let dealToLeadMissing = 0;
  let leadToChannelMissing = 0;
  let fullyLinkedPayments = 0;
  const reasonCounts = new Map<string, number>();

  const payments = input.payments.filter((p) => p.amount > 0);
  for (const p of payments) {
    const attr = resolvePaymentAttribution(model, p);
    if (attr.mode === 'exact' && attr.channelCampaignExternalId) {
      fullyLinkedPayments += 1;
      continue;
    }

    for (const reason of attr.reasons) {
      reasonCounts.set(reason.field, (reasonCounts.get(reason.field) ?? 0) + 1);
      if (reason.field === 'payment.invoiceExternalId') paymentToInvoiceMissing += 1;
      if (reason.field === 'invoice.dealExternalId') invoiceToDealMissing += 1;
      if (reason.field === 'deal.leadExternalId') dealToLeadMissing += 1;
      if (reason.field === 'lead.channelCampaignExternalId') leadToChannelMissing += 1;
    }
  }

  const topBreakReasons = Array.from(reasonCounts.entries())
    .map(([field, count]) => ({ label: mapFieldToLabel(field), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const actions: string[] = [];
  if (paymentToInvoiceMissing > 0) actions.push('В оплатах заполнить invoiceExternalId (ID счета).');
  if (invoiceToDealMissing > 0) actions.push('В счетах заполнить dealExternalId (связь со сделкой).');
  if (dealToLeadMissing > 0) actions.push('В сделках заполнить leadExternalId (связь с лидом).');
  if (leadToChannelMissing > 0) actions.push('В лидах заполнить channelCampaignExternalId (источник).');
  if (actions.length === 0) actions.push('Критичных разрывов связей не найдено.');

  const totalPayments = payments.length;
  const linkageCoveragePercent = totalPayments > 0 ? Math.round((fullyLinkedPayments / totalPayments) * 100) : 0;

  return {
    paymentToInvoiceMissing,
    invoiceToDealMissing,
    dealToLeadMissing,
    leadToChannelMissing,
    fullyLinkedPayments,
    totalPayments,
    linkageCoveragePercent,
    topBreakReasons,
    actions,
  };
}

function mapFieldToLabel(field: string): string {
  switch (field) {
    case 'payment.invoiceExternalId':
      return 'Оплата → Счет';
    case 'invoice.dealExternalId':
      return 'Счет → Сделка';
    case 'deal.leadExternalId':
      return 'Сделка → Лид';
    case 'lead.channelCampaignExternalId':
      return 'Лид → Источник';
    default:
      return field;
  }
}

