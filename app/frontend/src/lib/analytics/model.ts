import type {
  ChannelCampaign,
  Customer,
  Deal,
  Invoice,
  Lead,
  MarketingSpend,
  Manager,
  PaymentTransaction,
} from '../types';
import { normalizeReferenceId } from '../idNormalization';

export type LinkMode = 'exact' | 'fallback';

export interface MissingLinkReason {
  field: string;
  detail: string;
}

export interface AttributionResult {
  channelCampaignExternalId?: string;
  mode: LinkMode;
  reasons: MissingLinkReason[];
}

export function createMapByExternalId<T>(
  items: T[],
  keyFn: (t: T) => string | undefined
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    map.set(key, item);
    const normalized = normalizeReferenceId(key);
    if (normalized) map.set(normalized, item);
  }
  return map;
}

export function sum(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0);
}

export interface RevenueControlTowerModel {
  channelCampaigns: ChannelCampaign[];
  leads: Lead[];
  deals: Deal[];
  invoices: Invoice[];
  payments: PaymentTransaction[];
  customers: Customer[];
  marketingSpend: MarketingSpend[];
  managers: Manager[];

  leadByExternalId: Map<string, Lead>;
  dealByExternalId: Map<string, Deal>;
  invoiceByInvoiceExternalId: Map<string, Invoice>;
  invoicesByDealExternalId: Map<string, Invoice[]>;
  paymentsByInvoiceExternalId: Map<string, PaymentTransaction[]>;

  customersByExternalId: Map<string, Customer>;
  channelCampaignByExternalId: Map<string, ChannelCampaign>;
}

export function buildRevenueControlTowerModel(input: {
  channelCampaigns: ChannelCampaign[];
  leads: Lead[];
  deals: Deal[];
  invoices: Invoice[];
  payments: PaymentTransaction[];
  customers: Customer[];
  marketingSpend: MarketingSpend[];
  managers: Manager[];
}): RevenueControlTowerModel {
  const leadByExternalId = createMapByExternalId(input.leads, (l) => l.leadExternalId);
  const dealByExternalId = createMapByExternalId(input.deals, (d) => d.dealExternalId);
  const invoiceByInvoiceExternalId = createMapByExternalId(input.invoices, (i) => i.invoiceExternalId);

  const invoicesByDealExternalId = new Map<string, Invoice[]>();
  for (const inv of input.invoices) {
    const dealExternalId = inv.dealExternalId;
    if (!dealExternalId) continue;
    const arr = invoicesByDealExternalId.get(dealExternalId) ?? [];
    arr.push(inv);
    invoicesByDealExternalId.set(dealExternalId, arr);
    const normalized = normalizeReferenceId(dealExternalId);
    if (normalized && normalized !== dealExternalId) {
      const normalizedArr = invoicesByDealExternalId.get(normalized) ?? [];
      normalizedArr.push(inv);
      invoicesByDealExternalId.set(normalized, normalizedArr);
    }
  }

  const paymentsByInvoiceExternalId = new Map<string, PaymentTransaction[]>();
  for (const p of input.payments) {
    if (!p.invoiceExternalId) continue;
    const arr = paymentsByInvoiceExternalId.get(p.invoiceExternalId) ?? [];
    arr.push(p);
    paymentsByInvoiceExternalId.set(p.invoiceExternalId, arr);
    const normalized = normalizeReferenceId(p.invoiceExternalId);
    if (normalized && normalized !== p.invoiceExternalId) {
      const normalizedArr = paymentsByInvoiceExternalId.get(normalized) ?? [];
      normalizedArr.push(p);
      paymentsByInvoiceExternalId.set(normalized, normalizedArr);
    }
  }

  const customersByExternalId = createMapByExternalId(input.customers, (c) => c.customerExternalId);
  const channelCampaignByExternalId = createMapByExternalId(input.channelCampaigns, (cc) => cc.channelCampaignExternalId);

  return {
    ...input,
    leadByExternalId,
    dealByExternalId,
    invoiceByInvoiceExternalId,
    invoicesByDealExternalId,
    paymentsByInvoiceExternalId,
    customersByExternalId,
    channelCampaignByExternalId,
  };
}

export function resolvePaymentAttribution(model: RevenueControlTowerModel, payment: PaymentTransaction): AttributionResult {
  const reasons: MissingLinkReason[] = [];

  if (!payment.invoiceExternalId) {
    return {
      mode: 'fallback',
      reasons: [{ field: 'payment.invoiceExternalId', detail: 'Нет invoiceExternalId на платеже' }],
    };
  }

  const invoice =
    model.invoiceByInvoiceExternalId.get(payment.invoiceExternalId) ??
    (normalizeReferenceId(payment.invoiceExternalId)
      ? model.invoiceByInvoiceExternalId.get(normalizeReferenceId(payment.invoiceExternalId) as string)
      : undefined);
  if (!invoice) {
    return {
      mode: 'fallback',
      reasons: [{ field: 'invoice', detail: `Не найден счет по invoiceExternalId=${payment.invoiceExternalId}` }],
    };
  }

  if (!invoice.dealExternalId) {
    return {
      mode: 'fallback',
      reasons: [{ field: 'invoice.dealExternalId', detail: 'Нет связки счет -> сделка' }],
    };
  }

  const deal =
    model.dealByExternalId.get(invoice.dealExternalId) ??
    (normalizeReferenceId(invoice.dealExternalId)
      ? model.dealByExternalId.get(normalizeReferenceId(invoice.dealExternalId) as string)
      : undefined);
  if (!deal) {
    return {
      mode: 'fallback',
      reasons: [{ field: 'deal', detail: `Не найдена сделка по dealExternalId=${invoice.dealExternalId}` }],
    };
  }

  if (!deal.leadExternalId) {
    return {
      mode: 'fallback',
      reasons: [{ field: 'deal.leadExternalId', detail: 'Нет связки сделка -> лид' }],
    };
  }

  const lead =
    model.leadByExternalId.get(deal.leadExternalId) ??
    (normalizeReferenceId(deal.leadExternalId)
      ? model.leadByExternalId.get(normalizeReferenceId(deal.leadExternalId) as string)
      : undefined);
  if (!lead) {
    return {
      mode: 'fallback',
      reasons: [{ field: 'lead', detail: `Не найден лид по leadExternalId=${deal.leadExternalId}` }],
    };
  }

  if (!lead.channelCampaignExternalId) {
    return {
      mode: 'fallback',
      reasons: [{ field: 'lead.channelCampaignExternalId', detail: 'Нет источника на лиде' }],
    };
  }

  return {
    channelCampaignExternalId: lead.channelCampaignExternalId,
    mode: 'exact',
    reasons,
  };
}

export function resolveInvoiceOutstandingExact(
  model: RevenueControlTowerModel,
  invoice: Invoice
): { outstanding: number; isExact: boolean; paymentSum: number; notes: string[] } {
  const notes: string[] = [];

  if (!invoice.invoiceExternalId) {
    // Cannot compute partial without linkage.
    if (invoice.status === 'unpaid') {
      notes.push('Нет invoiceExternalId у счета: используем статус unpaid как полный остаток.');
      return { outstanding: invoice.amount, isExact: false, paymentSum: 0, notes };
    }
    if (invoice.status === 'paid') {
      notes.push('Нет invoiceExternalId у счета: статус paid используем как полностью погашенный.');
      return { outstanding: 0, isExact: false, paymentSum: 0, notes };
    }
    return { outstanding: invoice.amount, isExact: false, paymentSum: 0, notes };
  }

  const payments = model.paymentsByInvoiceExternalId.get(invoice.invoiceExternalId) ?? [];
  const paidSum = payments.reduce((s, p) => s + p.amount, 0);
  const outstanding = Math.max(0, invoice.amount - paidSum);

  return {
    outstanding,
    isExact: true,
    paymentSum: paidSum,
    notes,
  };
}

