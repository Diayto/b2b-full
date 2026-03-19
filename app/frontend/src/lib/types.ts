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
  // Used by the MVP "expected inflow" + "overdue invoices" logic.
  // Kept optional for backward compatibility with existing imports/demo data.
  dueDate?: string; // YYYY-MM-DD
  // Used by the MVP attribution chain (deal -> invoice -> payment).
  dealExternalId?: string;
  // External identifier from imported files (optional until imports are upgraded).
  invoiceExternalId?: string;
  uploadId?: string;
}

// --- Marketing Spend ---
export interface MarketingSpend {
  id: string;
  companyId: string;
  month: string; // YYYY-MM
  amount: number;
  // Links marketing spend to a specific channel/campaign (combined entity).
  // Kept optional until demo/imports generate these fields.
  channelCampaignExternalId?: string;
  uploadId?: string;
}

// --- Channel / Campaign (combined for MVP) ---
export interface ChannelCampaign {
  id: string;
  companyId: string;
  channelCampaignExternalId: string;
  // Owner-friendly names; can be derived from external columns during import.
  name: string;
  channelName?: string;
  campaignName?: string;
  createdAt?: string;
  uploadId?: string;
}

// --- Managers (sales reps / managers) ---
export interface Manager {
  id: string;
  companyId: string;
  managerExternalId: string;
  name: string;
  uploadId?: string;
}

// --- Leads ---
export type LeadStatus = 'new' | 'qualified' | 'converted' | 'lost';

export type SourceType = 'organic' | 'paid' | 'referral' | 'outbound' | 'direct' | 'unknown';

export interface Lead {
  id: string;
  companyId: string;
  leadExternalId: string;
  name?: string;
  // Links lead to marketing source (channel/campaign).
  channelCampaignExternalId?: string;
  // Optional: helps sales priorities by responsibility.
  managerExternalId?: string;
  createdDate?: string; // YYYY-MM-DD
  status?: LeadStatus;
  sourceType?: SourceType;
  uploadId?: string;
}

// --- Deals ---
export type DealStatus = 'open' | 'won' | 'lost';
export type LostReason = 'price' | 'no_response' | 'not_relevant' | 'competitor' | 'timing' | 'other';

export interface Deal {
  id: string;
  companyId: string;
  dealExternalId: string;
  // May originate from a lead (optional to support partial imports).
  leadExternalId?: string;
  customerExternalId?: string;
  managerExternalId?: string;
  createdDate?: string; // YYYY-MM-DD
  expectedCloseDate?: string; // YYYY-MM-DD
  lastActivityDate?: string; // YYYY-MM-DD
  status?: DealStatus;
  wonDate?: string; // YYYY-MM-DD
  // Lost deal tracking
  lostDate?: string; // YYYY-MM-DD
  lostReason?: LostReason;
  lostStage?: string; // funnel stage where the deal was lost
  // Stalled pipeline metadata
  stalledReason?: string;
  lastContactDate?: string; // YYYY-MM-DD
  noResponseDays?: number;
  sourceType?: SourceType;
  uploadId?: string;
}

// --- Payments / Transactions (linked to invoices) ---
export interface PaymentTransaction {
  id: string;
  companyId: string;
  paymentExternalId?: string;
  invoiceExternalId?: string;
  paymentDate?: string; // YYYY-MM-DD
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
// MVP entity types:
// - we keep the existing 4 types for backward compatibility
// - new types are added for the revenue control tower chain
export type FileType =
  | 'transactions'
  | 'customers'
  | 'invoices'
  | 'marketing_spend'
  | 'leads'
  | 'deals'
  | 'payments'
  | 'channels_campaigns'
  | 'managers'
  | 'content_metrics';
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
  warnings?: ValidationWarning[];
  createdAt: string;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ValidationWarning {
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
  dueDate?: string; // YYYY-MM-DD
  dealExternalId?: string;
  invoiceExternalId?: string;
}

export interface ParsedMarketingSpendRow {
  month: string;
  amount: number;
  channelCampaignExternalId?: string;
}

export interface ParsedChannelCampaignRow {
  channelCampaignExternalId: string;
  name: string;
  channelName?: string;
  campaignName?: string;
}

export interface ParsedManagerRow {
  managerExternalId: string;
  name: string;
}

export interface ParsedLeadRow {
  leadExternalId: string;
  name?: string;
  channelCampaignExternalId?: string;
  managerExternalId?: string;
  createdDate?: string; // YYYY-MM-DD
  status?: LeadStatus;
}

export interface ParsedDealRow {
  dealExternalId: string;
  leadExternalId?: string;
  customerExternalId?: string;
  managerExternalId?: string;
  createdDate?: string;
  expectedCloseDate?: string;
  lastActivityDate?: string;
  status?: DealStatus;
  wonDate?: string;
  lostDate?: string;
  lostReason?: LostReason;
  lostStage?: string;
}

export interface ParsedPaymentRow {
  paymentExternalId?: string;
  invoiceExternalId?: string;
  paymentDate?: string; // YYYY-MM-DD
  amount: number;
}

export type ContentPlatform = 'instagram' | 'tiktok' | 'facebook' | 'linkedin' | 'youtube' | 'telegram' | 'other';

export interface ParsedContentMetricRow {
  platform: ContentPlatform;
  contentId: string;
  contentTitle?: string;
  publishedAt: string;
  impressions: number;
  reach: number;
  profileVisits: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  inboundMessages: number;
  leadsGenerated: number;
  dealsGenerated: number;
  paidConversions: number;
  channelCampaignExternalId?: string;
}

// --- Date Range ---
export interface DateRange {
  from: string;
  to: string;
}

// --- Aggregation ---
export type AggregationPeriod = 'day' | 'week' | 'month';
