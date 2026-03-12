// ============================================================
// BizPulse KZ — Executive Finance Dashboard
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import KPICard from '@/components/KPICard';
import SignalsPanel from '@/components/SignalsPanel';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DollarSign, TrendingUp, TrendingDown, Percent, ArrowDownUp,
  Users, Target, BarChart3, Download, AlertCircle,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  getSession, getTransactions, getCustomers, getInvoices,
  getMarketingSpend, getDocuments, getSignals, setSignals,
  closeSignal as closeSignalInStore, seedDemoData,
} from '@/lib/store';
import {
  calculateFinancialSummary, calculateCashflow, calculateCategoryBreakdown,
  calculateInvestorMetrics, calculateUnpaidInvoices, generateSignals, formatKZT,
} from '@/lib/metrics';
import type { AggregationPeriod, DateRange, Signal } from '@/lib/types';

const CHART_COLORS = ['#1E3A5F', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
const EMPTY_CHART_URL = 'https://mgx-backend-cdn.metadl.com/generate/images/977836/2026-02-19/7965a3e5-68d6-4367-bc84-3890e3b4889b.png';

export default function DashboardPage() {
  const navigate = useNavigate();
  const session = getSession();
  const [period, setPeriod] = useState<AggregationPeriod>('month');
  const [dateRange, setDateRange] = useState<'30d' | '90d' | '180d' | 'all'>('180d');
  const [signals, setSignalsState] = useState<Signal[]>([]);

  useEffect(() => {
    if (!session) {
      navigate('/');
      return;
    }
  }, [session, navigate]);

  const companyId = session?.companyId || '';

  // Load data
  const transactions = useMemo(() => getTransactions(companyId), [companyId]);
  const customers = useMemo(() => getCustomers(companyId), [companyId]);
  const invoices = useMemo(() => getInvoices(companyId), [companyId]);
  const marketingSpend = useMemo(() => getMarketingSpend(companyId), [companyId]);
  const documents = useMemo(() => getDocuments(companyId), [companyId]);

  // Calculate date range
  const range: DateRange | undefined = useMemo(() => {
    if (dateRange === 'all') return undefined;
    const now = new Date();
    const days = dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 180;
    const from = new Date(now);
    from.setDate(from.getDate() - days);
    return {
      from: from.toISOString().split('T')[0],
      to: now.toISOString().split('T')[0],
    };
  }, [dateRange]);

  // Financial metrics
  const summary = useMemo(() => calculateFinancialSummary(transactions, range), [transactions, range]);
  const cashflow = useMemo(() => calculateCashflow(transactions, period, range), [transactions, period, range]);
  const expenseCategories = useMemo(() => calculateCategoryBreakdown(transactions, 'expense', range), [transactions, range]);
  const investorMetrics = useMemo(() => calculateInvestorMetrics(customers, invoices, marketingSpend), [customers, invoices, marketingSpend]);
  const unpaidInvoices = useMemo(() => calculateUnpaidInvoices(invoices), [invoices]);

  // Signals
  useEffect(() => {
    if (!companyId) return;
    const existing = getSignals(companyId);
    const newSignals = generateSignals(companyId, transactions, invoices, documents, existing);
    // Merge: keep existing open signals, add new ones
    const existingOpen = existing.filter(s => s.status === 'open');
    const existingTypes = new Set(existingOpen.map(s => s.type));
    const merged = [...existingOpen, ...newSignals.filter(s => !existingTypes.has(s.type))];
    const closed = existing.filter(s => s.status === 'closed');
    const all = [...merged, ...closed];
    setSignals(companyId, all);
    setSignalsState(all);
  }, [companyId, transactions, invoices, documents]);

  const handleCloseSignal = useCallback((signalId: string) => {
    closeSignalInStore(signalId);
    setSignalsState(prev => prev.map(s => s.id === signalId ? { ...s, status: 'closed' as const } : s));
  }, []);

  const handleSeedDemo = () => {
    if (!companyId) return;
    seedDemoData(companyId);
    window.location.reload();
  };

  // Export transactions to CSV
  const handleExportCSV = () => {
    const headers = ['Дата', 'Сумма', 'Направление', 'Категория', 'Контрагент', 'Описание'];
    const rows = transactions.map(t => [
      t.date, t.amount, t.direction === 'income' ? 'Доход' : 'Расход',
      t.category, t.counterparty || '', t.description || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!session) return null;

  const hasData = transactions.length > 0;

  return (
    <AppLayout>
      <div className="p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Финансовый дашборд</h1>
            <p className="text-sm text-slate-500 mt-1">Весь бизнес на одном экране</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">30 дней</SelectItem>
                <SelectItem value="90d">90 дней</SelectItem>
                <SelectItem value="180d">180 дней</SelectItem>
                <SelectItem value="all">Всё время</SelectItem>
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={(v) => setPeriod(v as AggregationPeriod)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">По дням</SelectItem>
                <SelectItem value="week">По неделям</SelectItem>
                <SelectItem value="month">По месяцам</SelectItem>
              </SelectContent>
            </Select>
            {hasData && (
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button>
            )}
          </div>
        </div>

        {/* Empty State */}
        {!hasData && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
            <img src={EMPTY_CHART_URL} alt="" className="h-32 w-32 mx-auto mb-6 opacity-80" />
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Нет данных</h2>
            <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
              Загрузите файл с транзакциями или используйте демо-данные, чтобы увидеть дашборд в действии.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={() => navigate('/uploads')} className="bg-[#1E3A5F] hover:bg-[#1E3A5F]/90">
                Загрузить данные
              </Button>
              <Button variant="outline" onClick={handleSeedDemo}>
                Демо-данные
              </Button>
            </div>
          </div>
        )}

        {hasData && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <KPICard
                title="Выручка"
                value={formatKZT(summary.totalRevenue)}
                icon={<DollarSign className="h-5 w-5" />}
                variant="success"
                subtitle="за период"
              />
              <KPICard
                title="Расходы"
                value={formatKZT(summary.totalExpenses)}
                icon={<TrendingDown className="h-5 w-5" />}
                variant="danger"
                subtitle="за период"
              />
              <KPICard
                title="Прибыль"
                value={formatKZT(summary.profit)}
                icon={<TrendingUp className="h-5 w-5" />}
                variant={summary.profit >= 0 ? 'success' : 'danger'}
                subtitle="за период"
              />
              <KPICard
                title="Маржа"
                value={`${summary.grossMarginPercent.toFixed(1)}%`}
                icon={<Percent className="h-5 w-5" />}
                variant={summary.grossMarginPercent > 20 ? 'success' : 'warning'}
              />
              <KPICard
                title="Дебиторка"
                value={formatKZT(unpaidInvoices.totalUnpaid)}
                icon={<ArrowDownUp className="h-5 w-5" />}
                subtitle={`${unpaidInvoices.count} счетов`}
                variant={unpaidInvoices.count > 0 ? 'warning' : 'default'}
              />
            </div>

            {/* Charts + Signals Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Charts */}
              <div className="lg:col-span-2 space-y-6">
                {/* Revenue vs Expenses */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-slate-900 mb-4">Выручка vs Расходы</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={cashflow}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="period" tick={{ fontSize: 12 }} stroke="#94A3B8" />
                      <YAxis tick={{ fontSize: 12 }} stroke="#94A3B8" tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                      <Tooltip
                        formatter={(value: number) => formatKZT(value)}
                        labelStyle={{ fontWeight: 600 }}
                        contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0' }}
                      />
                      <Legend />
                      <Bar dataKey="income" name="Доход" fill="#10B981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expense" name="Расход" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Cashflow Trend */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-slate-900 mb-4">Cashflow (нетто)</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={cashflow}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="period" tick={{ fontSize: 12 }} stroke="#94A3B8" />
                      <YAxis tick={{ fontSize: 12 }} stroke="#94A3B8" tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                      <Tooltip
                        formatter={(value: number) => formatKZT(value)}
                        contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="net"
                        name="Нетто"
                        stroke="#1E3A5F"
                        strokeWidth={2.5}
                        dot={{ fill: '#1E3A5F', r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Signals Panel */}
              <div className="space-y-6">
                <SignalsPanel signals={signals} onClose={handleCloseSignal} />

                {/* Expense by Category */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-slate-900 mb-4">Расходы по категориям</h3>
                  {expenseCategories.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={expenseCategories.slice(0, 6)}
                            dataKey="amount"
                            nameKey="category"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            innerRadius={40}
                          >
                            {expenseCategories.slice(0, 6).map((_, idx) => (
                              <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatKZT(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2 mt-3">
                        {expenseCategories.slice(0, 5).map((cat, idx) => (
                          <div key={cat.category} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                              />
                              <span className="text-slate-600 truncate">{cat.category}</span>
                            </div>
                            <span className="text-slate-900 font-medium">{cat.percent.toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-8">Нет данных о расходах</p>
                  )}
                </div>
              </div>
            </div>

            {/* Investor Metrics */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[#1E3A5F]" />
                  <h3 className="text-base font-semibold text-slate-900">Инвесторские метрики</h3>
                </div>
                {investorMetrics.missingData.length > 0 && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Требуются: {investorMetrics.missingData.join(', ')}
                  </Badge>
                )}
              </div>

              {investorMetrics.available ? (
                <Tabs defaultValue="overview">
                  <TabsList>
                    <TabsTrigger value="overview">Обзор</TabsTrigger>
                    <TabsTrigger value="ltv">LTV / CAC</TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="mt-4">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <KPICard
                        title="Всего клиентов"
                        value={String(investorMetrics.totalCustomers)}
                        icon={<Users className="h-5 w-5" />}
                      />
                      <KPICard
                        title="Активных"
                        value={String(investorMetrics.activeCustomers)}
                        subtitle={`${investorMetrics.retentionRate.toFixed(0)}% retention`}
                        icon={<Target className="h-5 w-5" />}
                        variant="success"
                      />
                      <KPICard
                        title="ARPA"
                        value={formatKZT(investorMetrics.avgRevenuePerCustomer)}
                        subtitle="средний доход/клиент"
                      />
                      <KPICard
                        title="LTV (среднее)"
                        value={formatKZT(investorMetrics.ltvAvg)}
                        variant="success"
                      />
                    </div>
                  </TabsContent>
                  <TabsContent value="ltv" className="mt-4">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                      <KPICard
                        title="LTV (среднее)"
                        value={formatKZT(investorMetrics.ltvAvg)}
                        variant="success"
                      />
                      <KPICard
                        title="CAC"
                        value={investorMetrics.cacAvg !== null ? formatKZT(investorMetrics.cacAvg) : 'Нет данных'}
                        subtitle={investorMetrics.cacAvg === null ? 'Загрузите marketing_spend' : 'стоимость привлечения'}
                        variant={investorMetrics.cacAvg !== null ? 'default' : 'warning'}
                      />
                      <KPICard
                        title="LTV:CAC"
                        value={investorMetrics.ltvCacRatio !== null ? `${investorMetrics.ltvCacRatio.toFixed(1)}x` : 'Нет данных'}
                        subtitle={investorMetrics.ltvCacRatio !== null
                          ? (investorMetrics.ltvCacRatio >= 3 ? 'Отличный показатель' : investorMetrics.ltvCacRatio >= 1 ? 'Приемлемо' : 'Требует внимания')
                          : ''}
                        variant={investorMetrics.ltvCacRatio !== null
                          ? (investorMetrics.ltvCacRatio >= 3 ? 'success' : investorMetrics.ltvCacRatio >= 1 ? 'warning' : 'danger')
                          : 'default'}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
                  <p className="text-sm text-slate-600 font-medium">Для расчёта LTV/CAC необходимы данные</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Загрузите файлы: {investorMetrics.missingData.join(', ')}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => navigate('/uploads')}
                  >
                    Загрузить данные
                  </Button>
                </div>
              )}
            </div>

            {/* Transactions Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="p-5 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">
                    Транзакции ({transactions.length})
                  </h3>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="text-left px-5 py-3 font-medium text-slate-500">Дата</th>
                      <th className="text-left px-5 py-3 font-medium text-slate-500">Категория</th>
                      <th className="text-left px-5 py-3 font-medium text-slate-500">Контрагент</th>
                      <th className="text-left px-5 py-3 font-medium text-slate-500">Описание</th>
                      <th className="text-right px-5 py-3 font-medium text-slate-500">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .slice(0, 50)
                      .map((txn) => (
                        <tr key={txn.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="px-5 py-3 text-slate-600">
                            {new Date(txn.date).toLocaleDateString('ru-KZ')}
                          </td>
                          <td className="px-5 py-3">
                            <Badge variant="outline" className="text-xs">
                              {txn.category}
                            </Badge>
                          </td>
                          <td className="px-5 py-3 text-slate-600 truncate max-w-[200px]">
                            {txn.counterparty || '—'}
                          </td>
                          <td className="px-5 py-3 text-slate-500 truncate max-w-[200px]">
                            {txn.description || '—'}
                          </td>
                          <td className={`px-5 py-3 text-right font-medium ${txn.direction === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {txn.direction === 'income' ? '+' : '-'}{formatKZT(txn.amount)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {transactions.length > 50 && (
                <div className="p-4 text-center border-t border-slate-100">
                  <p className="text-xs text-slate-400">
                    Показаны последние 50 из {transactions.length} транзакций
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}