// ============================================================
// BizPulse KZ — Local Storage Data Layer
// Simulates multi-tenant backend with localStorage
// ============================================================

import type {
  User, Company, Transaction, Customer, Invoice,
  MarketingSpend, Document, Upload, Signal, UserRole,
  DeadlineReminderLog, NotificationSettings,
} from './types';

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
  const categories = ['Продажи', 'Услуги', 'Аренда', 'Зарплата', 'Маркетинг', 'Коммунальные', 'Логистика', 'IT'];
  const counterparties = ['ТОО "Алматы Трейд"', 'ИП Касымов', 'ТОО "ТехноПарк"', 'АО "КазМунайГаз"', 'ТОО "Астана Логистик"'];

  const txns: Omit<Transaction, 'id' | 'companyId'>[] = [];
  const now = new Date();

  for (let i = 0; i < 120; i++) {
    const daysAgo = Math.floor(Math.random() * 180);
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    const isIncome = Math.random() > 0.45;

    txns.push({
      date: d.toISOString().split('T')[0],
      amount: Math.round((isIncome ? 50000 + Math.random() * 2000000 : 10000 + Math.random() * 800000) / 100) * 100,
      direction: isIncome ? 'income' : 'expense',
      category: isIncome ? categories[Math.floor(Math.random() * 2)] : categories[2 + Math.floor(Math.random() * 6)],
      counterparty: counterparties[Math.floor(Math.random() * counterparties.length)],
      description: isIncome ? 'Оплата по договору' : 'Расход по счёту',
    });
  }
  addTransactions(companyId, txns);

  // Seed customers
  const custData: Omit<Customer, 'id' | 'companyId'>[] = [
    { customerExternalId: 'C001', name: 'ТОО "Алматы Трейд"', segment: 'B2B', startDate: '2025-01-15' },
    { customerExternalId: 'C002', name: 'ИП Касымов', segment: 'SMB', startDate: '2025-03-01' },
    { customerExternalId: 'C003', name: 'ТОО "ТехноПарк"', segment: 'B2B', startDate: '2025-02-10' },
    { customerExternalId: 'C004', name: 'АО "КазМунайГаз"', segment: 'Enterprise', startDate: '2024-11-20' },
    { customerExternalId: 'C005', name: 'ТОО "Астана Логистик"', segment: 'B2B', startDate: '2025-05-01' },
    { customerExternalId: 'C006', name: 'ИП Нурланова', segment: 'SMB', startDate: '2025-06-15' },
    { customerExternalId: 'C007', name: 'ТОО "Шымкент Строй"', segment: 'B2B', startDate: '2025-04-01' },
    { customerExternalId: 'C008', name: 'АО "Казахтелеком"', segment: 'Enterprise', startDate: '2024-09-01' },
  ];
  addCustomers(companyId, custData);

  // Seed invoices
  const invData: Omit<Invoice, 'id' | 'companyId'>[] = [];
  for (const cust of custData) {
    const numInvoices = 2 + Math.floor(Math.random() * 4);
    for (let j = 0; j < numInvoices; j++) {
      const daysAgo = Math.floor(Math.random() * 150);
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      const isPaid = Math.random() > 0.3;
      const paidD = new Date(d);
      paidD.setDate(paidD.getDate() + Math.floor(Math.random() * 30));

      invData.push({
        invoiceDate: d.toISOString().split('T')[0],
        customerExternalId: cust.customerExternalId,
        amount: Math.round((100000 + Math.random() * 1500000) / 100) * 100,
        status: isPaid ? 'paid' : 'unpaid',
        paidDate: isPaid ? paidD.toISOString().split('T')[0] : undefined,
      });
    }
  }
  addInvoices(companyId, invData);

  // Seed marketing spend
  const mktData: Omit<MarketingSpend, 'id' | 'companyId'>[] = [];
  for (let m = 0; m < 6; m++) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - m);
    mktData.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      amount: Math.round((200000 + Math.random() * 500000) / 100) * 100,
    });
  }
  addMarketingSpend(companyId, mktData);
}
