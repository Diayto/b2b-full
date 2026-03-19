import type {
  Customer,
  Deal,
  Invoice,
  Lead,
  MarketingSpend,
  Manager,
  PaymentTransaction,
  ChannelCampaign,
  Transaction,
} from './types';

export interface DemoDataBundle {
  managers: Omit<Manager, 'id' | 'companyId'>[];
  channelCampaigns: Omit<ChannelCampaign, 'id' | 'companyId'>[];
  customers: Omit<Customer, 'id' | 'companyId'>[];
  leads: Omit<Lead, 'id' | 'companyId'>[];
  deals: Omit<Deal, 'id' | 'companyId'>[];
  invoices: Omit<Invoice, 'id' | 'companyId'>[];
  payments: Omit<PaymentTransaction, 'id' | 'companyId'>[];
  marketingSpend: Omit<MarketingSpend, 'id' | 'companyId'>[];
  // Kept for backward compatibility with current dashboard + signals engine.
  transactions: Omit<Transaction, 'id' | 'companyId'>[];
}

function hashStringToSeed(input: string): number {
  // Simple stable hash -> 32-bit seed.
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, maxInclusive: number): number {
  const v = rng();
  const span = maxInclusive - min + 1;
  return min + Math.floor(v * span);
}

function randFloat(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function roundTo(n: number, step: number): number {
  if (!Number.isFinite(n) || step <= 0) return n;
  return Math.round(n / step) * step;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toISODate(d: Date): string {
  // Keep YYYY-MM-DD (UTC-based split is OK for demo).
  return d.toISOString().split('T')[0];
}

function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

function safeNonNegative(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function generateMvpDemoData(companyId: string): DemoDataBundle {
  const rng = mulberry32(hashStringToSeed(companyId));
  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const monthsBack = 10; // enough for growth + overdue spread
  const monthStart = new Date(todayMid.getFullYear(), todayMid.getMonth(), 1);
  const monthDates: Date[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    monthDates.push(addMonths(monthStart, -i));
  }

  const managerNames = [
    'Ербол Касымов',
    'Дана Сапарбекова',
    'Марат Абдуллаев',
    'Аяулым Даулетова',
    'Талгат Нурланов',
  ];
  const managers: Omit<Manager, 'id' | 'companyId'>[] = managerNames.map((name, idx) => ({
    managerExternalId: `M${String(idx + 1).padStart(3, '0')}`,
    name,
  }));

  const channelTemplates: Array<{
    channelCampaignExternalId: string;
    channelName: string;
    campaignName: string;
    quality: number; // 0..1 higher => better conversion + better payment behavior
    spendShare: number;
    cpl: number; // KZT per lead
    leadToDealRate: number; // probability
    dealToWonRate: number; // conditional probability of won (when not open)
    valueBase: number; // invoice base KZT
    managerIdxBias: number; // who handles it
  }> = [
    {
      channelCampaignExternalId: 'CC_GOOGLE_SEARCH',
      channelName: 'Google Search',
      campaignName: 'B2B Intent',
      quality: 0.82,
      spendShare: 0.19,
      cpl: 26000,
      leadToDealRate: 0.18,
      dealToWonRate: 0.44,
      valueBase: 650000,
      managerIdxBias: 0,
    },
    {
      channelCampaignExternalId: 'CC_LINKEDIN_OUTREACH',
      channelName: 'LinkedIn',
      campaignName: 'Outbound + Replies',
      quality: 0.72,
      spendShare: 0.15,
      cpl: 34000,
      leadToDealRate: 0.16,
      dealToWonRate: 0.40,
      valueBase: 720000,
      managerIdxBias: 1,
    },
    {
      channelCampaignExternalId: 'CC_RETARGETING',
      channelName: 'Retargeting',
      campaignName: 'Warm Audience',
      quality: 0.68,
      spendShare: 0.14,
      cpl: 24000,
      leadToDealRate: 0.14,
      dealToWonRate: 0.36,
      valueBase: 600000,
      managerIdxBias: 2,
    },
    {
      channelCampaignExternalId: 'CC_PARTNERS_REFERRAL',
      channelName: 'Partners',
      campaignName: 'Referral Deals',
      quality: 0.9,
      spendShare: 0.10,
      cpl: 52000,
      leadToDealRate: 0.22,
      dealToWonRate: 0.56,
      valueBase: 900000,
      managerIdxBias: 3,
    },
    {
      channelCampaignExternalId: 'CC_EMAIL_NEWSLETTER',
      channelName: 'Email',
      campaignName: 'Newsletter Nurture',
      quality: 0.56,
      spendShare: 0.12,
      cpl: 18000,
      leadToDealRate: 0.10,
      dealToWonRate: 0.30,
      valueBase: 520000,
      managerIdxBias: 4,
    },
    {
      channelCampaignExternalId: 'CC_FACEBOOK_LEADS',
      channelName: 'Facebook/Meta',
      campaignName: 'Lead Ads',
      quality: 0.38,
      spendShare: 0.15,
      cpl: 16000,
      leadToDealRate: 0.08,
      dealToWonRate: 0.22,
      valueBase: 480000,
      managerIdxBias: 2,
    },
    {
      channelCampaignExternalId: 'CC_EVENT_SPONSOR',
      channelName: 'Events',
      campaignName: 'Sponsor Booth',
      quality: 0.45,
      spendShare: 0.15,
      cpl: 28000,
      leadToDealRate: 0.09,
      dealToWonRate: 0.24,
      valueBase: 540000,
      managerIdxBias: 1,
    },
  ];

  const channelCampaigns: Omit<ChannelCampaign, 'id' | 'companyId'>[] = channelTemplates.map((t) => ({
    channelCampaignExternalId: t.channelCampaignExternalId,
    name: `${t.channelName} — ${t.campaignName}`,
    channelName: t.channelName,
    campaignName: t.campaignName,
    createdAt: toISODate(todayMid),
  }));

  // Customer base: keep the existing ones for compatibility with current UI.
  const baseCustomers: Array<{ customerExternalId: string; name: string; segment?: string; startDate: string }> = [
    { customerExternalId: 'C001', name: 'ТОО "Алматы Трейд"', segment: 'B2B', startDate: '2025-01-15' },
    { customerExternalId: 'C002', name: 'ИП Касымов', segment: 'SMB', startDate: '2025-03-01' },
    { customerExternalId: 'C003', name: 'ТОО "ТехноПарк"', segment: 'B2B', startDate: '2025-02-10' },
    { customerExternalId: 'C004', name: 'АО "КазМунайГаз"', segment: 'Enterprise', startDate: '2024-11-20' },
    { customerExternalId: 'C005', name: 'ТОО "Астана Логистик"', segment: 'B2B', startDate: '2025-05-01' },
    { customerExternalId: 'C006', name: 'ИП Нурланова', segment: 'SMB', startDate: '2025-06-15' },
    { customerExternalId: 'C007', name: 'ТОО "Шымкент Строй"', segment: 'B2B', startDate: '2025-04-01' },
    { customerExternalId: 'C008', name: 'АО "Казахтелеком"', segment: 'Enterprise', startDate: '2024-09-01' },
  ];

  const moreCustomerNames = [
    'ТОО "АльфаТорг"',
    'ТОО "КазБизнес Групп"',
    'ИП Абдикаримов',
    'ТОО "СеверСнаб"',
    'ТОО "Орион Сервис"',
    'ИП Султанбекова',
    'ТОО "Юнит Логистик"',
    'ТОО "Титан Партнерс"',
    'АО "Вектор Индастри"',
    'ТОО "Каспий Коммерс"',
    'ИП Сагындык',
    'ТОО "Кронос Солюшнс"',
    'ТОО "Темир Транс"',
    'ТОО "Артель Профи"',
    'АО "Сапфир Хаб"',
  ];

  const segments: Array<Customer['segment']> = ['B2B', 'SMB', 'Enterprise'];

  const customers: Omit<Customer, 'id' | 'companyId'>[] = baseCustomers.map((c) => ({
    customerExternalId: c.customerExternalId,
    name: c.name,
    segment: c.segment,
    startDate: c.startDate,
  }));

  const customerByExternalId = new Map<string, Omit<Customer, 'id' | 'companyId'>>();
  for (const c of customers) customerByExternalId.set(c.customerExternalId, c);

  const createCustomerExternalId = (seq: number) => `C${String(seq).padStart(3, '0')}`;
  let nextCustomerSeq = 9;

  const markCustomerStart = (customer: Omit<Customer, 'id' | 'companyId'>, startDate: Date): void => {
    // If customer already exists, keep earliest startDate for stable CAC.
    if (!customer.startDate) {
      customer.startDate = toISODate(startDate);
      return;
    }
    const existing = new Date(customer.startDate + 'T00:00:00Z');
    if (existing.getTime() > startDate.getTime()) {
      customer.startDate = toISODate(startDate);
    }
  };

  const leads: Array<Omit<Lead, 'id' | 'companyId'> & { _createdAt: Date; _monthIdx: number }> = [];
  const deals: Array<Omit<Deal, 'id' | 'companyId'> & { _createdAt: Date; _expectedCloseDate: Date; _statusResolvedAt?: Date }> =
    [];
  const invoices: Array<Omit<Invoice, 'id' | 'companyId'>> = [];
  const payments: Array<Omit<PaymentTransaction, 'id' | 'companyId'>> = [];
  const marketingSpend: Array<Omit<MarketingSpend, 'id' | 'companyId'>> = [];

  const dealValueStep = 1000;
  const leadCounterBase = 1000;

  let leadSeq = leadCounterBase;
  let dealSeq = 100;
  let invoiceSeq = 5000;
  let paymentSeq = 90000;

  // Leads + marketing spend
  const baseBudget = 3_000_000; // KZT / month
  const growthPerMonth = 0.055; // realistic growth curve

  for (let monthIdx = 0; monthIdx < monthDates.length; monthIdx++) {
    const monthDate = monthDates[monthIdx];
    const monthKey = toMonthKey(monthDate);

    const seasonality = 0.92 + rng() * 0.2; // 0.92..1.12
    const overallBudget = baseBudget * Math.pow(1 + growthPerMonth, monthIdx) * seasonality;

    for (const ch of channelTemplates) {
      const channelShareNorm = channelTemplates.reduce((s, x) => s + x.spendShare, 0) || 1;
      const share = ch.spendShare / channelShareNorm;

      // Add mild channel-specific volatility
      const spend = roundTo(overallBudget * share * (0.85 + rng() * 0.35), 100);
      const cpl = ch.cpl;

      marketingSpend.push({
        month: monthKey,
        amount: Math.max(1000, spend),
        channelCampaignExternalId: ch.channelCampaignExternalId,
      });

      const leadsCountFloat = safeNonNegative(spend / Math.max(1, cpl)) * (0.85 + rng() * 0.35);
      const leadsCount = Math.max(6, Math.round(leadsCountFloat));

      const managerIdx = ch.managerIdxBias % managers.length;

      for (let i = 0; i < leadsCount; i++) {
        // random day within month
        const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
        const day = randInt(rng, 1, Math.max(1, daysInMonth));
        const leadDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);

        leads.push({
          leadExternalId: `L${String(leadSeq).padStart(5, '0')}`,
          name: undefined,
          channelCampaignExternalId: ch.channelCampaignExternalId,
          managerExternalId: managers[managerIdx]?.managerExternalId,
          createdDate: toISODate(leadDate),
          status: undefined,
          _createdAt: leadDate,
          _monthIdx: monthIdx,
        });

        leadSeq++;
      }
    }
  }

  // Deals (lead -> deal)
  for (const lead of leads) {
    const ch = channelTemplates.find((x) => x.channelCampaignExternalId === lead.channelCampaignExternalId);
    if (!ch) continue;

    // Lead->deal conversion is a probability influenced by channel quality.
    const baseP = ch.leadToDealRate;
    const monthLift = 0.95 + (lead._monthIdx / Math.max(1, monthDates.length - 1)) * 0.12; // small improvement over time
    const p = baseP * monthLift * (0.85 + rng() * 0.25);

    if (rng() > p) continue;

    const createdAt = addDays(lead._createdAt, randInt(rng, 0, 12));
    const expectedClose = addDays(createdAt, randInt(rng, 18, 55));

    const ageDays = daysBetween(createdAt, todayMid);
    const recencyFactor = 1 - Math.max(0, Math.min(1, ageDays / 180));
    const openProbability = 0.06 + recencyFactor * 0.38; // recent deals more likely still open

    let status: 'open' | 'won' | 'lost';
    const wonRate = ch.dealToWonRate * (0.85 + rng() * 0.3);

    if (rng() < openProbability) {
      status = 'open';
    } else {
      status = rng() < wonRate ? 'won' : 'lost';
    }

    let wonDate: Date | undefined;
    let lastActivityDate: Date | undefined = undefined;
    if (status === 'open') {
      // Stalled deals: older open deals with old last activity
      if (ageDays > 45 && rng() < 0.45) {
        lastActivityDate = addDays(todayMid, -randInt(rng, 35, 120));
      } else {
        lastActivityDate = addDays(todayMid, -randInt(rng, 0, 18));
      }
    }

    if (status === 'won') {
      const candidateWon = addDays(createdAt, randInt(rng, 10, 70));
      if (isBefore(todayMid, candidateWon)) {
        // If it would close in the future, keep it open instead.
        status = 'open';
        lastActivityDate = addDays(todayMid, -randInt(rng, 0, 18));
      } else {
        wonDate = candidateWon;
        lastActivityDate = addDays(wonDate, -randInt(rng, 0, 6));
      }
    }

    if (status === 'lost') {
      lastActivityDate = addDays(createdAt, randInt(rng, 8, 55));
    }

    deals.push({
      dealExternalId: `D${String(dealSeq).padStart(5, '0')}`,
      leadExternalId: lead.leadExternalId,
      customerExternalId: undefined,
      managerExternalId: lead.managerExternalId,
      createdDate: toISODate(createdAt),
      expectedCloseDate: toISODate(expectedClose),
      lastActivityDate: lastActivityDate ? toISODate(lastActivityDate) : undefined,
      status,
      wonDate: wonDate ? toISODate(wonDate) : undefined,
      _createdAt: createdAt,
      _expectedCloseDate: expectedClose,
      _statusResolvedAt: lastActivityDate,
    });

    dealSeq++;
  }

  // Resolve lead statuses (optional for later funnel logic)
  const leadHasWon = new Set<string>();
  const leadHasAnyDeal = new Set<string>();
  for (const d of deals) {
    if (d.leadExternalId) {
      leadHasAnyDeal.add(d.leadExternalId);
      if (d.status === 'won' && d.leadExternalId) leadHasWon.add(d.leadExternalId);
    }
  }
  for (const lead of leads) {
    if (leadHasWon.has(lead.leadExternalId)) lead.status = 'converted';
    else if (leadHasAnyDeal.has(lead.leadExternalId)) lead.status = 'qualified';
    else lead.status = 'new';
  }

  // Customers + invoices + payments (deal -> invoice -> payment)
  // We only create invoices for won deals to keep funnel chain clean.
  const transactions: Omit<Transaction, 'id' | 'companyId'>[] = [];
  const expensesCategories = ['Услуги', 'Аренда', 'Зарплата', 'Коммунальные', 'Логистика', 'IT'];
  const counterparties = ['ТОО "Алматы Трейд"', 'ИП Касымов', 'ТОО "ТехноПарк"', 'АО "КазМунайГаз"', 'ТОО "Астана Логистик"'];

  const customerPoolForRepeats = () => Array.from(customerByExternalId.values());

  for (const d of deals) {
    if (d.status !== 'won') continue;
    const dealCh = channelTemplates.find((x) => x.channelCampaignExternalId === (() => {
      const leadDraft = leads.find((l) => l.leadExternalId === d.leadExternalId);
      return leadDraft?.channelCampaignExternalId;
    })());

    // If we can't find channel, still skip invoices.
    if (!dealCh) continue;

    // Customer assignment: mix new and repeat customers.
    const repeatProb = 0.25 + (dealCh.quality * 0.15); // better channels bring some repeat too
    const canRepeat = customerPoolForRepeats();
    const chooseRepeat = rng() < repeatProb && canRepeat.length > 0;

    let customer: Omit<Customer, 'id' | 'companyId'> | undefined;
    if (chooseRepeat) {
      customer = pick(rng, canRepeat);
    } else {
      const externalId = createCustomerExternalId(nextCustomerSeq);
      nextCustomerSeq++;
      const name = pick(rng, moreCustomerNames);
      const segment = pick(rng, segments);
      const startDate = d._createdAt;
      customer = {
        customerExternalId: externalId,
        name,
        segment,
        startDate: toISODate(startDate),
      };
      customers.push(customer);
      customerByExternalId.set(externalId, customer);
    }

    // Ensure due/paid attribution will have a valid name for transactions.
    if (customer && d.customerExternalId === undefined) {
      d.customerExternalId = customer.customerExternalId;
    }

    const wonDate = d.wonDate ? new Date(d.wonDate + 'T00:00:00Z') : d._createdAt;
    const invoiceDate = addDays(wonDate, randInt(rng, 0, 14));

    // Payment terms: typical SMB 30-60 days
    const paymentTermDays = randInt(rng, 28, 62);
    const dueDate = addDays(invoiceDate, paymentTermDays);

    const invoiceValueBase = dealCh.valueBase * (0.75 + rng() * 0.7);
    const invoiceAmount = Math.max(120000, roundTo(invoiceValueBase, dealValueStep));

    const invoiceExternalId = `INV${String(invoiceSeq).padStart(6, '0')}`;
    invoiceSeq++;

    // Payment scenarios depend on channel quality.
    const quality = dealCh.quality;
    const dueIsPast = isBefore(dueDate, todayMid);

    const wOnTimeFull = 1.0 + quality * 2.0; // higher quality => more full on-time
    const wLateFull = 0.9 + quality * 1.1;
    const wPartial = 0.9 + (1 - quality) * 1.4;
    const wUnpaid = 0.8 + (1 - quality) * 2.3;

    let wSum = wOnTimeFull + wLateFull + wPartial + wUnpaid;
    if (wSum <= 0) wSum = 1;

    const pickR = rng() * wSum;
    let scenario: 'on_time_full' | 'late_full' | 'partial' | 'unpaid';
    if (pickR < wOnTimeFull) scenario = 'on_time_full';
    else if (pickR < wOnTimeFull + wLateFull) scenario = 'late_full';
    else if (pickR < wOnTimeFull + wLateFull + wPartial) scenario = 'partial';
    else scenario = 'unpaid';

    let status: Invoice['status'] = 'unpaid';
    let paidDate: string | undefined = undefined;

    let paidSum = 0;
    let lastPaymentDate: Date | undefined = undefined;

    const pushPayment = (amount: number, paymentDate: Date) => {
      const amt = roundTo(amount, 100);
      if (amt <= 0) return;
      paidSum += amt;
      lastPaymentDate = paymentDate;

      payments.push({
        paymentExternalId: `PAY${String(paymentSeq).padStart(6, '0')}`,
        invoiceExternalId,
        paymentDate: toISODate(paymentDate),
        amount: amt,
      });
      paymentSeq++;

      // Also generate income transactions for the existing dashboard.
      if (customer) {
        transactions.push({
          date: toISODate(paymentDate),
          amount: amt,
          direction: 'income',
          category: 'Продажи',
          counterparty: customer.name,
          description: 'Оплата по счету',
        });
      }
    };

    if (scenario === 'on_time_full') {
      // Pay within/near due date.
      const offsetDays = randInt(rng, -5, 7);
      const paymentDate = addDays(dueDate, offsetDays);
      const clamped = isBefore(paymentDate, invoiceDate) ? invoiceDate : paymentDate;
      pushPayment(invoiceAmount, clamped);
      status = 'paid';
      paidDate = toISODate(lastPaymentDate ?? clamped);
    } else if (scenario === 'late_full') {
      const offsetDays = randInt(rng, 15, 45);
      const paymentDate = addDays(dueDate, offsetDays);
      const clamped = isBefore(paymentDate, invoiceDate) ? addDays(invoiceDate, 1) : paymentDate;
      const capped = isBefore(todayMid, clamped) ? todayMid : clamped;
      pushPayment(invoiceAmount, capped);
      status = 'paid';
      paidDate = toISODate(lastPaymentDate ?? capped);
    } else if (scenario === 'partial') {
      const firstFraction = randFloat(rng, 0.3, 0.75);
      const firstAmount = roundTo(invoiceAmount * firstFraction, 100);

      // First payment around due date +/- some days.
      const firstOffsetMin = dueIsPast ? -randInt(rng, 0, 12) : -randInt(rng, 0, 4);
      const firstOffsetMax = dueIsPast ? randInt(rng, 0, 10) : randInt(rng, 0, 10);
      const firstOffset = randInt(rng, firstOffsetMin, firstOffsetMax);
      const firstDate = addDays(dueDate, firstOffset);
      const firstClamped = isBefore(firstDate, invoiceDate) ? addDays(invoiceDate, 1) : firstDate;
      const firstCapped = isBefore(todayMid, firstClamped) ? todayMid : firstClamped;
      pushPayment(firstAmount, firstCapped);

      const remaining = Math.max(0, invoiceAmount - paidSum);
      if (remaining > 0) {
        const payRemainderChance = dueIsPast
          ? 0.35 + quality * 0.35
          : 0.55 + quality * 0.25;

        if (rng() < payRemainderChance) {
          // Pay remainder after due date.
          const secondOffset = randInt(rng, 5, dueIsPast ? 40 : 25);
          const secondDate = addDays(dueDate, secondOffset);
          const secondClamped = isBefore(secondDate, invoiceDate) ? addDays(invoiceDate, 2) : secondDate;
          const secondCapped = isBefore(todayMid, secondClamped) ? todayMid : secondClamped;
          pushPayment(remaining, secondCapped);

          if (paidSum >= invoiceAmount - 100) {
            status = 'paid';
            paidDate = toISODate(lastPaymentDate ?? secondCapped);
          }
        }
      }
    } else if (scenario === 'unpaid') {
      // Usually no payments. Sometimes a tiny partial already happened.
      const hasSmallPartial = dueIsPast ? rng() < 0.4 : rng() < 0.2;
      if (hasSmallPartial) {
        const fraction = randFloat(rng, 0.05, 0.2);
        const smallAmt = roundTo(invoiceAmount * fraction, 100);
        const offset = dueIsPast ? -randInt(rng, 0, 10) : randInt(rng, 0, 18);
        const d2 = addDays(dueDate, offset);
        const clamped = isBefore(d2, invoiceDate) ? addDays(invoiceDate, 1) : d2;
        const capped = isBefore(todayMid, clamped) ? todayMid : clamped;
        pushPayment(smallAmt, capped);
      }
    }

    // Determine invoice status and paidDate.
    if (paidSum >= invoiceAmount - 100 && status !== 'paid') {
      status = 'paid';
      paidDate = toISODate(lastPaymentDate ?? dueDate);
    }

    // Set paidDate for partial/unpaid if there were some payments.
    if (paidDate === undefined && lastPaymentDate) {
      paidDate = toISODate(lastPaymentDate);
    }

    invoices.push({
      invoiceDate: toISODate(invoiceDate),
      customerExternalId: customer?.customerExternalId ?? 'C001',
      amount: invoiceAmount,
      status,
      paidDate,
      dueDate: toISODate(dueDate),
      dealExternalId: d.dealExternalId,
      invoiceExternalId,
    });
  }

  // Add expenses transactions to keep current charts/signal engine active.
  const expensesTxns: Omit<Transaction, 'id' | 'companyId'>[] = [];
  for (let monthIdx = 0; monthIdx < monthDates.length; monthIdx++) {
    const monthDate = monthDates[monthIdx];
    const monthKey = toMonthKey(monthDate);
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();

    const numExpenses = randInt(rng, 6, 11);
    for (let i = 0; i < numExpenses; i++) {
      const day = randInt(rng, 1, Math.max(1, daysInMonth));
      const d = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);

      const category = pick(rng, expensesCategories);
      const volatility = 0.85 + monthIdx * 0.01 + rng() * 0.25;
      const base = 140000 + rng() * 520000;
      const amount = roundTo(base * volatility, 100);

      expensesTxns.push({
        date: toISODate(d),
        amount: Math.max(50000, amount),
        direction: 'expense',
        category,
        counterparty: pick(rng, counterparties),
        description: 'Расход по счёту',
      });
    }
  }

  // Merge income transactions (payments) + expenses.
  // (transactions already contains income created during payment generation)
  transactions.push(...expensesTxns);

  // Convert deals array to persisted shape (remove internal draft fields).
  const persistedDeals: Omit<Deal, 'id' | 'companyId'>[] = deals.map((d) => {
    const {
      _createdAt: _,
      _expectedCloseDate: __,
      _statusResolvedAt: ___,
      ...rest
    } = d;
    return rest;
  });

  const persistedLeads: Omit<Lead, 'id' | 'companyId'>[] = leads.map((l) => {
    const { _createdAt: _, _monthIdx: __, ...rest } = l;
    return rest;
  });

  return {
    managers,
    channelCampaigns,
    customers,
    leads: persistedLeads,
    deals: persistedDeals,
    invoices,
    payments,
    marketingSpend,
    transactions,
  };
}

