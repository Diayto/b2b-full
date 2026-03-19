import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import ControlTowerKpiCard from '@/components/controltower/ControlTowerKpiCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MetricHelpIcon from '@/components/controltower/MetricHelpIcon';
import SectionHeader from '@/components/controltower/SectionHeader';
import RankedListItem from '@/components/controltower/RankedListItem';
import EmptyStateCard from '@/components/controltower/EmptyStateCard';
import { useChartTheme, buildAxisTick, buildTooltipStyle, CHART_MARGIN } from '@/lib/chartStyles';
import {
  AlertTriangle,
  Bolt,
  Clock,
  DollarSign,
  LayoutGrid,
} from 'lucide-react';
import type { DateRange } from '@/lib/types';
import { calculateRevenueControlTowerAnalytics } from '@/lib/analytics';
import type { RevenueControlTowerAnalytics } from '@/lib/analytics/revenueControlTower';
import RecommendationsCard from '@/components/RecommendationsCard';
import { buildRecommendations } from '@/lib/recommendations';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getChannelCampaigns,
  getCustomers,
  getDeals,
  getInvoices,
  getLeads,
  getManagers,
  getMarketingSpend,
  getPayments,
  getUploads,
  getSession,
  seedDemoData,
} from '@/lib/store';
import { formatKZT } from '@/lib/metrics';

function formatDateRu(dateYmd?: string): string {
  if (!dateYmd) return '—';
  try {
    return new Date(dateYmd + 'T00:00:00').toLocaleDateString('ru-KZ');
  } catch {
    return dateYmd;
  }
}

const actionTypeLabelMap: Record<string, string> = {
  collect_overdue_invoice: 'Собрать просроченные оплаты',
  follow_up_unpaid_invoice: 'Напомнить по неоплаченным счетам',
  reengage_stalled_deal: 'Разморозить застрявшие сделки',
  prioritize_delayed_customer: 'Переопределить приоритет на клиентов с задержкой оплат',
};

export default function SalesCashPrioritiesPage() {
  const navigate = useNavigate();
  const session = getSession();
  const chartTheme = useChartTheme();
  const axisTick = buildAxisTick(chartTheme);
  const tooltipStyle = buildTooltipStyle(chartTheme);

  const [dateRange, setDateRange] = useState<'30d' | '90d' | '180d' | 'all'>('180d');

  useEffect(() => {
    if (!session) navigate('/');
  }, [session, navigate]);

  const companyId = session?.companyId || '';

  // Load data
  const customers = useMemo(() => getCustomers(companyId), [companyId]);
  const invoices = useMemo(() => getInvoices(companyId), [companyId]);
  const marketingSpend = useMemo(() => getMarketingSpend(companyId), [companyId]);
  const payments = useMemo(() => getPayments(companyId), [companyId]);
  const channelCampaigns = useMemo(() => getChannelCampaigns(companyId), [companyId]);
  const leads = useMemo(() => getLeads(companyId), [companyId]);
  const deals = useMemo(() => getDeals(companyId), [companyId]);
  const managers = useMemo(() => getManagers(companyId), [companyId]);
  const uploads = useMemo(() => getUploads(companyId), [companyId]);

  const analyticsRange: DateRange = useMemo(() => {
    if (dateRange !== 'all') {
      const now = new Date();
      const days = dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 180;
      const from = new Date(now);
      from.setDate(from.getDate() - days);
      return { from: from.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
    }

    // “All time” => derive range from available data (so inflow/outstanding windows still work).
    const candidates: string[] = [];
    for (const p of payments) if (p.paymentDate) candidates.push(p.paymentDate);
    for (const inv of invoices) {
      if (inv.invoiceDate) candidates.push(inv.invoiceDate);
      if (inv.dueDate) candidates.push(inv.dueDate);
    }
    for (const l of leads) if (l.createdDate) candidates.push(l.createdDate);
    for (const d of deals) if (d.createdDate) candidates.push(d.createdDate);
    for (const ms of marketingSpend) candidates.push(`${ms.month}-01`);

    const valid = candidates
      .filter((s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s))
      .map((s) => new Date(s + 'T00:00:00').getTime())
      .filter((t) => Number.isFinite(t));

    const now = new Date();
    const fallbackFrom = new Date(now);
    fallbackFrom.setDate(fallbackFrom.getDate() - 180);

    if (valid.length === 0) {
      return { from: fallbackFrom.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
    }

    const minT = Math.min(...valid);
    const maxT = Math.max(...valid);
    return { from: new Date(minT).toISOString().split('T')[0], to: new Date(maxT).toISOString().split('T')[0] };
  }, [dateRange, payments, invoices, leads, deals, marketingSpend]);

  const analytics: RevenueControlTowerAnalytics = useMemo(
    () =>
      calculateRevenueControlTowerAnalytics({
        dateRange: analyticsRange,
        channelCampaigns,
        leads,
        deals,
        invoices,
        payments,
        customers,
        marketingSpend,
        managers,
      }),
    [analyticsRange, channelCampaigns, leads, deals, invoices, payments, customers, marketingSpend, managers]
  );

  const hasAnyData =
    channelCampaigns.length > 0 ||
    leads.length > 0 ||
    deals.length > 0 ||
    invoices.length > 0 ||
    payments.length > 0 ||
    marketingSpend.length > 0 ||
    uploads.length > 0;

  const channelNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const cc of channelCampaigns) m.set(cc.channelCampaignExternalId, cc.name);
    return m;
  }, [channelCampaigns]);

  const recommendationItems = useMemo(
    () =>
      buildRecommendations({
        surface: 'sales_cash',
        analytics,
        channelNameById,
        formatMoney: formatKZT,
        maxItems: 3,
      }),
    [analytics, channelNameById]
  );

  const overdueInvoicesCount = analytics.salesCashPriority.overdueInvoices.length;
  const unpaidInvoicesCount = analytics.salesCashPriority.unpaidInvoices.length;

  const handleSeedDemo = () => {
    if (!companyId) return;
    seedDemoData(companyId);
    window.location.reload();
  };

  if (!session) return null;

  return (
    <AppLayout>
      <div className="rct-page p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="rct-page-title">Где застряли деньги</h1>
            <p className="rct-body-micro text-muted-foreground mt-1">
              Где выручка “застревает” и какие действия нужны в первую очередь.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">30 дней</SelectItem>
                <SelectItem value="90d">90 дней</SelectItem>
                <SelectItem value="180d">180 дней</SelectItem>
                <SelectItem value="all">Всё время</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => navigate('/uploads')}>
              Открыть загрузки
            </Button>
            <Button variant="outline" onClick={() => navigate('/marketing')}>
              Маркетинг → Выручка
            </Button>
            <Button onClick={() => handleSeedDemo()}>
              Демо-данные
            </Button>
          </div>
        </div>

        {!hasAnyData ? (
          <EmptyStateCard
            title="Нет данных для приоритетов"
            description="Нужна цепочка: маркетинг → лиды → сделки → счета → оплаты. Импортируйте данные или нажмите «Демо-данные» — и мы заполним экран сценариями для показа."
            ctaLabel="Демо-данные"
            onCta={handleSeedDemo}
            secondaryCtaLabel="Перейти в Загрузки"
            onSecondaryCta={() => navigate('/uploads')}
          />
        ) : (
          <>
            {/* Top summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <ControlTowerKpiCard
                title="Застрявшие сделки"
                value={String(analytics.salesCashPriority.stalledDeals.length)}
                subtitle="включая сделки без активности"
                status={analytics.salesCashPriority.stalledDeals.length > 0 ? 'warning' : 'success'}
                icon={
                  <span className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    <MetricHelpIcon helpKey="stalled_deals" />
                  </span>
                }
              />

              <ControlTowerKpiCard
                title="Неоплаченные счета"
                value={String(unpaidInvoicesCount)}
                subtitle="остаток по неоплаченным"
                status={unpaidInvoicesCount > 0 ? 'warning' : 'success'}
                icon={
                  <span className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    <MetricHelpIcon helpKey="unpaid_invoices" />
                  </span>
                }
              />

              <ControlTowerKpiCard
                title="Просрочено"
                value={formatKZT(analytics.overdueAmount.value)}
                subtitle={`${overdueInvoicesCount} счет(ов) с просрочкой`}
                status={overdueInvoicesCount > 0 ? 'warning' : 'success'}
                icon={
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    <MetricHelpIcon helpKey="overdue_invoices" />
                  </span>
                }
              />

              <ControlTowerKpiCard
                title="Клиенты с задержкой"
                value={String(analytics.salesCashPriority.delayedCustomers.length)}
                subtitle="с проблемой оплаты"
                status={analytics.salesCashPriority.delayedCustomers.length > 0 ? 'warning' : 'default'}
                icon={
                  <span className="flex items-center gap-2">
                    <LayoutGrid className="h-5 w-5" />
                    <MetricHelpIcon helpKey="delayed_customers" />
                  </span>
                }
              />
            </div>

            <RecommendationsCard
              title="Приоритеты на сегодня"
              description="Коротко: что мешает деньгам и какой следующий шаг даст эффект."
              items={recommendationItems}
              helpKey="priority_actions"
              compact
            />

            {/* Main grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Left: Deals + Invoices */}
              <div className="space-y-6 xl:col-span-2">
                {/* Stalled deals */}
                <Card className="rct-card">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                      Застрявшие / без активности сделки
                      <MetricHelpIcon helpKey="stalled_deals" />
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Сделки, которые дольше ожидания остаются open и/или теряют темп — это один из главных рычагов конверсии.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {analytics.salesCashPriority.stalledDeals.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Нет застрявших сделок в выбранном периоде.</p>
                    ) : (
                      (() => {
                        const today = new Date();
                        const todayTs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

                        const bucketForDays = (daysLate: number) => {
                          if (daysLate <= 7) return '0–7 дней';
                          if (daysLate <= 14) return '8–14 дней';
                          if (daysLate <= 30) return '15–30 дней';
                          return '30+ дней';
                        };

                        const buckets = [
                          { label: '0–7 дней', min: 0, max: 7 },
                          { label: '8–14 дней', min: 8, max: 14 },
                          { label: '15–30 дней', min: 15, max: 30 },
                          { label: '30+ дней', min: 31, max: Infinity },
                        ];

                        const perBucket = buckets.map((b) => ({ label: b.label, count: 0, amount: 0 }));
                        const normalized = analytics.salesCashPriority.stalledDeals.map((d) => {
                          const ts = d.lastActivityDate ? new Date(d.lastActivityDate + 'T00:00:00').getTime() : NaN;
                          const ageDays = Number.isFinite(ts) ? Math.max(0, Math.floor((todayTs - ts) / 86_400_000)) : 0;
                          const label = bucketForDays(ageDays);
                          const bucketIdx = buckets.findIndex((b) => label === b.label);
                          return { ...d, ageDays, bucketIdx, bucketLabel: label };
                        });

                        for (const d of normalized) {
                          if (d.bucketIdx < 0) continue;
                          perBucket[d.bucketIdx].count += 1;
                          perBucket[d.bucketIdx].amount += d.overdueAmountLinked;
                        }

                        const listTop = normalized
                          .slice()
                          .sort((a, b) => b.overdueAmountLinked - a.overdueAmountLinked)
                          .slice(0, 10);

                        const maxAmount = Math.max(1, ...perBucket.map((b) => b.amount));

                        return (
                          <div className="space-y-4">
                            <div className="rct-card-inset p-3.5">
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <p className="text-sm font-semibold text-foreground">Сколько “зависло” по возрасту</p>
                                <Badge variant="outline" className="text-xs">
                                  риск-сумма
                                </Badge>
                              </div>
                              <div className="space-y-3">
                                {perBucket.map((b) => {
                                  const w = Math.round((b.amount / maxAmount) * 100);
                                  return (
                                    <div key={b.label} className="space-y-1">
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-xs font-medium text-muted-foreground">{b.label}</span>
                                        <span className="text-xs font-semibold text-foreground whitespace-nowrap">
                                          {b.count} · {formatKZT(b.amount)}
                                        </span>
                                      </div>
                                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                                        <div className="h-full bg-rose-400/70 dark:bg-rose-500/60 rounded-full" style={{ width: `${w}%` }} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="space-y-2">
                              {listTop.map((d) => (
                                <div
                                  key={d.dealExternalId}
                                  className="rct-card-inset p-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-foreground truncate">
                                        {d.dealExternalId}
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        активность: {formatDateRu(d.lastActivityDate)} · возраст: {d.bucketLabel}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-xs font-medium text-muted-foreground">Сумма риска</p>
                                      <p className="text-sm font-semibold text-foreground whitespace-nowrap">{formatKZT(d.overdueAmountLinked)}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {analytics.salesCashPriority.stalledDeals.length > 10 ? (
                              <p className="text-xs text-muted-foreground">Показаны топ-10. Остальные — по запросу.</p>
                            ) : null}
                          </div>
                        );
                      })()
                    )}
                  </CardContent>
                </Card>

                {/* Invoices — hero: receivables aging */}
                <Card className="rct-card-raised">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                      Неоплаченные и просроченные счета
                      <MetricHelpIcon helpKey="risk_flags" />
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Счета — это “деньги на очереди”. Начните со срока оплаты и остатка.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {(() => {
                      const today = new Date();
                      const todayTs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

                      const overdueInvoices = analytics.salesCashPriority.overdueInvoices;
                      const unpaidInvoices = analytics.salesCashPriority.unpaidInvoices;
                      const delayedCustomers = analytics.salesCashPriority.delayedCustomers;

                      const overdueTotal = overdueInvoices.reduce((s, x) => s + x.overdueAmount, 0);
                      const unpaidTotal = unpaidInvoices.reduce((s, x) => s + x.outstanding, 0);
                      const delayedTotal = delayedCustomers.reduce((s, x) => s + x.overdueAmount, 0);
                      const nonOverdueUnpaid = Math.max(0, unpaidTotal - overdueTotal);

                      const bucketDefs = [
                        { label: '0–7 дней', max: 7 },
                        { label: '8–14 дней', max: 14 },
                        { label: '15–30 дней', max: 30 },
                        { label: '30+ дней', max: Infinity },
                      ];

                      const bucketTotals = bucketDefs.map((b) => ({ label: b.label, amount: 0 }));

                      for (const inv of unpaidInvoices) {
                        const due = inv.dueDate ?? inv.invoiceDate;
                        if (!due) continue;
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;
                        const dueTs = new Date(due + 'T00:00:00').getTime();
                        if (!Number.isFinite(dueTs)) continue;
                        let daysLate = Math.floor((todayTs - dueTs) / 86_400_000);
                        if (!Number.isFinite(daysLate)) continue;
                        if (daysLate < 0) daysLate = 0;
                        const idx = bucketDefs.findIndex((b) => daysLate <= b.max);
                        if (idx < 0) continue;
                        bucketTotals[idx].amount += inv.outstanding;
                      }

                      const maxBucket = Math.max(1, ...bucketTotals.map((b) => b.amount));

                      const rankedOverdue = overdueInvoices
                        .slice()
                        .sort((a, b) => b.overdueAmount - a.overdueAmount)
                        .slice(0, 7);
                      const maxOverdue = Math.max(1, ...rankedOverdue.map((x) => x.overdueAmount));

                      return (
                        <div className="space-y-6">
                          {/* Money stuck breakdown — stat boxes */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="rct-stat-box-amber">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Просрочка</div>
                              <div className="text-xl font-bold text-foreground mt-2">{formatKZT(overdueTotal)}</div>
                              <div className="text-xs text-muted-foreground mt-1">{overdueInvoices.length} счет(ов)</div>
                            </div>
                            <div className="rct-stat-box-slate">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Неоплачено</div>
                              <div className="text-xl font-bold text-foreground mt-2">{formatKZT(nonOverdueUnpaid)}</div>
                              <div className="text-xs text-muted-foreground mt-1">остаток без просрочки</div>
                            </div>
                            <div className="rct-stat-box-emerald">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Задержка</div>
                              <div className="text-xl font-bold text-foreground mt-2">{formatKZT(delayedTotal)}</div>
                              <div className="text-xs text-muted-foreground mt-1">{delayedCustomers.length} клиента(ов)</div>
                            </div>
                          </div>

                          {/* Receivables aging */}
                          <div className="rct-card-inset p-3">
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <p className="text-sm font-semibold text-foreground">Анализ дебиторки по срокам</p>
                              <Badge variant="outline" className="text-xs">
                                buckets: 0–7 / 8–14 / 15–30 / 30+
                              </Badge>
                            </div>
                            <div className="h-[230px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  data={bucketTotals}
                                  layout="vertical"
                                  margin={CHART_MARGIN}
                                >
                                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                                  <XAxis type="number" tick={axisTick} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} axisLine={false} />
                                  <YAxis dataKey="label" type="category" width={140} tick={axisTick} />
                                  <RechartsTooltip
                                    contentStyle={tooltipStyle.contentStyle}
                                    wrapperStyle={tooltipStyle.wrapperStyle}
                                    formatter={(value: unknown) => {
                                      if (!Number.isFinite(Number(value))) return '—';
                                      return formatKZT(Number(value));
                                    }}
                                  />
                                  <Bar dataKey="amount" fill="#B86B7A" barSize={8} radius={[4, 4, 0, 0]}>
                                    {/* keep single series */}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="mt-3 space-y-2">
                              {bucketTotals.map((b) => {
                                const w = Math.round((b.amount / maxBucket) * 100);
                                return (
                                  <div key={b.label} className="space-y-1">
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-xs font-medium text-muted-foreground">{b.label}</span>
                                      <span className="text-xs font-semibold text-foreground whitespace-nowrap">{formatKZT(b.amount)}</span>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                      <div className="h-full bg-rose-400/70 dark:bg-rose-500/60 rounded-full" style={{ width: `${w}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Overdue ranked */}
                          <div className="rct-card-inset p-3">
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <p className="text-sm font-semibold text-foreground">Просроченные счета (топ)</p>
                              <Badge variant="outline" className="text-xs">
                                {overdueInvoices.length ? 'приоритет' : 'нет'}
                              </Badge>
                            </div>
                            {rankedOverdue.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Просрочек нет — отлично.</p>
                            ) : (
                              <div className="space-y-3">
                                {rankedOverdue.map((inv) => (
                                  <RankedListItem
                                    key={inv.invoiceExternalId ?? `${inv.customerExternalId}_${inv.dueDate}`}
                                    label={inv.invoiceExternalId ?? 'Счёт'}
                                    sublabel={`клиент: ${inv.customerExternalId ?? '—'} · due: ${formatDateRu(inv.dueDate)}`}
                                    value={formatKZT(inv.overdueAmount)}
                                    progressPct={Math.round((inv.overdueAmount / maxOverdue) * 100)}
                                    barColor="rose"
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>

              {/* Right: Delayed customers + Priority actions */}
              <div className="space-y-6">
                <Card className="rct-card">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                      Клиенты с задержкой оплат
                      <MetricHelpIcon helpKey="delayed_customers" />
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">Если “проблема у клиента”, приоритет должен быть на ускорение оплат.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {analytics.salesCashPriority.delayedCustomers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Нет клиентов с задержкой по данным в периоде.</p>
                    ) : (
                      (() => {
                        const top = analytics.salesCashPriority.delayedCustomers
                          .slice()
                          .sort((a, b) => b.overdueAmount - a.overdueAmount)
                          .slice(0, 8);
                        const max = Math.max(1, ...top.map((c) => c.overdueAmount));

                        return (
                          <div className="space-y-3">
                            {top.map((c) => (
                              <RankedListItem
                                key={c.customerExternalId}
                                label={c.customerExternalId}
                                sublabel={`${c.overdueInvoiceCount} просроченных счетов`}
                                value={formatKZT(c.overdueAmount)}
                                progressPct={Math.round((c.overdueAmount / max) * 100)}
                                barColor="amber"
                              />
                            ))}
                          </div>
                        );
                      })()
                    )}
                  </CardContent>
                </Card>

                <Card className="rct-card">
                  <CardHeader className="rct-card-padding pb-2">
                    <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                      Приоритетные действия
                      <MetricHelpIcon helpKey="priority_actions" />
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">3–5 действий, которые сильнее всего влияют на деньги и сроки.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {analytics.salesCashPriority.priorityActionCandidates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Нет кандидатов по действиям для выбранного периода.</p>
                    ) : (
                      <div className="space-y-3">
                        {analytics.salesCashPriority.priorityActionCandidates.slice(0, 7).map((a) => (
                          <div key={a.id} className="rct-card-inset p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">
                                  {actionTypeLabelMap[a.type] ?? a.type}
                                </p>
                                <div className="flex gap-2 mt-2 flex-wrap">
                                  <Badge variant="outline" className="text-xs">
                                    {a.area === 'cashflow' ? 'cash' : a.area === 'sales' ? 'sales' : 'revenue'}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={
                                      a.priority === 'high'
                                        ? 'text-rose-600 dark:text-rose-400 border-rose-300/60 dark:border-rose-800/40'
                                        : a.priority === 'medium'
                                          ? 'text-yellow-700 dark:text-yellow-400 border-yellow-300/60 dark:border-yellow-800/40'
                                          : 'text-primary border-primary/30'
                                    }
                                  >
                                    {a.priority === 'high' ? 'Высокий' : a.priority === 'medium' ? 'Средний' : 'Низкий'}
                                  </Badge>
                                </div>
                              </div>
                              <Bolt className="h-4 w-4 text-primary mt-0.5" />
                            </div>

                            <div className="mt-3 text-sm text-muted-foreground space-y-1">
                              {a.facts.slice(0, 3).map((fact, idx) => (
                                <p key={idx} className="text-xs">
                                  • {fact}
                                </p>
                              ))}
                            </div>

                            {a.targetExternalIds.length > 0 ? (
                              <div className="mt-3">
                                <p className="text-xs text-muted-foreground mb-1">Цели (id):</p>
                                <div className="flex flex-wrap gap-2">
                                  {a.targetExternalIds.slice(0, 3).map((tid) => (
                                    <Badge key={tid} variant="outline" className="text-[11px] max-w-[160px] truncate">
                                      {tid}
                                    </Badge>
                                  ))}
                                  {a.targetExternalIds.length > 3 ? (
                                    <Badge variant="outline" className="text-[11px]">
                                      +{a.targetExternalIds.length - 3}
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

