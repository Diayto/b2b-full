// ============================================================
// BizPulse KZ — Metrics Calculation & Signals Engine
// ============================================================

import { format, parseISO, startOfMonth, startOfWeek, isWithinInterval, subDays } from 'date-fns';
import type {
  Transaction, Customer, Invoice, MarketingSpend, Document,
  FinancialSummary, CashflowPoint, CategoryBreakdown,
  InvestorMetrics, MonthlyBusinessPlan, Signal, SignalType, SignalSeverity,
  AggregationPeriod, DateRange,
} from './types';

// --- Helpers ---
function filterByDateRange(items: { date?: string; invoiceDate?: string }[], range?: DateRange) {
  if (!range) return items;
  return items.filter(item => {
    const d = item.date || item.invoiceDate || '';
    return d >= range.from && d <= range.to;
  });
}

function groupByPeriod(dates: string[], period: AggregationPeriod): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const d of dates) {
    let key: string;
    const parsed = parseISO(d);
    if (period === 'day') {
      key = d;
    } else if (period === 'week') {
      key = format(startOfWeek(parsed, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    } else {
      key = format(startOfMonth(parsed), 'yyyy-MM');
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }
  return groups;
}

// ============================================================
// Financial Summary
// ============================================================
export function calculateFinancialSummary(
  transactions: Transaction[],
  range?: DateRange
): FinancialSummary {
  const filtered = filterByDateRange(transactions, range) as Transaction[];
  const totalRevenue = filtered
    .filter(t => t.direction === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = filtered
    .filter(t => t.direction === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  const profit = totalRevenue - totalExpenses;
  const grossMarginPercent = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  return {
    totalRevenue,
    totalExpenses,
    profit,
    grossMarginPercent,
    cashflowNet: profit,
  };
}

// ============================================================
// Cashflow by Period
// ============================================================
export function calculateCashflow(
  transactions: Transaction[],
  period: AggregationPeriod = 'month',
  range?: DateRange
): CashflowPoint[] {
  const filtered = filterByDateRange(transactions, range) as Transaction[];
  const allDates = filtered.map(t => t.date);
  const groups = groupByPeriod(allDates, period);

  const result: CashflowPoint[] = [];
  const sortedKeys = Array.from(groups.keys()).sort();

  for (const key of sortedKeys) {
    const dates = groups.get(key)!;
    const periodTxns = filtered.filter(t => dates.includes(t.date));
    const income = periodTxns.filter(t => t.direction === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = periodTxns.filter(t => t.direction === 'expense').reduce((s, t) => s + t.amount, 0);
    result.push({ period: key, income, expense, net: income - expense });
  }

  return result;
}

// ============================================================
// Expense Categories
// ============================================================
export function calculateCategoryBreakdown(
  transactions: Transaction[],
  direction: 'income' | 'expense' = 'expense',
  range?: DateRange
): CategoryBreakdown[] {
  const filtered = (filterByDateRange(transactions, range) as Transaction[])
    .filter(t => t.direction === direction);

  const total = filtered.reduce((s, t) => s + t.amount, 0);
  const byCategory = new Map<string, number>();

  for (const t of filtered) {
    byCategory.set(t.category, (byCategory.get(t.category) || 0) + t.amount);
  }

  return Array.from(byCategory.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percent: total > 0 ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

// ============================================================
// Investor Metrics (LTV, CAC, Retention)
// ============================================================
export function calculateInvestorMetrics(
  customers: Customer[],
  invoices: Invoice[],
  marketingSpend: MarketingSpend[]
): InvestorMetrics {
  const missingData: string[] = [];

  if (customers.length === 0) missingData.push('customers');
  if (invoices.length === 0) missingData.push('invoices');

  if (customers.length === 0 || invoices.length === 0) {
    return {
      totalCustomers: customers.length,
      activeCustomers: 0,
      avgRevenuePerCustomer: 0,
      ltvAvg: 0,
      retentionRate: 0,
      cacAvg: null,
      ltvCacRatio: null,
      available: false,
      missingData,
    };
  }

  const totalCustomers = customers.length;

  // Revenue per customer (from paid invoices)
  const paidInvoices = invoices.filter(i => i.status === 'paid');
  const revenueByCustomer = new Map<string, number>();
  for (const inv of paidInvoices) {
    revenueByCustomer.set(
      inv.customerExternalId,
      (revenueByCustomer.get(inv.customerExternalId) || 0) + inv.amount
    );
  }

  // Active customers = those with at least one paid invoice
  const activeCustomers = revenueByCustomer.size;

  // Average Revenue Per Customer
  const totalPaidRevenue = paidInvoices.reduce((s, i) => s + i.amount, 0);
  const avgRevenuePerCustomer = activeCustomers > 0 ? totalPaidRevenue / activeCustomers : 0;

  // LTV avg = average total revenue per customer
  const ltvValues = Array.from(revenueByCustomer.values());
  const ltvAvg = ltvValues.length > 0
    ? ltvValues.reduce((s, v) => s + v, 0) / ltvValues.length
    : 0;

  // Retention rate (simple: active / total)
  const retentionRate = totalCustomers > 0 ? (activeCustomers / totalCustomers) * 100 : 0;

  // CAC calculation
  let cacAvg: number | null = null;
  let ltvCacRatio: number | null = null;

  if (marketingSpend.length > 0) {
    const totalMktSpend = marketingSpend.reduce((s, m) => s + m.amount, 0);
    // New customers per month from startDate
    const newCustomerCount = customers.filter(c => c.startDate).length || totalCustomers;
    cacAvg = newCustomerCount > 0 ? totalMktSpend / newCustomerCount : null;

    if (cacAvg && cacAvg > 0 && ltvAvg > 0) {
      ltvCacRatio = ltvAvg / cacAvg;
    }
  } else {
    missingData.push('marketing_spend');
  }

  return {
    totalCustomers,
    activeCustomers,
    avgRevenuePerCustomer,
    ltvAvg,
    retentionRate,
    cacAvg,
    ltvCacRatio,
    available: true,
    missingData,
  };
}

// ============================================================
// Unpaid Invoices (Дебиторка)
// ============================================================
export function calculateUnpaidInvoices(invoices: Invoice[]): {
  totalUnpaid: number;
  count: number;
  items: Invoice[];
} {
  const unpaid = invoices.filter(i => i.status === 'unpaid');
  return {
    totalUnpaid: unpaid.reduce((s, i) => s + i.amount, 0),
    count: unpaid.length,
    items: unpaid,
  };
}

// ============================================================
// Monthly Business Plan
// ============================================================
export function generateMonthlyBusinessPlan(
  transactions: Transaction[],
  customers: Customer[],
  invoices: Invoice[],
  marketingSpend: MarketingSpend[],
  documents: Document[]
): MonthlyBusinessPlan {
  const now = new Date();
  const period = format(now, 'yyyy-MM');
  const cashflow = calculateCashflow(transactions, 'month');
  const recent = cashflow.slice(-3);

  const avgIncome = recent.length > 0
    ? recent.reduce((sum, item) => sum + item.income, 0) / recent.length
    : 0;
  const avgExpense = recent.length > 0
    ? recent.reduce((sum, item) => sum + item.expense, 0) / recent.length
    : 0;

  const lastIncome = recent.length > 0 ? recent[recent.length - 1].income : 0;
  const prevIncome = recent.length > 1 ? recent[recent.length - 2].income : lastIncome;
  const incomeTrend = prevIncome > 0 ? (lastIncome - prevIncome) / prevIncome : 0;

  const forecastRevenue = Math.max(0, Math.round(avgIncome * (1 + Math.max(-0.2, Math.min(0.2, incomeTrend)))));
  const forecastExpenses = Math.max(0, Math.round(avgExpense * 1.03));
  const forecastProfit = forecastRevenue - forecastExpenses;

  const unpaid = calculateUnpaidInvoices(invoices);
  const activeCustomers = new Set(invoices.filter(i => i.status === 'paid').map(i => i.customerExternalId)).size;
  const contractDeadlines30d = documents.filter((d) => {
    if (!d.endDate) return false;
    const end = parseISO(d.endDate);
    const in30Days = subDays(now, -30);
    return isWithinInterval(end, { start: now, end: in30Days });
  }).length;

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const risks: string[] = [];

  if (incomeTrend > 0.05) strengths.push('Выручка показывает положительный тренд по сравнению с прошлым месяцем.');
  if (forecastProfit > 0) strengths.push('Прогноз по прибыли на следующий месяц положительный.');
  if (activeCustomers >= Math.max(3, Math.floor(customers.length * 0.5))) strengths.push('Хорошая доля активных клиентов в базе.');

  if (unpaid.totalUnpaid > 0) weaknesses.push(`Высокая дебиторская задолженность: ${formatKZT(unpaid.totalUnpaid)}.`);
  if (avgExpense > avgIncome * 0.8) weaknesses.push('Расходы близки к выручке, маржа под давлением.');
  if (marketingSpend.length === 0) weaknesses.push('Нет данных по маркетингу, CAC и ROI считаются неполно.');

  if (contractDeadlines30d > 0) risks.push(`Есть ${contractDeadlines30d} договор(ов) с дедлайном в ближайшие 30 дней.`);
  if (forecastProfit < 0) risks.push('Прогноз указывает на потенциальный отрицательный cashflow в следующем месяце.');
  if (unpaid.count >= 5) risks.push('Количество неоплаченных счетов может ухудшить ликвидность.');

  const actions = [
    {
      id: 'revenue-01',
      title: 'Усилить продажи текущим активным клиентам',
      area: 'revenue',
      priority: 'high',
      rationale: 'Быстрее всего рост выручки достигается за счет расширения действующих контрактов.',
      target: 'Поднять выручку следующего месяца на 8-12%.',
    },
    {
      id: 'cashflow-01',
      title: 'Запустить кампанию по закрытию дебиторки',
      area: 'cashflow',
      priority: unpaid.totalUnpaid > 0 ? 'high' : 'medium',
      rationale: 'Снижение доли просроченных оплат напрямую улучшает оборотный капитал.',
      target: unpaid.totalUnpaid > 0 ? 'Снизить дебиторку минимум на 25% за месяц.' : 'Поддерживать долю дебиторки ниже 5% выручки.',
    },
    {
      id: 'cost-01',
      title: 'Оптимизировать топ-3 статьи расходов',
      area: 'cost',
      priority: 'medium',
      rationale: 'Фокус на крупнейших расходах дает максимальный эффект в коротком горизонте.',
      target: 'Снизить совокупные расходы на 5-7% без потери качества.',
    },
    {
      id: 'ops-01',
      title: 'Проверить все договоры с дедлайном до 30 дней',
      area: 'operations',
      priority: contractDeadlines30d > 0 ? 'high' : 'low',
      rationale: 'Своевременная пролонгация договоров защищает будущую выручку.',
      target: contractDeadlines30d > 0 ? 'Согласовать продление 100% критичных договоров.' : 'Поддерживать календарь пролонгаций актуальным.',
    },
  ] satisfies MonthlyBusinessPlan['actions'];

  return {
    period,
    forecastRevenue,
    forecastExpenses,
    forecastProfit,
    strengths,
    weaknesses,
    risks,
    actions,
  };
}

// ============================================================
// Signals Engine (Rule-Based)
// ============================================================
function generateId(): string {
  return `sig-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

function createSignal(
  companyId: string,
  type: SignalType,
  severity: SignalSeverity,
  title: string,
  description: string,
  sourceRefs?: string[]
): Signal {
  return {
    id: generateId(),
    companyId,
    type,
    severity,
    title,
    description,
    createdAt: new Date().toISOString(),
    status: 'open',
    sourceRefs,
  };
}

export function generateSignals(
  companyId: string,
  transactions: Transaction[],
  invoices: Invoice[],
  documents: Document[],
  existingSignals: Signal[]
): Signal[] {
  const signals: Signal[] = [];
  const closedIds = new Set(existingSignals.filter(s => s.status === 'closed').map(s => `${s.type}-${s.description}`));

  // 1. Cashflow Negative Trend
  const cashflow = calculateCashflow(transactions, 'month');
  if (cashflow.length >= 2) {
    const lastTwo = cashflow.slice(-2);
    if (lastTwo.every(cf => cf.net < 0)) {
      const key = `cashflow_negative-Отрицательный cashflow ${lastTwo.length} месяцев подряд`;
      if (!closedIds.has(key)) {
        signals.push(createSignal(
          companyId,
          'cashflow_negative',
          'high',
          '⚠️ Отрицательный cashflow',
          `Отрицательный cashflow ${lastTwo.length} месяцев подряд. Последний: ${formatKZT(lastTwo[lastTwo.length - 1].net)}`,
        ));
      }
    }
  }

  // 2. Expense Spike
  if (cashflow.length >= 5) {
    const recent = cashflow[cashflow.length - 1];
    const prev4 = cashflow.slice(-5, -1);
    const avgExpense = prev4.reduce((s, c) => s + c.expense, 0) / prev4.length;
    if (avgExpense > 0 && recent.expense > avgExpense * 1.2) {
      const pctIncrease = Math.round(((recent.expense - avgExpense) / avgExpense) * 100);
      const key = `expense_spike-Расходы выросли на ${pctIncrease}%`;
      if (!closedIds.has(key)) {
        signals.push(createSignal(
          companyId,
          'expense_spike',
          'medium',
          '📈 Всплеск расходов',
          `Расходы выросли на ${pctIncrease}% по сравнению со средним за 4 предыдущих периода`,
        ));
      }
    }
  }

  // 3. Revenue Drop
  if (cashflow.length >= 3) {
    const last3 = cashflow.slice(-3);
    if (last3[2].income < last3[1].income && last3[1].income < last3[0].income) {
      const key = 'revenue_drop-Выручка падает 3 периода подряд';
      if (!closedIds.has(key)) {
        signals.push(createSignal(
          companyId,
          'revenue_drop',
          'high',
          '📉 Падение выручки',
          'Выручка падает 3 периода подряд. Требуется внимание.',
        ));
      }
    }
  }

  // 4. Contract Deadline
  const now = new Date();
  const in7Days = subDays(now, -7);
  for (const doc of documents) {
    if (doc.endDate) {
      const endDate = parseISO(doc.endDate);
      if (isWithinInterval(endDate, { start: now, end: in7Days })) {
        const key = `contract_deadline-${doc.id}`;
        if (!closedIds.has(key)) {
          signals.push(createSignal(
            companyId,
            'contract_deadline',
            'medium',
            '📋 Срок договора истекает',
            `Договор "${doc.title}" истекает ${doc.endDate}${doc.counterparty ? ` (${doc.counterparty})` : ''}`,
            [doc.id],
          ));
        }
      }
    }
  }

  // 5. High Unpaid Invoices
  if (invoices.length > 0) {
    const { totalUnpaid } = calculateUnpaidInvoices(invoices);
    const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
    const threshold = totalRevenue > 0 ? totalRevenue * 0.05 : 500000;

    if (totalUnpaid > threshold) {
      const key = `high_unpaid_invoices-Неоплаченные счета: ${formatKZT(totalUnpaid)}`;
      if (!closedIds.has(key)) {
        signals.push(createSignal(
          companyId,
          'high_unpaid_invoices',
          totalUnpaid > threshold * 3 ? 'high' : 'medium',
          '💰 Высокая дебиторка',
          `Неоплаченные счета: ${formatKZT(totalUnpaid)} (${invoices.filter(i => i.status === 'unpaid').length} шт.)`,
        ));
      }
    }
  }

  return signals;
}

// ============================================================
// Formatting Helpers
// ============================================================
export function formatKZT(amount: number): string {
  return new Intl.NumberFormat('ru-KZ', {
    style: 'currency',
    currency: 'KZT',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-KZ').format(Math.round(value));
}
