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
} from './types';

export type ParsedRow =
  | ParsedTransactionRow
  | ParsedCustomerRow
  | ParsedInvoiceRow
  | ParsedMarketingSpendRow
  | ParsedLeadRow
  | ParsedDealRow
  | ParsedPaymentRow
  | ParsedChannelCampaignRow
  | ParsedManagerRow;

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
  const str = String(val);
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(Date.parse(str));
}

function toDateString(val: unknown): string {
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
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
    customerExternalId: ['customerexternalid', 'customerid', 'clientid', 'idклиента'],
    amount: ['amount', 'sum', 'value', 'сумма'],
    status: ['status', 'state', 'статус'],
    paidDate: ['paiddate', 'paymentdate', 'датаоплаты'],
    dueDate: ['duedate', 'duedatepayment', 'paymentduedate', 'dateofduedate', 'дедлайн', 'дедлайни'],
    dealExternalId: ['dealexternalid', 'dealid', 'idсделки', 'iddeal'],
    invoiceExternalId: ['invoiceexternalid', 'invoiceid', 'invoicenumber', 'number', 'idсчета', 'idscheta'],
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
    dealExternalId: ['dealexternalid', 'dealid', 'idсделки', 'iddeal', 'deal_id'],
    leadExternalId: ['leadexternalid', 'leadid', 'idлида', 'idlead', 'lead_id'],
    customerExternalId: ['customerexternalid', 'customerid', 'clientid', 'idклиента'],
    managerExternalId: ['managerexternalid', 'managerid', 'salesrepid', 'repid', 'idменеджера'],
    createdDate: ['createddate', 'dealdate', 'date', 'дата', 'датасделки'],
    expectedCloseDate: ['expectedclosedate', 'closeexpecteddate', 'closedate', 'expectedclose', 'ожидаемаядата'],
    lastActivityDate: ['lastactivitydate', 'activitydate', 'lastactivity', 'lastupdated', 'последняяактивность'],
    status: ['status', 'state', 'статус', 'stage', 'этап'],
    wonDate: ['wondate', 'dealwon', 'closedwon', 'датаwon', 'датаокончания'],
  },
  payments: {
    invoiceExternalId: ['invoiceexternalid', 'invoiceid', 'invoicenumber', 'number', 'idсчета', 'idscheta'],
    paymentDate: ['paymentdate', 'date', 'оплата', 'payment'],
    amount: ['amount', 'sum', 'value', 'total', 'сумма'],
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
      customerExternalId: String(row.customerExternalId).trim(),
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

    if (!isValidDate(row.invoiceDate)) {
      errors.push({ row: rowNum, field: 'invoiceDate', message: 'Неверный формат даты счёта' });
      continue;
    }
    if (!row.customerExternalId || String(row.customerExternalId).trim() === '') {
      errors.push({ row: rowNum, field: 'customerExternalId', message: 'ID клиента обязателен' });
      continue;
    }
    if (!isPositiveNumber(row.amount)) {
      errors.push({ row: rowNum, field: 'amount', message: 'Сумма должна быть положительным числом' });
      continue;
    }
    const status = String(row.status).toLowerCase();
    if (status !== 'paid' && status !== 'unpaid') {
      errors.push({ row: rowNum, field: 'status', message: 'Статус должен быть "paid" или "unpaid"' });
      continue;
    }

    parsed.push({
      invoiceDate: toDateString(row.invoiceDate),
      customerExternalId: String(row.customerExternalId).trim(),
      amount: Number(row.amount),
      status: status as 'paid' | 'unpaid',
      paidDate: row.paidDate && isValidDate(row.paidDate) ? toDateString(row.paidDate) : undefined,
      dueDate: row.dueDate && isValidDate(row.dueDate) ? toDateString(row.dueDate) : undefined,
      dealExternalId: row.dealExternalId ? String(row.dealExternalId).trim() : undefined,
      invoiceExternalId: row.invoiceExternalId ? String(row.invoiceExternalId).trim() : undefined,
    });

    // Relational / MVP warnings (non-blocking for compatibility)
    const computedDueDate =
      row.dueDate && isValidDate(row.dueDate) ? toDateString(row.dueDate) : undefined;
    const computedPaidDate =
      row.paidDate && isValidDate(row.paidDate) ? toDateString(row.paidDate) : undefined;
    const computedInvoiceExternalId =
      row.invoiceExternalId ? String(row.invoiceExternalId).trim() : undefined;

    if (!computedDueDate) {
      warnings.push({
        row: rowNum,
        field: 'dueDate',
        message: 'Нет due date: метрики “ожидаемый приток/просрочка” будут неполными.',
      });
    }
    if (!computedInvoiceExternalId) {
      warnings.push({
        row: rowNum,
        field: 'invoiceExternalId',
        message: 'Нет invoiceExternalId: связать платежи будет сложнее.',
      });
    }
    if (status === 'paid' && !computedPaidDate) {
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
      channelCampaignExternalId: row.channelCampaignExternalId ? String(row.channelCampaignExternalId).trim() : undefined,
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

    const computedChannelCampaignExternalId =
      row.channelCampaignExternalId ? String(row.channelCampaignExternalId).trim() : undefined;
    parsed.push({
      leadExternalId: String(row.leadExternalId).trim(),
      name: row.name ? String(row.name).trim() : undefined,
      channelCampaignExternalId: computedChannelCampaignExternalId,
      managerExternalId: row.managerExternalId ? String(row.managerExternalId).trim() : undefined,
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

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    if (!row.dealExternalId || String(row.dealExternalId).trim() === '') {
      errors.push({ row: rowNum, field: 'dealExternalId', message: 'ID сделки обязателен' });
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

    let status: string | undefined = undefined;
    if (row.status !== undefined && row.status !== null && String(row.status).trim() !== '') {
      status = String(row.status).toLowerCase();
      if (!allowedStatuses.has(status)) {
        errors.push({ row: rowNum, field: 'status', message: 'Статус сделки должен быть одним из: open, won, lost' });
        continue;
      }
    }

    const computedLeadExternalId = row.leadExternalId ? String(row.leadExternalId).trim() : undefined;
    const computedWonDate = row.wonDate && isValidDate(row.wonDate) ? toDateString(row.wonDate) : undefined;

    parsed.push({
      dealExternalId: String(row.dealExternalId).trim(),
      leadExternalId: computedLeadExternalId,
      customerExternalId: row.customerExternalId ? String(row.customerExternalId).trim() : undefined,
      managerExternalId: row.managerExternalId ? String(row.managerExternalId).trim() : undefined,
      createdDate: row.createdDate && isValidDate(row.createdDate) ? toDateString(row.createdDate) : undefined,
      expectedCloseDate: row.expectedCloseDate && isValidDate(row.expectedCloseDate) ? toDateString(row.expectedCloseDate) : undefined,
      lastActivityDate: row.lastActivityDate && isValidDate(row.lastActivityDate) ? toDateString(row.lastActivityDate) : undefined,
      status: status as ParsedDealRow['status'] | undefined,
      wonDate: computedWonDate,
    });

    if (status === 'won' && !computedWonDate) {
      warnings.push({
        row: rowNum,
        field: 'wonDate',
        message: 'Сделка помечена как won, но wonDate не указан.',
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
      paymentExternalId: row.paymentExternalId ? String(row.paymentExternalId).trim() : undefined,
      invoiceExternalId: String(row.invoiceExternalId).trim(),
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
      channelCampaignExternalId: String(row.channelCampaignExternalId).trim(),
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
      managerExternalId: String(row.managerExternalId).trim(),
      name: String(row.name).trim(),
    });
  }

  return { rows: parsed, errors, preview: rows.slice(0, 20), totalRows: rows.length };
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
