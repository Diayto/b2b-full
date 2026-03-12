// ============================================================
// BizPulse KZ — Core Type Definitions
// ============================================================

// --- Auth & Multi-tenant ---
export type UserRole = 'owner' | 'finance' | 'manager';

export interface User {
  id: string;
  email: string;
  name: string;
  companyId: string;
  role: UserRole;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  currency: string; // default "KZT"
  createdAt: string;
}

// --- Transactions ---
export type TransactionDirection = 'income' | 'expense';

export interface Transaction {
  id: string;
  companyId: string;
  date: string; // YYYY-MM-DD
  amount: number;
  direction: TransactionDirection;
  category: string;
  counterparty?: string;
  description?: string;
  customerExternalId?: string;
  uploadId?: string;
}

// --- Customers ---
export interface Customer {
  id: string;
  companyId: string;
  customerExternalId: string;
  name: string;
  segment?: string;
  startDate?: string;
  uploadId?: string;
}

// --- Invoices ---
export type InvoiceStatus = 'paid' | 'unpaid';

export interface Invoice {
  id: string;
  companyId: string;
  invoiceDate: string;
  customerExternalId: string;
  amount: number;
  status: InvoiceStatus;
  paidDate?: string;
  uploadId?: string;
}

// --- Marketing Spend ---
export interface MarketingSpend {
  id: string;
  companyId: string;
  month: string; // YYYY-MM
  amount: number;
  uploadId?: string;
}

// --- Documents ---
export interface Document {
  id: string;
  companyId: string;
  title: string;
  fileName: string;
  fileType: 'pdf' | 'docx';
  counterparty?: string;
  amount?: number;
  startDate?: string;
  endDate?: string;
  tags?: string[];
  extractedText?: string;
  textExtracted: boolean;
  createdAt: string;
}

// --- Uploads ---
export type FileType = 'transactions' | 'customers' | 'invoices' | 'marketing_spend';
export type UploadStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface Upload {
  id: string;
  companyId: string;
  fileType: FileType;
  originalFileName: string;
  status: UploadStatus;
  totalRows: number;
  successRows: number;
  errorRows: number;
  errors: ValidationError[];
  createdAt: string;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

// --- Signals ---
export type SignalType =
  | 'cashflow_negative'
  | 'expense_spike'
  | 'revenue_drop'
  | 'contract_deadline'
  | 'high_unpaid_invoices';

export type SignalSeverity = 'low' | 'medium' | 'high';
export type SignalStatus = 'open' | 'closed';

export interface Signal {
  id: string;
  companyId: string;
  type: SignalType;
  severity: SignalSeverity;
  title: string;
  description: string;
  createdAt: string;
  status: SignalStatus;
  sourceRefs?: string[];
}

// --- Metrics ---
export interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  profit: number;
  grossMarginPercent: number;
  cashflowNet: number;
}

export interface CashflowPoint {
  period: string;
  income: number;
  expense: number;
  net: number;
}

export interface CategoryBreakdown {
  category: string;
  amount: number;
  percent: number;
}

export interface InvestorMetrics {
  totalCustomers: number;
  activeCustomers: number;
  avgRevenuePerCustomer: number;
  ltvAvg: number;
  retentionRate: number;
  cacAvg: number | null;
  ltvCacRatio: number | null;
  available: boolean;
  missingData: string[];
}

export type PlanPriority = 'high' | 'medium' | 'low';
export type PlanArea = 'revenue' | 'cost' | 'cashflow' | 'operations';

export interface BusinessPlanAction {
  id: string;
  title: string;
  area: PlanArea;
  priority: PlanPriority;
  rationale: string;
  target: string;
}

export interface MonthlyBusinessPlan {
  period: string;
  forecastRevenue: number;
  forecastExpenses: number;
  forecastProfit: number;
  strengths: string[];
  weaknesses: string[];
  risks: string[];
  actions: BusinessPlanAction[];
}

// --- Deadline Notifications ---
export type ReminderDeliveryStatus = 'sent' | 'queued' | 'failed';

export interface NotificationSettings {
  companyId: string;
  enabled: boolean;
  recipientEmails: string[];
  reminderDays: number[]; // e.g. [7, 3, 0]
  updatedAt: string;
}

export interface DeadlineReminderLog {
  id: string;
  companyId: string;
  documentId: string;
  documentTitle: string;
  deadlineDate: string;
  daysBefore: number;
  recipientEmail: string;
  status: ReminderDeliveryStatus;
  sentAt: string;
  error?: string;
}

export interface DeadlineReminderRequest {
  requestId: string;
  companyId: string;
  documentId: string;
  documentTitle: string;
  deadlineDate: string;
  daysBefore: number;
  recipientEmail: string;
}

export interface DeadlineReminderResponse {
  status: 'accepted' | 'queued' | 'sent' | 'failed';
  messageId?: string;
  provider?: string;
  error?: string;
}

// --- Parsed Row Types ---
export interface ParsedTransactionRow {
  date: string;
  amount: number;
  direction: TransactionDirection;
  category: string;
  counterparty?: string;
  description?: string;
  customerExternalId?: string;
}

export interface ParsedCustomerRow {
  customerExternalId: string;
  name: string;
  segment?: string;
  startDate?: string;
}

export interface ParsedInvoiceRow {
  invoiceDate: string;
  customerExternalId: string;
  amount: number;
  status: InvoiceStatus;
  paidDate?: string;
}

export interface ParsedMarketingSpendRow {
  month: string;
  amount: number;
}

// --- Date Range ---
export interface DateRange {
  from: string;
  to: string;
}

// --- Aggregation ---
export type AggregationPeriod = 'day' | 'week' | 'month';
