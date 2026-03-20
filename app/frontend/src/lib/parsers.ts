// ============================================================
// BizPulse KZ — File Parsing Utilities
// ============================================================

import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type {
  FileType, ValidationError,
  ParsedTransactionRow, ParsedCustomerRow,
  ParsedInvoiceRow, ParsedMarketingSpendRow,
  ParsedLeadRow, ParsedDealRow, ParsedPaymentRow,
  ParsedChannelCampaignRow, ParsedManagerRow,
  ParsedContentMetricRow,
} from './types';
import { normalizeCustomerExternalId, normalizeLeadExternalId, normalizeReferenceId } from './idNormalization';

export type ParsedRow =
  | ParsedTransactionRow
  | ParsedCustomerRow
  | ParsedInvoiceRow
  | ParsedMarketingSpendRow
  | ParsedLeadRow
  | ParsedDealRow
  | ParsedPaymentRow
  | ParsedChannelCampaignRow
  | ParsedManagerRow
  | ParsedContentMetricRow;

export interface ParseResult {
  rows: ParsedRow[];
  errors: ValidationError[];
  warnings?: { row: number; field: string; message: string }[];
  preview: Record<string, unknown>[];
  totalRows: number;
}

export interface AutoParseResult extends ParseResult {
  detectedFileType: FileType;
  confidence: number;
}

// --- Read file to array of objects ---
async function fileToRows(file: File): Promise<Record<string, unknown>[]> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (result) => resolve(result.data as Record<string, unknown>[]),
        error: (err: Error) => reject(err),
      });
    });
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }

  throw new Error(`Неподдерживаемый формат файла: .${ext}`);
}

// --- Validators ---
function isValidDate(val: unknown): boolean {
  if (!val) return false;
  if (val instanceof Date) return !isNaN(val.getTime());
  if (typeof val === 'number') return val > 20000 && val < 90000;
  const str = String(val);
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(Date.parse(str));
}

function excelSerialToDateString(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const dt = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString().split('T')[0];
}

function toDateString(val: unknown): string {
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
    const converted = excelSerialToDateString(val);
    if (converted) return converted;
  }
  return String(val);
}

function isValidMonth(val: unknown): boolean {
  if (!val) return false;
  return /^\d{4}-\d{2}$/.test(String(val));
}

function isPositiveNumber(val: unknown): boolean {
  const n = Number(val);
  return !isNaN(n) && n > 0;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-().]/g, '');
}

function getRowValueByNormalizedKey(row: Record<string, unknown>, candidates: string[]): unknown {
  const normalizedCandidates = candidates.map((c) => normalizeKey(c));
  for (const [key, value] of Object.entries(row)) {
    if (normalizedCandidates.includes(normalizeKey(key))) {
      return value;
    }
  }
  return undefined;
}

const FIELD_ALIASES: Record<FileType, Record<string, string[]>> = {
  transactions: {
    date: ['date', 'дата', 'operationdate', 'transactiondate'],
    amount: ['amount', 'sum', 'value', 'total', 'сумма'],
    direction: ['direction', 'type', 'flow', 'направление', 'операция'],
    category: ['category', 'категория', 'article'],
    counterparty: ['counterparty', 'partner', 'контрагент'],
    description: ['description', 'comment', 'назначение', 'описание'],
    customerExternalId: ['customerexternalid', 'customerid', 'clientid', 'idклиента'],
  },
  customers: {
    customerExternalId: ['customerexternalid', 'customerid', 'clientid', 'idклиента'],
    name: ['name', 'customername', 'clientname', 'клиент', 'название'],
    segment: ['segment', 'type', 'сегмент'],
    startDate: ['startdate', 'registeredat', 'датарегистрации'],
  },
  invoices: {
    invoiceDate: ['invoicedate', 'date', 'дата', 'датасчета'],
    customerExternalId: ['customerexternalid', 'customerid', 'clientid', 'idклиента', 'номертелефона', 'phone', 'телефон'],
    amount: ['amount', 'sum', 'value', 'сумма', 'стоимость', 'суммаоплаты', 'общаястоимость'],
    status: ['status', 'state', 'статус', 'остаток'],
    paidDate: [
      'paiddate',
      'paymentdate',
      'датаоплаты',
      'датадоплаты',
      'датапоплаты',
      'датапредоплаты',
      'фактическаядатаоплаты',
      'когдаоплачен',
    ],
    dueDate: [
      'duedate',
      'duedatepayment',
      'paymentduedate',
      'dateofduedate',
      'дедлайн',
      'дедлайни',
      'датаистечения14дней',
      'срокоплаты',
      'срок',
      'deadline',
    ],
    dealExternalId: ['dealexternalid', 'dealid', 'idсделки', 'iddeal', '№', 'номер'],
    invoiceExternalId: ['invoiceexternalid', 'invoiceid', 'invoicenumber', 'number', 'idсчета', 'idscheta', '№', 'номер'],
  },
  marketing_spend: {
    month: ['month', 'period', 'месяц'],
    amount: ['amount', 'sum', 'value', 'сумма'],
    channelCampaignExternalId: [
      'channelcampaignexternalid',
      'channelcampaignid',
      'campaignexternalid',
      'channelexternalid',
      'sourceexternalid',
      'sourceid',
      'idsource',
    ],
  },
  leads: {
    leadExternalId: ['leadexternalid', 'leadid', 'idлида', 'idlead', 'lead_id'],
    name: ['name', 'leadname', 'lead', 'имя', 'название'],
    channelCampaignExternalId: [
      'channelcampaignexternalid',
      'channelcampaignid',
      'campaignexternalid',
      'channelexternalid',
      'sourceexternalid',
      'sourceid',
    ],
    managerExternalId: ['managerexternalid', 'managerid', 'salesrepid', 'repid', 'idменеджера'],
    createdDate: ['createddate', 'leaddate', 'date', 'дата', 'датасоздания'],
    status: ['status', 'state', 'статус', 'stage', 'этап'],
  },
  deals: {
    dealExternalId: ['dealexternalid', 'dealid', 'idсделки', 'iddeal', 'deal_id', '№', 'номер'],
    leadExternalId: ['leadexternalid', 'leadid', 'idлида', 'idlead', 'lead_id'],
    customerExternalId: ['customerexternalid', 'customerid', 'clientid', 'idклиента', 'номертелефона', 'phone', 'телефон'],
    managerExternalId: ['managerexternalid', 'managerid', 'salesrepid', 'repid', 'idменеджера', 'менеджер', 'оп'],
    createdDate: ['createddate', 'dealdate', 'date', 'дата', 'датасделки'],
    expectedCloseDate: ['expectedclosedate', 'closeexpecteddate', 'closedate', 'expectedclose', 'ожидаемаядата'],
    lastActivityDate: ['lastactivitydate', 'activitydate', 'lastactivity', 'lastupdated', 'последняяактивность'],
    status: ['status', 'state', 'статус', 'stage', 'этап', 'результат', 'исход'],
    wonDate: ['wondate', 'dealwon', 'closedwon', 'датаwon', 'датаокончания', 'датадоплаты'],
    lostReason: ['lostreason', 'lossreason', 'причина', 'причинаотказа', 'комментарий', 'почемуотказ'],
    lostDate: ['lostdate', 'датапотери', 'датапроигрыша'],
    lostStage: ['loststage', 'этаппотери', 'стадияотказа', 'точкапотери'],
  },
  payments: {
    invoiceExternalId: ['invoiceexternalid', 'invoiceid', 'invoicenumber', 'number', 'idсчета', 'idscheta', '№', 'номер'],
    paymentDate: ['paymentdate', 'date', 'оплата', 'payment', 'дата'],
    amount: ['amount', 'sum', 'value', 'total', 'сумма', 'суммаоплаты'],
    paymentExternalId: ['paymentexternalid', 'paymentid', 'idплатежа', 'transactionid', 'txnid'],
  },
  channels_campaigns: {
    channelCampaignExternalId: [
      'channelcampaignexternalid',
      'channelcampaignid',
      'sourceexternalid',
      'sourceid',
      'idисточника',
      'campaignid',
      'channelexternalid',
    ],
    name: ['name', 'title', 'название', 'source', 'channelcampaign'],
    channelName: ['channelname', 'channel', 'канал'],
    campaignName: ['campaignname', 'campaign', 'кампания'],
  },
  managers: {
    managerExternalId: ['managerexternalid', 'managerid', 'salesrepid', 'repid', 'idменеджера'],
    name: ['name', 'fullname', 'менеджер', 'имя', 'rep', 'salesrep'],
  },
  content_metrics: {
    contentId: ['contentid', 'post_id', 'id', 'content_id', 'idпоста'],
    platform: ['platform', 'network', 'social', 'платформа', 'соцсеть'],
    contentTitle: ['contenttitle', 'title', 'caption', 'text', 'заголовок'],
    publishedAt: ['publishedat', 'date', 'published', 'posted', 'дата'],
    impressions: ['impressions', 'views', 'показы'],
    reach: ['reach', 'охват'],
    profileVisits: ['profilevisits', 'profile_visits', 'визиты'],
    likes: ['likes', 'like', 'лайки'],
    comments: ['comments', 'комментарии'],
    saves: ['saves', 'bookmarks', 'сохранения'],
    shares: ['shares', 'reposts', 'репосты'],
    inboundMessages: ['inboundmessages', 'messages', 'dms', 'сообщения'],
    leadsGenerated: ['leadsgenerated', 'leads', 'лиды'],
    dealsGenerated: ['dealsgenerated', 'deals', 'сделки'],
    paidConversions: ['paidconversions', 'conversions', 'paid', 'оплаты'],
    channelCampaignExternalId: ['channelcampaignexternalid', 'channel', 'source', 'канал'],
  },
};

function normalizeRowsForType(rows: Record<string, unknown>[], fileType: FileType): Record<string, unknown>[] {
  const aliases = FIELD_ALIASES[fileType];

  return rows.map((row) => {
    const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeKey(key), value] as const);
    const normalizedMap = new Map<string, unknown>(normalizedEntries);
    const mapped: Record<string, unknown> = {};

    for (const [canonicalField, candidates] of Object.entries(aliases)) {
      const allCandidates = [canonicalField, ...candidates].map(normalizeKey);
      for (const candidate of allCandidates) {
        if (normalizedMap.has(candidate)) {
          mapped[canonicalField] = normalizedMap.get(candidate);
          break;
        }
      }
    }

    return { ...row, ...mapped };
  });
}

/** Add calendar days to YYYY-MM-DD (local date; stable for business deadlines). */
function addDaysToYmd(ymd: string, days: number): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return undefined;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function resolveInvoicePaidDateYmd(
  row: Record<string, unknown>,
  invoiceYmd: string,
  status: 'paid' | 'unpaid',
): string | undefined {
  if (row.paidDate && isValidDate(row.paidDate)) return toDateString(row.paidDate);
  const alt = getRowValueByNormalizedKey(row, [
    'paidDate',
    'payment date',
    'дата оплаты',
    'дата доплаты',
    'дата предоплаты',
    'фактическая дата оплаты',
    'когда оплачен',
  ]);
  if (alt != null && alt !== '' && isValidDate(alt)) return toDateString(alt);
  if (status === 'paid') return invoiceYmd;
  return undefined;
}

function resolveInvoiceDueDateYmd(row: Record<string, unknown>, invoiceYmd: string): string | undefined {
  if (row.dueDate && isValidDate(row.dueDate)) return toDateString(row.dueDate);
  const alt = getRowValueByNormalizedKey(row, [
    'dueDate',
    'due date',
    'срок оплаты',
    'срок',
    'дедлайн',
    'дата истечения 14 дней',
    'истечение 14 дней',
    'deadline',
  ]);
  if (alt != null && alt !== '' && isValidDate(alt)) return toDateString(alt);
  return addDaysToYmd(invoiceYmd, 14);
}

// --- Parse by file type ---
function parseTransactions(rows: Record<string, unknown>[]): ParseResult {
  const parsed: ParsedTransactionRow[] = [];
  const errors: ValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 for header + 1-based

    if (!isValidDate(row.date)) {
      errors.push({ row: rowNum, field: 'date', message: 'Неверный формат даты (ожидается YYYY-MM-DD)' });
      continue;
    }
    if (!isPositiveNumber(row.amount)) {
      errors.push({ row: rowNum, field: 'amount', message: 'Сумма должна быть положительным числом' });
      continue;
    }
    const dir = String(row.direction).toLowerCase();
    if (dir !== 'income' && dir !== 'expense') {
      errors.push({ row: rowNum, field: 'direction', message: 'Направление должно быть "income" или "expense"' });
      continue;
    }
    if (!row.category || String(row.category).trim() === '') {
      errors.push({ row: rowNum, field: 'category', message: 'Категория обязательна' });
      continue;
    }

    parsed.push({
      date: toDateString(row.date),
      amount: Number(row.amount),
      direction: dir as 'income' | 'expense',
      category: String(row.category).trim(),
      counterparty: row.counterparty ? String(row.counterparty).trim() : undefined,
      description: row.description ? String(row.description).trim() : undefined,
      customerExternalId: row.customerExternalId ? String(row.customerExternalId).trim() : undefined,
    });
  }

  return { rows: parsed, errors, preview: rows.slice(0, 20), totalRows: rows.length };
}

function parseCustomers(rows: Record<string, unknown>[]): ParseResult {
  const parsed: ParsedCustomerRow[] = [];
  const errors: ValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    if (!row.customerExternalId || String(row.customerExternalId).trim() === '') {
      errors.push({ row: rowNum, field: 'customerExternalId', message: 'ID клиента обязателен' });
      continue;
    }
    if (!row.name || String(row.name).trim() === '') {
      errors.push({ row: rowNum, field: 'name', message: 'Имя клиента обязательно' });
      continue;
    }

    parsed.push({
      customerExternalId: normalizeCustomerExternalId(row.customerExternalId) ?? String(row.customerExternalId).trim(),
      name: String(row.name).trim(),
      segment: row.segment ? String(row.segment).trim() : undefined,
      startDate: row.startDate && isValidDate(row.startDate) ? toDateString(row.startDate) : undefined,
    });
  }

  return { rows: parsed, errors, preview: rows.slice(0, 20), totalRows: rows.length };
}

function parseInvoices(rows: Record<string, unknown>[]): ParseResult {
  const parsed: ParsedInvoiceRow[] = [];
  const errors: ValidationError[] = [];
  const warnings: { row: number; field: string; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const customerExternalId = normalizeCustomerExternalId(row.customerExternalId) ?? '';

    if (!isValidDate(row.invoiceDate)) {
      errors.push({ row: rowNum, field: 'invoiceDate', message: 'Неверный формат даты счёта' });
      continue;
    }
    if (!isPositiveNumber(row.amount)) {
      errors.push({ row: rowNum, field: 'amount', message: 'Сумма должна быть положительным числом' });
      continue;
    }
    let status = String(row.status ?? '').toLowerCase().trim();
    if (status !== 'paid' && status !== 'unpaid') {
      if (status.includes('опла') || status.includes('paid')) {
        status = 'paid';
      } else if (status.includes('неопла') || status.includes('unpaid')) {
        status = 'unpaid';
      }
    }
    if (status !== 'paid' && status !== 'unpaid') {
      const statusNum = Number(row.status);
      if (!Number.isNaN(statusNum)) {
        status = statusNum <= 0 ? 'paid' : 'unpaid';
      } else {
        status = 'unpaid';
      }
    }

    const st = status as 'paid' | 'unpaid';
    const invoiceYmd = toDateString(row.invoiceDate);
    const paidYmd = resolveInvoicePaidDateYmd(row, invoiceYmd, st);
    const dueYmd = resolveInvoiceDueDateYmd(row, invoiceYmd);

    parsed.push({
      invoiceDate: invoiceYmd,
      customerExternalId: customerExternalId || `unknown_customer_${rowNum}`,
      amount: Number(row.amount),
      status: st,
      paidDate: paidYmd,
      dueDate: dueYmd,
      dealExternalId: normalizeReferenceId(row.dealExternalId),
      invoiceExternalId: normalizeReferenceId(row.invoiceExternalId),
    });

    // Relational / MVP warnings (non-blocking for compatibility)
    const computedInvoiceExternalId =
      row.invoiceExternalId ? String(row.invoiceExternalId).trim() : undefined;

    if (!dueYmd) {
      warnings.push({
        row: rowNum,
        field: 'dueDate',
        message: 'Нет due date: метрики “ожидаемый приток/просрочка” будут неполными.',
      });
    }
    if (!customerExternalId) {
      warnings.push({
        row: rowNum,
        field: 'customerExternalId',
        message: 'Нет customerExternalId: запись загружена с техническим ID, сводка по клиенту может быть неполной.',
      });
    }
    if (!computedInvoiceExternalId) {
      warnings.push({
        row: rowNum,
        field: 'invoiceExternalId',
        message: 'Нет invoiceExternalId: связать платежи будет сложнее.',
      });
    }
    if (status === 'paid' && !paidYmd) {
      warnings.push({
        row: rowNum,
        field: 'paidDate',
        message: 'Счёт помечен как paid, но paidDate не указан. Уточните дату оплаты.',
      });
    }
  }

  return { rows: parsed, errors, warnings: warnings.length > 0 ? warnings : undefined, preview: rows.slice(0, 20), totalRows: rows.length };
}

function parseMarketingSpend(rows: Record<string, unknown>[]): ParseResult {
  const parsed: ParsedMarketingSpendRow[] = [];
  const errors: ValidationError[] = [];
  const warnings: { row: number; field: string; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    if (!isValidMonth(row.month)) {
      errors.push({ row: rowNum, field: 'month', message: 'Неверный формат месяца (ожидается YYYY-MM)' });
      continue;
    }
    if (!isPositiveNumber(row.amount)) {
      errors.push({ row: rowNum, field: 'amount', message: 'Сумма должна быть положительным числом' });
      continue;
    }

    parsed.push({
      month: String(row.month),
      amount: Number(row.amount),
      channelCampaignExternalId: normalizeReferenceId(row.channelCampaignExternalId),
    });

    if (!row.channelCampaignExternalId || String(row.channelCampaignExternalId).trim() === '') {
      warnings.push({
        row: rowNum,
        field: 'channelCampaignExternalId',
        message: 'Нет связки с каналом/кампанией: CAC/CPL/атрибуция по источникам будут неполными.',
      });
    }
  }

  return { rows: parsed, errors, warnings: warnings.length > 0 ? warnings : undefined, preview: rows.slice(0, 20), totalRows: rows.length };
}

function parseLeads(rows: Record<string, unknown>[]): ParseResult {
  const parsed: ParsedLeadRow[] = [];
  const errors: ValidationError[] = [];
  const warnings: { row: number; field: string; message: string }[] = [];

  const allowedStatuses = new Set(['new', 'qualified', 'converted', 'lost']);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    if (!row.leadExternalId || String(row.leadExternalId).trim() === '') {
      errors.push({ row: rowNum, field: 'leadExternalId', message: 'ID лида обязателен' });
      continue;
    }

    if (row.createdDate && !isValidDate(row.createdDate)) {
      errors.push({ row: rowNum, field: 'createdDate', message: 'Неверный формат даты (ожидается YYYY-MM-DD)' });
      continue;
    }

    let status: string | undefined = undefined;
    if (row.status !== undefined && row.status !== null && String(row.status).trim() !== '') {
      status = String(row.status).toLowerCase();
      if (!allowedStatuses.has(status)) {
        errors.push({ row: rowNum, field: 'status', message: 'Статус должен быть одним из: new, qualified, converted, lost' });
        continue;
      }
    }

    const computedChannelCampaignExternalId = normalizeReferenceId(row.channelCampaignExternalId);
    parsed.push({
      leadExternalId: normalizeLeadExternalId(row.leadExternalId) ?? String(row.leadExternalId).trim(),
      name: row.name ? String(row.name).trim() : undefined,
      channelCampaignExternalId: computedChannelCampaignExternalId,
      managerExternalId: normalizeReferenceId(row.managerExternalId),
      createdDate: row.createdDate && isValidDate(row.createdDate) ? toDateString(row.createdDate) : undefined,
      status: status as ParsedLeadRow['status'] | undefined,
    });

    if (!computedChannelCampaignExternalId) {
      warnings.push({
        row: rowNum,
        field: 'channelCampaignExternalId',
        message: 'Нет источника (канал/кампания): атрибуция выручки по источникам будет неполной.',
      });
    }
  }

  return { rows: parsed, errors, warnings: warnings.length > 0 ? warnings : undefined, preview: rows.slice(0, 20), totalRows: rows.length };
}

function parseDeals(rows: Record<string, unknown>[]): ParseResult {
  const parsed: ParsedDealRow[] = [];
  const errors: ValidationError[] = [];
  const warnings: { row: number; field: string; message: string }[] = [];

  const allowedStatuses = new Set(['open', 'won', 'lost']);

  const normalizeDealStatus = (value: unknown): ParsedDealRow['status'] | undefined => {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return undefined;
    if (allowedStatuses.has(raw)) return raw as ParsedDealRow['status'];

    if (
      raw.includes('won') ||
      raw.includes('оплат') ||
      raw.includes('успеш') ||
      raw.includes('закрыт') ||
      raw.includes('продан')
    ) {
      return 'won';
    }
    if (
      raw.includes('lost') ||
      raw.includes('отказ') ||
      raw.includes('не куп') ||
      raw.includes('нецел') ||
      raw.includes('проиг')
    ) {
      return 'lost';
    }
    if (raw.includes('open') || raw.includes('работ') || raw.includes('в работе') || raw.includes('нов')) {
      return 'open';
    }
    return undefined;
  };

  const normalizeLostReason = (value: unknown): ParsedDealRow['lostReason'] | undefined => {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return undefined;
    if (raw.includes('цена') || raw.includes('дорог')) return 'price';
    if (raw.includes('нет ответ') || raw.includes('не отвечает') || raw.includes('игнор')) return 'no_response';
    if (raw.includes('не акту') || raw.includes('не нуж') || raw.includes('неинтерес')) return 'not_relevant';
    if (raw.includes('конкур')) return 'competitor';
    if (raw.includes('позже') || raw.includes('не вовремя') || raw.includes('тайм') || raw.includes('timing')) return 'timing';
    return 'other';
  };

  const normalizeLostStage = (value: unknown): string | undefined => {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return undefined;
    if (raw.includes('перв') || raw.includes('контакт') || raw.includes('lead')) return 'lead_to_deal';
    if (raw.includes('сделк') || raw.includes('переговор') || raw.includes('deal')) return 'deal_to_won';
    if (raw.includes('оплат') || raw.includes('счет') || raw.includes('инвойс') || raw.includes('paid')) return 'won_to_paid';
    return String(value).trim();
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    if (!row.dealExternalId || String(row.dealExternalId).trim() === '') {
      errors.push({ row: rowNum, field: 'dealExternalId', message: 'ID сделки обязателен' });
      continue;
    }
    const normalizedDealId = normalizeReferenceId(row.dealExternalId);
    if (!normalizedDealId) {
      errors.push({ row: rowNum, field: 'dealExternalId', message: 'ID сделки пустой после нормализации' });
      continue;
    }

    if (row.createdDate && !isValidDate(row.createdDate)) {
      errors.push({ row: rowNum, field: 'createdDate', message: 'Неверный формат даты (ожидается YYYY-MM-DD)' });
      continue;
    }
    if (row.expectedCloseDate && !isValidDate(row.expectedCloseDate)) {
      errors.push({ row: rowNum, field: 'expectedCloseDate', message: 'Неверный формат ожидаемой даты (ожидается YYYY-MM-DD)' });
      continue;
    }
    if (row.lastActivityDate && !isValidDate(row.lastActivityDate)) {
      errors.push({ row: rowNum, field: 'lastActivityDate', message: 'Неверный формат даты активности (ожидается YYYY-MM-DD)' });
      continue;
    }
    if (row.wonDate && !isValidDate(row.wonDate)) {
      errors.push({ row: rowNum, field: 'wonDate', message: 'Неверный формат даты won (ожидается YYYY-MM-DD)' });
      continue;
    }

    const rawPaymentAmount = getRowValueByNormalizedKey(row, ['сумма оплаты', 'sum_paid', 'payment_amount', 'paid_amount']);
    const numericPaymentAmount = Number(rawPaymentAmount);
    const normalizedStatus = normalizeDealStatus(row.status);
    const normalizedLostReason = normalizeLostReason(row.lostReason);
    const normalizedLostStage = normalizeLostStage(row.lostStage);

    let status: ParsedDealRow['status'] | undefined = normalizedStatus;
    if (!status) {
      if (normalizedLostReason) status = 'lost';
      else if (row.wonDate || (!Number.isNaN(numericPaymentAmount) && numericPaymentAmount > 0)) status = 'won';
      else status = 'open';
    }

    const customerExternalId = normalizeCustomerExternalId(row.customerExternalId);
    let computedLeadExternalId = normalizeLeadExternalId(row.leadExternalId);
    if (!computedLeadExternalId && customerExternalId?.startsWith('phone:')) {
      computedLeadExternalId = customerExternalId;
    }
    const computedWonDate = row.wonDate && isValidDate(row.wonDate) ? toDateString(row.wonDate) : undefined;
    const computedLostDate = row.lostDate && isValidDate(row.lostDate) ? toDateString(row.lostDate) : undefined;
    const managerExternalId = normalizeReferenceId(row.managerExternalId);

    parsed.push({
      dealExternalId: normalizedDealId,
      leadExternalId: computedLeadExternalId,
      customerExternalId,
      managerExternalId,
      createdDate: row.createdDate && isValidDate(row.createdDate) ? toDateString(row.createdDate) : undefined,
      expectedCloseDate: row.expectedCloseDate && isValidDate(row.expectedCloseDate) ? toDateString(row.expectedCloseDate) : undefined,
      lastActivityDate: row.lastActivityDate && isValidDate(row.lastActivityDate) ? toDateString(row.lastActivityDate) : undefined,
      status,
      wonDate: computedWonDate,
      lostDate: status === 'lost' ? (computedLostDate ?? (row.createdDate && isValidDate(row.createdDate) ? toDateString(row.createdDate) : undefined)) : undefined,
      lostReason: status === 'lost' ? (normalizedLostReason ?? 'other') : undefined,
      lostStage: status === 'lost' ? (normalizedLostStage ?? 'deal_to_won') : undefined,
    });

    if (status === 'won' && !computedWonDate) {
      warnings.push({
        row: rowNum,
        field: 'wonDate',
        message: 'Сделка помечена как won, но wonDate не указан.',
      });
    }
    if (status === 'lost' && !normalizedLostReason) {
      warnings.push({
        row: rowNum,
        field: 'lostReason',
        message: 'Сделка помечена как lost, но причина не распознана. Проставлено "other".',
      });
    }
    if (!computedLeadExternalId) {
      warnings.push({
        row: rowNum,
        field: 'leadExternalId',
        message: 'Нет связки со лидом: воронка “канал/кампания → лид → сделка” будет неполной.',
      });
    }
  }

  return { rows: parsed, errors, warnings: warnings.length > 0 ? warnings : undefined, preview: rows.slice(0, 20), totalRows: rows.length };
}

function parsePayments(rows: Record<string, unknown>[]): ParseResult {
  const parsed: ParsedPaymentRow[] = [];
  const errors: ValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    if (!row.invoiceExternalId || String(row.invoiceExternalId).trim() === '') {
      errors.push({ row: rowNum, field: 'invoiceExternalId', message: 'ID счёта (invoiceExternalId) обязателен' });
      continue;
    }
    if (!row.paymentDate || !isValidDate(row.paymentDate)) {
      errors.push({ row: rowNum, field: 'paymentDate', message: 'Неверный формат даты оплаты (ожидается YYYY-MM-DD)' });
      continue;
    }
    if (!isPositiveNumber(row.amount)) {
      errors.push({ row: rowNum, field: 'amount', message: 'Сумма должна быть положительным числом' });
      continue;
    }

    parsed.push({
      paymentExternalId: normalizeReferenceId(row.paymentExternalId),
      invoiceExternalId: normalizeReferenceId(row.invoiceExternalId) ?? String(row.invoiceExternalId).trim(),
      paymentDate: toDateString(row.paymentDate),
      amount: Number(row.amount),
    });
  }

  return { rows: parsed, errors, preview: rows.slice(0, 20), totalRows: rows.length };
}

function parseChannelsCampaigns(rows: Record<string, unknown>[]): ParseResult {
  const parsed: ParsedChannelCampaignRow[] = [];
  const errors: ValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    if (!row.channelCampaignExternalId || String(row.channelCampaignExternalId).trim() === '') {
      errors.push({ row: rowNum, field: 'channelCampaignExternalId', message: 'ID источника/кампании обязателен' });
      continue;
    }
    if (!row.name || String(row.name).trim() === '') {
      errors.push({ row: rowNum, field: 'name', message: 'Название обязательно' });
      continue;
    }

    parsed.push({
      channelCampaignExternalId: normalizeReferenceId(row.channelCampaignExternalId) ?? String(row.channelCampaignExternalId).trim(),
      name: String(row.name).trim(),
      channelName: row.channelName ? String(row.channelName).trim() : undefined,
      campaignName: row.campaignName ? String(row.campaignName).trim() : undefined,
    });
  }

  return { rows: parsed, errors, preview: rows.slice(0, 20), totalRows: rows.length };
}

function parseManagers(rows: Record<string, unknown>[]): ParseResult {
  const parsed: ParsedManagerRow[] = [];
  const errors: ValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    if (!row.managerExternalId || String(row.managerExternalId).trim() === '') {
      errors.push({ row: rowNum, field: 'managerExternalId', message: 'ID менеджера обязателен' });
      continue;
    }
    if (!row.name || String(row.name).trim() === '') {
      errors.push({ row: rowNum, field: 'name', message: 'Имя обязательно' });
      continue;
    }

    parsed.push({
      managerExternalId: normalizeReferenceId(row.managerExternalId) ?? String(row.managerExternalId).trim(),
      name: String(row.name).trim(),
    });
  }

  return { rows: parsed, errors, preview: rows.slice(0, 20), totalRows: rows.length };
}

function parseContentMetrics(rows: Record<string, unknown>[]): ParseResult {
  const platforms = ['instagram', 'tiktok', 'facebook', 'linkedin', 'youtube', 'telegram', 'other'] as const;
  const parsed: ParsedContentMetricRow[] = [];
  const errors: ValidationError[] = [];
  const warnings: { row: number; field: string; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    if (!row.contentId || String(row.contentId).trim() === '') {
      errors.push({ row: rowNum, field: 'contentId', message: 'ID контента обязателен' });
      continue;
    }
    const rawPlatform = String(row.platform ?? '').toLowerCase().replace(/\s/g, '');
    const platform = platforms.find((p) => rawPlatform.includes(p)) ?? 'other';

    if (!row.publishedAt || !isValidDate(row.publishedAt)) {
      errors.push({ row: rowNum, field: 'publishedAt', message: 'Дата публикации обязательна (YYYY-MM-DD)' });
      continue;
    }

    parsed.push({
      platform,
      contentId: normalizeReferenceId(row.contentId) ?? String(row.contentId).trim(),
      contentTitle: row.contentTitle ? String(row.contentTitle).trim() : undefined,
      publishedAt: toDateString(row.publishedAt),
      impressions: Math.max(0, Number(row.impressions) || 0),
      reach: Math.max(0, Number(row.reach) || 0),
      profileVisits: Math.max(0, Number(row.profileVisits) || 0),
      likes: Math.max(0, Number(row.likes) || 0),
      comments: Math.max(0, Number(row.comments) || 0),
      saves: Math.max(0, Number(row.saves) || 0),
      shares: Math.max(0, Number(row.shares) || 0),
      inboundMessages: Math.max(0, Number(row.inboundMessages) || 0),
      leadsGenerated: Math.max(0, Number(row.leadsGenerated) || 0),
      dealsGenerated: Math.max(0, Number(row.dealsGenerated) || 0),
      paidConversions: Math.max(0, Number(row.paidConversions) || 0),
      channelCampaignExternalId: normalizeReferenceId(row.channelCampaignExternalId),
    });
  }

  return { rows: parsed, errors, warnings, preview: rows.slice(0, 20), totalRows: rows.length };
}

/**
 * Parse pre-mapped rows by file type. Use after applyColumnMappings.
 */
export function parseFromRows(rows: Record<string, unknown>[], fileType: FileType): ParseResult {
  const normalized = normalizeRowsForType(rows, fileType);

  switch (fileType) {
    case 'transactions':
      return parseTransactions(normalized);
    case 'customers':
      return parseCustomers(normalized);
    case 'invoices':
      return parseInvoices(normalized);
    case 'marketing_spend':
      return parseMarketingSpend(normalized);
    case 'leads':
      return parseLeads(normalized);
    case 'deals':
      return parseDeals(normalized);
    case 'payments':
      return parsePayments(normalized);
    case 'channels_campaigns':
      return parseChannelsCampaigns(normalized);
    case 'managers':
      return parseManagers(normalized);
    case 'content_metrics':
      return parseContentMetrics(normalized);
    default:
      throw new Error(`Неизвестный тип файла: ${fileType}`);
  }
}

// --- Main parse function ---
export async function parseFile(file: File, fileType: FileType): Promise<ParseResult> {
  const rows = normalizeRowsForType(await fileToRows(file), fileType);

  switch (fileType) {
    case 'transactions':
      return parseTransactions(rows);
    case 'customers':
      return parseCustomers(rows);
    case 'invoices':
      return parseInvoices(rows);
    case 'marketing_spend':
      return parseMarketingSpend(rows);
    case 'leads':
      return parseLeads(rows);
    case 'deals':
      return parseDeals(rows);
    case 'payments':
      return parsePayments(rows);
    case 'channels_campaigns':
      return parseChannelsCampaigns(rows);
    case 'managers':
      return parseManagers(rows);
    case 'content_metrics':
      return parseContentMetrics(rows);
    default:
      throw new Error(`Неизвестный тип файла: ${fileType}`);
  }
}

export async function parseFileAuto(file: File): Promise<AutoParseResult> {
  const rawRows = await fileToRows(file);

  const attempts = ([
    'transactions',
    'customers',
    'invoices',
    'marketing_spend',
    'leads',
    'deals',
    'payments',
    'channels_campaigns',
    'managers',
    'content_metrics',
  ] as const).map((type) => {
    const rows = normalizeRowsForType(rawRows, type);
    let result: ParseResult;
    switch (type) {
      case 'transactions':
        result = parseTransactions(rows);
        break;
      case 'customers':
        result = parseCustomers(rows);
        break;
      case 'invoices':
        result = parseInvoices(rows);
        break;
      case 'marketing_spend':
        result = parseMarketingSpend(rows);
        break;
      case 'leads':
        result = parseLeads(rows);
        break;
      case 'deals':
        result = parseDeals(rows);
        break;
      case 'payments':
        result = parsePayments(rows);
        break;
      case 'channels_campaigns':
        result = parseChannelsCampaigns(rows);
        break;
      case 'managers':
        result = parseManagers(rows);
        break;
      case 'content_metrics':
        result = parseContentMetrics(rows);
        break;
    }

    const validRows = result.rows.length;
    const errorRows = result.errors.length;
    const score = validRows * 3 - errorRows;
    return { type, result, validRows, score };
  });

  const best = attempts.sort((a, b) => b.score - a.score)[0];

  if (!best || best.validRows === 0) {
    throw new Error('Не удалось автоматически определить тип данных. Укажите тип вручную.');
  }

  const confidence = Math.max(
    0,
    Math.min(100, Math.round((best.validRows / Math.max(1, best.result.totalRows)) * 100))
  );

  return {
    ...best.result,
    detectedFileType: best.type,
    confidence,
  };
}

// --- Document text extraction ---
export async function extractDocumentText(file: File): Promise<{ text: string; extracted: boolean }> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'docx') {
    try {
      const mammoth = await import('mammoth');
      const buffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      return { text: result.value, extracted: result.value.length > 0 };
    } catch {
      return { text: '', extracted: false };
    }
  }

  if (ext === 'pdf') {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ('str' in item ? (item as { str?: string }).str : ''))
          .join(' ');
        fullText += pageText + '\n';
      }
      return { text: fullText.trim(), extracted: fullText.trim().length > 0 };
    } catch {
      return { text: '', extracted: false };
    }
  }

  return { text: '', extracted: false };
}
