// ============================================================
// BizPulse KZ — Local Storage Data Layer
// Simulates multi-tenant backend with localStorage
// ============================================================

import type {
  User, Company, Transaction, Customer, Invoice,
  MarketingSpend, Document, Upload, Signal, UserRole,
  DeadlineReminderLog, NotificationSettings,
  Lead, Deal, ChannelCampaign, Manager, PaymentTransaction,
} from './types';
import { generateMvpDemoData } from './demoData';

// --- Helpers ---
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getItem<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setItem<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// --- Keys ---
const KEYS = {
  users: 'bp_users',
  companies: 'bp_companies',
  transactions: 'bp_transactions',
  customers: 'bp_customers',
  invoices: 'bp_invoices',
  marketingSpend: 'bp_marketing_spend',
  leads: 'bp_leads',
  deals: 'bp_deals',
  channelCampaigns: 'bp_channels_campaigns',
  managers: 'bp_managers',
  payments: 'bp_payments',
  documents: 'bp_documents',
  uploads: 'bp_uploads',
  signals: 'bp_signals',
  session: 'bp_session',
  notificationSettings: 'bp_notification_settings',
  reminderLogs: 'bp_deadline_reminder_logs',
} as const;

// ============================================================
// Auth
// ============================================================
export interface Session {
  userId: string;
  companyId: string;
  role: UserRole;
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEYS.session);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  localStorage.setItem(KEYS.session, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(KEYS.session);
}

export function register(email: string, password: string, name: string, companyName: string): { user: User; company: Company } {
  const users = getItem<User & { password: string }>(KEYS.users);
  if (users.find(u => u.email === email)) {
    throw new Error('Пользователь с таким email уже существует');
  }

  const companyId = generateId();
  const userId = generateId();
  const now = new Date().toISOString();

  const company: Company = {
    id: companyId,
    name: companyName,
    currency: 'KZT',
    createdAt: now,
  };

  const user: User = {
    id: userId,
    email,
    name,
    companyId,
    role: 'owner',
    createdAt: now,
  };

  const companies = getItem<Company>(KEYS.companies);
  companies.push(company);
  setItem(KEYS.companies, companies);

  users.push({ ...user, password });
  setItem(KEYS.users, users);

  setSession({ userId, companyId, role: 'owner' });

  return { user, company };
}

export function login(email: string, password: string): User {
  const users = getItem<User & { password: string }>(KEYS.users);
  const found = users.find(u => u.email === email && u.password === password);
  if (!found) {
    throw new Error('Неверный email или пароль');
  }

  setSession({ userId: found.id, companyId: found.companyId, role: found.role });

  const { password: _pw, ...user } = found;
  void _pw;
  return user;
}

export function getCurrentUser(): User | null {
  const session = getSession();
  if (!session) return null;
  const users = getItem<User & { password: string }>(KEYS.users);
  const found = users.find(u => u.id === session.userId);
  if (!found) return null;
  const { password: _pw, ...user } = found;
  void _pw;
  return user;
}

export function getCompany(companyId: string): Company | null {
  const companies = getItem<Company>(KEYS.companies);
  return companies.find(c => c.id === companyId) || null;
}

// ============================================================
// Transactions
// ============================================================
export function getTransactions(companyId: string): Transaction[] {
  return getItem<Transaction>(KEYS.transactions).filter(t => t.companyId === companyId);
}

export function addTransactions(companyId: string, txns: Omit<Transaction, 'id' | 'companyId'>[]): Transaction[] {
  const all = getItem<Transaction>(KEYS.transactions);
  const newTxns: Transaction[] = txns.map(t => ({
    ...t,
    id: generateId(),
    companyId,
  }));
  all.push(...newTxns);
  setItem(KEYS.transactions, all);
  return newTxns;
}

// ============================================================
// Customers
// ============================================================
export function getCustomers(companyId: string): Customer[] {
  return getItem<Customer>(KEYS.customers).filter(c => c.companyId === companyId);
}

export function addCustomers(companyId: string, custs: Omit<Customer, 'id' | 'companyId'>[]): Customer[] {
  const all = getItem<Customer>(KEYS.customers);
  const newCusts: Customer[] = custs.map(c => ({
    ...c,
    id: generateId(),
    companyId,
  }));
  all.push(...newCusts);
  setItem(KEYS.customers, all);
  return newCusts;
}

// ============================================================
// Invoices
// ============================================================
export function getInvoices(companyId: string): Invoice[] {
  return getItem<Invoice>(KEYS.invoices).filter(i => i.companyId === companyId);
}

export function addInvoices(companyId: string, invs: Omit<Invoice, 'id' | 'companyId'>[]): Invoice[] {
  const all = getItem<Invoice>(KEYS.invoices);
  const newInvs: Invoice[] = invs.map(i => ({
    ...i,
    id: generateId(),
    companyId,
  }));
  all.push(...newInvs);
  setItem(KEYS.invoices, all);
  return newInvs;
}

// ============================================================
// Marketing Spend
// ============================================================
export function getMarketingSpend(companyId: string): MarketingSpend[] {
  return getItem<MarketingSpend>(KEYS.marketingSpend).filter(m => m.companyId === companyId);
}

export function addMarketingSpend(companyId: string, spends: Omit<MarketingSpend, 'id' | 'companyId'>[]): MarketingSpend[] {
  const all = getItem<MarketingSpend>(KEYS.marketingSpend);
  const newSpends: MarketingSpend[] = spends.map(s => ({
    ...s,
    id: generateId(),
    companyId,
  }));
  all.push(...newSpends);
  setItem(KEYS.marketingSpend, all);
  return newSpends;
}

// ============================================================
// MVP: Leads
// ============================================================
export function getLeads(companyId: string): Lead[] {
  return getItem<Lead>(KEYS.leads).filter((l) => l.companyId === companyId);
}

export function addLeads(companyId: string, leads: Omit<Lead, 'id' | 'companyId'>[]): Lead[] {
  const all = getItem<Lead>(KEYS.leads);
  const newLeads: Lead[] = leads.map((l) => ({
    ...l,
    id: generateId(),
    companyId,
  }));
  all.push(...newLeads);
  setItem(KEYS.leads, all);
  return newLeads;
}

// ============================================================
// MVP: Deals
// ============================================================
export function getDeals(companyId: string): Deal[] {
  return getItem<Deal>(KEYS.deals).filter((d) => d.companyId === companyId);
}

export function addDeals(companyId: string, deals: Omit<Deal, 'id' | 'companyId'>[]): Deal[] {
  const all = getItem<Deal>(KEYS.deals);
  const newDeals: Deal[] = deals.map((d) => ({
    ...d,
    id: generateId(),
    companyId,
  }));
  all.push(...newDeals);
  setItem(KEYS.deals, all);
  return newDeals;
}

// ============================================================
// MVP: Channels / Campaigns (combined)
// ============================================================
export function getChannelCampaigns(companyId: string): ChannelCampaign[] {
  return getItem<ChannelCampaign>(KEYS.channelCampaigns).filter((cc) => cc.companyId === companyId);
}

export function addChannelCampaigns(
  companyId: string,
  rows: Omit<ChannelCampaign, 'id' | 'companyId'>[]
): ChannelCampaign[] {
  const all = getItem<ChannelCampaign>(KEYS.channelCampaigns);
  const newRows: ChannelCampaign[] = rows.map((cc) => ({
    ...cc,
    id: generateId(),
    companyId,
  }));
  all.push(...newRows);
  setItem(KEYS.channelCampaigns, all);
  return newRows;
}

// ============================================================
// MVP: Managers
// ============================================================
export function getManagers(companyId: string): Manager[] {
  return getItem<Manager>(KEYS.managers).filter((m) => m.companyId === companyId);
}

export function addManagers(companyId: string, managers: Omit<Manager, 'id' | 'companyId'>[]): Manager[] {
  const all = getItem<Manager>(KEYS.managers);
  const newRows: Manager[] = managers.map((m) => ({
    ...m,
    id: generateId(),
    companyId,
  }));
  all.push(...newRows);
  setItem(KEYS.managers, all);
  return newRows;
}

// ============================================================
// MVP: Payments / Transactions (linked to invoices)
// ============================================================
export function getPayments(companyId: string): PaymentTransaction[] {
  return getItem<PaymentTransaction>(KEYS.payments).filter((p) => p.companyId === companyId);
}

export function addPayments(
  companyId: string,
  payments: Omit<PaymentTransaction, 'id' | 'companyId'>[]
): PaymentTransaction[] {
  const all = getItem<PaymentTransaction>(KEYS.payments);
  const newRows: PaymentTransaction[] = payments.map((p) => ({
    ...p,
    id: generateId(),
    companyId,
  }));
  all.push(...newRows);
  setItem(KEYS.payments, all);
  return newRows;
}

// ============================================================
// Documents
// ============================================================
export function getDocuments(companyId: string): Document[] {
  return getItem<Document>(KEYS.documents).filter(d => d.companyId === companyId);
}

export function addDocument(companyId: string, doc: Omit<Document, 'id' | 'companyId' | 'createdAt'>): Document {
  const all = getItem<Document>(KEYS.documents);
  const newDoc: Document = {
    ...doc,
    id: generateId(),
    companyId,
    createdAt: new Date().toISOString(),
  };
  all.push(newDoc);
  setItem(KEYS.documents, all);
  return newDoc;
}

export function updateDocument(docId: string, updates: Partial<Document>): Document | null {
  const all = getItem<Document>(KEYS.documents);
  const idx = all.findIndex(d => d.id === docId);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...updates };
  setItem(KEYS.documents, all);
  return all[idx];
}

// ============================================================
// Uploads
// ============================================================
export function getUploads(companyId: string): Upload[] {
  return getItem<Upload>(KEYS.uploads).filter(u => u.companyId === companyId);
}

export function addUpload(companyId: string, upload: Omit<Upload, 'id' | 'companyId' | 'createdAt'>): Upload {
  const all = getItem<Upload>(KEYS.uploads);
  const newUpload: Upload = {
    ...upload,
    id: generateId(),
    companyId,
    createdAt: new Date().toISOString(),
  };
  all.push(newUpload);
  setItem(KEYS.uploads, all);
  return newUpload;
}

// ============================================================
// Signals
// ============================================================
export function getSignals(companyId: string): Signal[] {
  return getItem<Signal>(KEYS.signals).filter(s => s.companyId === companyId);
}

export function setSignals(companyId: string, signals: Signal[]): void {
  const all = getItem<Signal>(KEYS.signals).filter(s => s.companyId !== companyId);
  all.push(...signals);
  setItem(KEYS.signals, all);
}

export function closeSignal(signalId: string): Signal | null {
  const all = getItem<Signal>(KEYS.signals);
  const idx = all.findIndex(s => s.id === signalId);
  if (idx === -1) return null;
  all[idx].status = 'closed';
  setItem(KEYS.signals, all);
  return all[idx];
}

// ============================================================
// Deadline Notifications
// ============================================================
export function getNotificationSettings(companyId: string): NotificationSettings {
  const all = getItem<NotificationSettings>(KEYS.notificationSettings);
  const existing = all.find((item) => item.companyId === companyId);
  if (existing) return existing;

  return {
    companyId,
    enabled: false,
    recipientEmails: [],
    reminderDays: [7, 3, 0],
    updatedAt: new Date().toISOString(),
  };
}

export function saveNotificationSettings(
  companyId: string,
  updates: Partial<Omit<NotificationSettings, 'companyId' | 'updatedAt'>>
): NotificationSettings {
  const all = getItem<NotificationSettings>(KEYS.notificationSettings);
  const current = getNotificationSettings(companyId);
  const next: NotificationSettings = {
    ...current,
    ...updates,
    companyId,
    updatedAt: new Date().toISOString(),
  };

  const filtered = all.filter((item) => item.companyId !== companyId);
  filtered.push(next);
  setItem(KEYS.notificationSettings, filtered);
  return next;
}

export function getDeadlineReminderLogs(companyId: string): DeadlineReminderLog[] {
  return getItem<DeadlineReminderLog>(KEYS.reminderLogs)
    .filter((item) => item.companyId === companyId)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export function addDeadlineReminderLog(
  companyId: string,
  log: Omit<DeadlineReminderLog, 'id' | 'companyId' | 'sentAt'>
): DeadlineReminderLog {
  const all = getItem<DeadlineReminderLog>(KEYS.reminderLogs);
  const item: DeadlineReminderLog = {
    ...log,
    id: generateId(),
    companyId,
    sentAt: new Date().toISOString(),
  };
  all.push(item);
  setItem(KEYS.reminderLogs, all);
  return item;
}

export function wasReminderSent(
  companyId: string,
  documentId: string,
  deadlineDate: string,
  daysBefore: number,
  recipientEmail: string
): boolean {
  const all = getItem<DeadlineReminderLog>(KEYS.reminderLogs);
  return all.some(
    (item) =>
      item.companyId === companyId &&
      item.documentId === documentId &&
      item.deadlineDate === deadlineDate &&
      item.daysBefore === daysBefore &&
      item.recipientEmail.toLowerCase() === recipientEmail.toLowerCase() &&
      item.status === 'sent'
  );
}

// ============================================================
// Seed Data (for demo)
// ============================================================
export function seedDemoData(companyId: string): void {
  const demo = generateMvpDemoData(companyId);

  addManagers(companyId, demo.managers);
  addChannelCampaigns(companyId, demo.channelCampaigns);
  addCustomers(companyId, demo.customers);

  // Funnel chain data
  addLeads(companyId, demo.leads);
  addDeals(companyId, demo.deals);

  // Revenue chain data
  addInvoices(companyId, demo.invoices);
  addPayments(companyId, demo.payments);

  // Marketing attribution seed
  addMarketingSpend(companyId, demo.marketingSpend);

  // Backward-compatible finance transactions (income comes from demo payments)
  addTransactions(companyId, demo.transactions);
}
