// ============================================================
// BizPulse KZ — Marketing → Revenue Intelligence Panel
// ============================================================

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import ControlTowerKpiCard from '@/components/controltower/ControlTowerKpiCard';
import SectionHeader from '@/components/controltower/SectionHeader';
import RankedListItem from '@/components/controltower/RankedListItem';
import EmptyStateCard from '@/components/controltower/EmptyStateCard';
import { CollapsibleSection } from '@/components/controltower';
import {
  useChartTheme,
  buildAxisTick,
  buildTooltipStyle,
  buildLegendStyle,
  CHART_MARGIN,
  CHART_COLORS,
  truncateLabel,
} from '@/lib/chartStyles';
import type { DateRange } from '@/lib/types';
import {
  getSession,
  getChannelCampaigns,
  getLeads,
  getDeals,
  getInvoices,
  getPayments,
  getCustomers,
  getMarketingSpend,
  getManagers,
  seedDemoData,
} from '@/lib/store';
import { calculateRevenueControlTowerAnalytics } from '@/lib/analytics';
import { formatKZT } from '@/lib/metrics';
import type { RevenueControlTowerAnalytics } from '@/lib/analytics/revenueControlTower';
import RecommendationsCard from '@/components/RecommendationsCard';
import { buildRecommendations } from '@/lib/recommendations';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

function percentFromRatio(r: number): string {
  if (!Number.isFinite(r)) return '—';
  return `${(r * 100).toFixed(1)}%`;
}

function moneyOrDash(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return formatKZT(value);
}

function calculationBadge(mode: 'exact' | 'fallback' | undefined): string | null {
  return mode === 'fallback' ? 'по неполным связям' : null;
}

function getDateRangeFromSelection(params: {
  selection: '30d' | '90d' | '180d' | 'all';
  payments: Array<{ paymentDate?: string }>;
  invoices: Array<{ invoiceDate: string; dueDate?: string }>;
  leads: Array<{ createdDate?: string }>;
  deals: Array<{ createdDate?: string }>;
  marketingSpend: Array<{ month: string }>;
}): DateRange {
  const { selection, payments, invoices, leads, deals, marketingSpend } = params;

  if (selection !== 'all') {
    const now = new Date();
    const days = selection === '30d' ? 30 : selection === '90d' ? 90 : 180;
    const from = new Date(now);
    from.setDate(from.getDate() - days);
    return { from: from.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
  }

  const candidates: string[] = [];
  for (const p of payments) if (p.paymentDate) candidates.push(p.paymentDate);
  for (const inv of invoices) {
    if (inv.invoiceDate) candidates.push(inv.invoiceDate);
    if (inv.dueDate) candidates.push(inv.dueDate);
  }
  for (const l of leads) if (l.createdDate) candidates.push(l.createdDate);
  for (const d of deals) if (d.createdDate) candidates.push(d.createdDate);
  for (const ms of marketingSpend) {
    if (/^\d{4}-\d{2}$/.test(ms.month)) candidates.push(`${ms.month}-01`);
  }

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
}

function FunnelMiniBar({
  items,
}: {
  items: Array<{ label: string; value: number; pct: string | null; colorIdx: number }>;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const colors = [
    'bg-foreground/50',
    'bg-primary/60',
    'bg-teal-600/60 dark:bg-teal-500/50',
    'bg-teal-500/60 dark:bg-teal-400/50',
  ];
  return (
    <div className="space-y-2.5">
      {items.map((s) => {
        const w = Math.round((s.value / max) * 100);
        return (
          <div key={s.label} className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
              <span className="text-xs font-semibold text-foreground">{s.value}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full', colors[s.colorIdx] ?? 'bg-muted-foreground')} style={{ width: `${w}%` }} />
            </div>
            {s.pct ? <p className="text-[10px] text-muted-foreground">{s.pct} конв.</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export default function MarketingToRevenueDashboard() {
  const navigate = useNavigate();
  const session = getSession();

  if (!session) {
    navigate('/');
    return null;
  }

  const companyId = session.companyId;
  const [dateRange, setDateRange] = useState<'30d' | '90d' | '180d' | 'all'>('180d');
  const chartTheme = useChartTheme();

  const channelCampaigns = useMemo(() => getChannelCampaigns(companyId), [companyId]);
  const leads = useMemo(() => getLeads(companyId), [companyId]);
  const deals = useMemo(() => getDeals(companyId), [companyId]);
  const invoices = useMemo(() => getInvoices(companyId), [companyId]);
  const payments = useMemo(() => getPayments(companyId), [companyId]);
  const customers = useMemo(() => getCustomers(companyId), [companyId]);
  const marketingSpend = useMemo(() => getMarketingSpend(companyId), [companyId]);
  const managers = useMemo(() => getManagers(companyId), [companyId]);

  const analyticsRange: DateRange = useMemo(
    () =>
      getDateRangeFromSelection({
        selection: dateRange,
        payments,
        invoices,
        leads,
        deals,
        marketingSpend,
      }),
    [dateRange, payments, invoices, leads, deals, marketingSpend]
  );

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

  const channelNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const cc of channelCampaigns) m.set(cc.channelCampaignExternalId, cc.name);
    return m;
  }, [channelCampaigns]);

  const recommendationItems = useMemo(
    () =>
      buildRecommendations({
        surface: 'marketing',
        analytics,
        channelNameById,
        formatMoney: formatKZT,
        maxItems: 3,
      }),
    [analytics, channelNameById]
  );

  const handleSeedDemo = () => {
    if (!companyId) return;
    seedDemoData(companyId);
    window.location.reload();
  };

  const rows = analytics.paidRevenueBySource.rows;
  const hasCoreData = rows.length > 0 || leads.length > 0 || deals.length > 0 || marketingSpend.length > 0;

  const rowsSortedByLeads = useMemo(() => [...rows].sort((a, b) => b.leads - a.leads), [rows]);
  const rowsSortedByPaidRevenue = useMemo(() => [...rows].sort((a, b) => b.paidRevenue - a.paidRevenue), [rows]);

  const axisTick = buildAxisTick(chartTheme);
  const tooltipStyle = buildTooltipStyle(chartTheme);
  const legendStyle = buildLegendStyle(chartTheme);

  const bottleneck = useMemo(() => {
    return [
      { key: 'lead_to_deal', v: analytics.funnelDropOff.dropOffLeadToDeal, label: 'лид → сделка' },
      { key: 'deal_to_won', v: analytics.funnelDropOff.dropOffDealToWon, label: 'сделка → выигранная' },
      { key: 'won_to_paid', v: analytics.funnelDropOff.dropOffWonToPaid, label: 'выигранная → оплата' },
    ].sort((a, b) => b.v - a.v)[0];
  }, [analytics.funnelDropOff]);

  return (
    <div className="rct-page p-4 lg:p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="rct-page-title">Маркетинг → Выручка</h2>
          <p className="rct-body-micro mt-1">От лида до оплаты: где деньги, где потери, что делать</p>
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
          <Button variant="outline" onClick={() => navigate('/marketing/data')}>Открыть данные</Button>
          <Button variant="outline" onClick={() => navigate('/sales-cash')}>Sales/Cash</Button>
          <Button onClick={() => navigate('/uploads')}>Загрузки</Button>
        </div>
      </div>

      {/* Empty state */}
      {!hasCoreData && (
        <EmptyStateCard
          title="Нет данных для маркетинг→выручка"
          description="Импортируйте данные или создайте демо-набор."
          ctaLabel="Демо-данные"
          onCta={handleSeedDemo}
          secondaryCtaLabel="Перейти в Загрузки"
          onSecondaryCta={() => navigate('/uploads')}
        />
      )}

      {hasCoreData && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ControlTowerKpiCard
              title="CPL"
              value={analytics.cpl.value > 0 ? moneyOrDash(analytics.cpl.value) : '—'}
              subtitle={calculationBadge(analytics.cpl.calculationMode) ?? 'стоимость лида'}
              status={analytics.cpl.calculationMode === 'fallback' || analytics.cpl.value > 20000 ? 'warning' : 'success'}
              detail={{
                what: 'Стоимость привлечения одного лида',
                why: 'Чем ниже CPL при сохранении качества — тем дешевле вход в воронку.',
              }}
            />
            <ControlTowerKpiCard
              title="CAC"
              value={analytics.cac.value > 0 ? moneyOrDash(analytics.cac.value) : '—'}
              subtitle={calculationBadge(analytics.cac.calculationMode) ?? 'стоимость клиента'}
              status={analytics.cac.calculationMode === 'fallback' || analytics.cac.value > 400000 ? 'warning' : 'success'}
              detail={{
                what: 'Сколько стоит привлечение одного нового клиента',
                why: 'Главный рычаг для маркетингового бюджета.',
              }}
            />
            <ControlTowerKpiCard
              title="Цена выигранной сделки"
              value={analytics.costPerWonDeal.value > 0 ? moneyOrDash(analytics.costPerWonDeal.value) : '—'}
              subtitle={calculationBadge(analytics.costPerWonDeal.calculationMode) ?? 'маркетинг / won deals'}
              status={analytics.costPerWonDeal.calculationMode === 'fallback' || analytics.costPerWonDeal.value > 900000 ? 'warning' : 'success'}
              detail={{
                what: 'Маркетинговые расходы на одну выигранную сделку',
                why: 'Связывает маркетинг с реальными продажами, а не только лидами.',
              }}
            />
          </div>

          {/* Bottleneck indicator + funnel summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rct-card px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-rose-500 dark:text-rose-400" />
                <p className="text-sm font-semibold text-foreground">Bottleneck воронки</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Потери на шаге: <span className="font-medium text-foreground">{bottleneck.label}</span>
              </p>
              <div className="mt-2">
                <Badge variant="outline" className="text-xs text-rose-600 dark:text-rose-400 border-rose-300/60 dark:border-rose-800/40">
                  провал {percentFromRatio(bottleneck.v)}
                </Badge>
              </div>
            </div>

            <div className="lg:col-span-2 rct-card px-5 py-4">
              <p className="text-sm font-semibold text-foreground mb-3">Воронка</p>
              <FunnelMiniBar
                items={[
                  { label: 'Лиды', value: analytics.funnelDropOff.leads, pct: null, colorIdx: 0 },
                  { label: 'Сделки', value: analytics.funnelDropOff.deals, pct: percentFromRatio(analytics.funnelDropOff.leadToDealRate), colorIdx: 1 },
                  { label: 'Выигранные', value: analytics.funnelDropOff.wonDeals, pct: percentFromRatio(analytics.funnelDropOff.dealToWonRate), colorIdx: 2 },
                  { label: 'Оплачено', value: analytics.funnelDropOff.paidWonDeals, pct: percentFromRatio(analytics.funnelDropOff.wonToPaidRate), colorIdx: 3 },
                ]}
              />
            </div>
          </div>

          {/* Recommendations */}
          <RecommendationsCard
            title="Что делать дальше"
            description="Влияние на деньги и конкретный следующий шаг."
            items={recommendationItems}
            helpKey="priority_actions"
            compact
          />

          {/* Source analysis — collapsible sections */}
          <div className="space-y-4">
            <CollapsibleSection
              title="Источники: воронка по каналам"
              summary={`${rowsSortedByLeads.length} источников`}
              badge={<Badge variant="outline" className="text-xs">лиды → сделки → выигранные</Badge>}
              defaultOpen
            >
              <div className="space-y-5">
                {rowsSortedByLeads.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Недостаточно данных.</p>
                ) : (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Сравнение по воронке</p>
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={rowsSortedByLeads.slice(0, 6).map((r) => ({
                            name: channelNameById.get(r.channelCampaignExternalId) ?? r.channelCampaignExternalId,
                            leads: r.leads,
                            deals: r.deals,
                            wonDeals: r.wonDeals,
                          }))} layout="vertical" margin={CHART_MARGIN}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                            <XAxis type="number" hide tick={axisTick} axisLine={false} />
                            <YAxis dataKey="name" type="category" width={160} tick={axisTick} tickFormatter={truncateLabel} />
                            <RechartsTooltip contentStyle={tooltipStyle.contentStyle} wrapperStyle={tooltipStyle.wrapperStyle} formatter={(v: unknown) => (!Number.isFinite(Number(v)) ? '—' : String(v))} />
                            <Legend wrapperStyle={legendStyle.wrapperStyle} iconSize={legendStyle.iconSize} />
                            <Bar dataKey="leads" name="Лиды" fill={CHART_COLORS.leads} barSize={8} radius={[4, 4, 0, 0]} />
                            <Bar dataKey="deals" name="Сделки" fill={CHART_COLORS.deals} barSize={8} radius={[4, 4, 0, 0]} />
                            <Bar dataKey="wonDeals" name="Выигранные" fill={CHART_COLORS.won} barSize={8} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="border-t border-border/40 pt-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Конверсии по источнику</p>
                      <div className="h-[190px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={rowsSortedByPaidRevenue.slice(0, 6).map((r) => ({
                            name: channelNameById.get(r.channelCampaignExternalId) ?? r.channelCampaignExternalId,
                            leadToDeal: r.leadToDealConversion * 100,
                            dealToPaid: r.dealToPaidConversion * 100,
                          }))} layout="vertical" margin={CHART_MARGIN}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                            <XAxis type="number" tick={axisTick} tickFormatter={(v) => `${v.toFixed(0)}%`} axisLine={false} />
                            <YAxis dataKey="name" type="category" width={160} tick={axisTick} tickFormatter={truncateLabel} />
                            <RechartsTooltip contentStyle={tooltipStyle.contentStyle} wrapperStyle={tooltipStyle.wrapperStyle} formatter={(v: unknown) => (!Number.isFinite(Number(v)) ? '—' : `${Number(v).toFixed(1)}%`)} />
                            <Legend wrapperStyle={legendStyle.wrapperStyle} iconSize={legendStyle.iconSize} />
                            <Bar dataKey="leadToDeal" name="Лид→Сделка" fill={CHART_COLORS.deals} barSize={8} radius={[4, 4, 0, 0]} />
                            <Bar dataKey="dealToPaid" name="Сделка→Оплата" fill={CHART_COLORS.paid} barSize={8} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Источники: расходы и оплаченная выручка"
              summary={`${rowsSortedByPaidRevenue.length} каналов`}
              badge={<Badge variant="outline" className="text-xs">деньги</Badge>}
              defaultOpen
            >
              <div className="space-y-5">
                {rowsSortedByPaidRevenue.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Недостаточно данных.</p>
                ) : (
                  <>
                    {(() => {
                      const top = rowsSortedByPaidRevenue.slice(0, 6);
                      const chartData = top.map((r) => ({
                        name: channelNameById.get(r.channelCampaignExternalId) ?? r.channelCampaignExternalId,
                        marketingSpend: r.marketingSpend,
                        paidRevenue: r.paidRevenue,
                      }));
                      const maxPaid = Math.max(1, ...top.map((r) => r.paidRevenue));

                      return (
                        <>
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Расходы vs оплата</p>
                            <div className="h-[210px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} layout="vertical" margin={CHART_MARGIN}>
                                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                                  <XAxis type="number" tick={axisTick} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} axisLine={false} />
                                  <YAxis dataKey="name" type="category" width={160} tick={axisTick} tickFormatter={truncateLabel} />
                                  <RechartsTooltip contentStyle={tooltipStyle.contentStyle} wrapperStyle={tooltipStyle.wrapperStyle} formatter={(v: unknown) => (!Number.isFinite(Number(v)) ? '—' : formatKZT(Number(v)))} />
                                  <Legend wrapperStyle={legendStyle.wrapperStyle} iconSize={legendStyle.iconSize} />
                                  <Bar dataKey="marketingSpend" name="Расходы" fill={CHART_COLORS.spend} barSize={8} radius={[4, 4, 0, 0]} />
                                  <Bar dataKey="paidRevenue" name="Оплачено" fill={CHART_COLORS.paid} barSize={8} radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          <div className="border-t border-border/40 pt-4">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Оплаченная выручка</p>
                            <div className="space-y-3">
                              {top.map((r) => (
                                <RankedListItem
                                  key={r.channelCampaignExternalId}
                                  label={channelNameById.get(r.channelCampaignExternalId) ?? r.channelCampaignExternalId}
                                  value={moneyOrDash(r.paidRevenue)}
                                  progressPct={Math.round((r.paidRevenue / maxPaid) * 100)}
                                  barColor="emerald"
                                />
                              ))}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Лучшее и худшее в источниках"
              summary="Кто даёт деньги, кто буксует"
              badge={analytics.overdueAmount.value > 0 ? (
                <Badge variant="outline" className="text-xs text-rose-600 dark:text-rose-400 border-rose-300/60 dark:border-rose-800/40">
                  просрочка: {moneyOrDash(analytics.overdueAmount.value)}
                </Badge>
              ) : undefined}
              defaultOpen={false}
            >
              <div className="space-y-4">
                {/* Best by revenue */}
                <div className="rct-card-inset p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <TrendingUp className="h-3.5 w-3.5 text-teal-500 dark:text-teal-400" />
                        Лучшие по оплате
                      </p>
                    </div>
                    <Badge variant="secondary" className="border-teal-200/60 dark:border-teal-800/40 text-teal-700 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-950/20 hover:bg-teal-50/50 dark:hover:bg-teal-950/20">
                      топ
                    </Badge>
                  </div>
                  {(() => {
                    const byId = new Map(rows.map((r) => [r.channelCampaignExternalId, r]));
                    const ids = analytics.bestWorstChannelsSummary.bestByPaidRevenue.slice(0, 3);
                    const top = ids.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
                    const max = Math.max(1, ...top.map((r) => r.paidRevenue));

                    if (!top.length) return <p className="text-sm text-muted-foreground">Нет данных.</p>;

                    return (
                      <div className="space-y-2">
                        {top.map((r) => (
                          <RankedListItem
                            key={r.channelCampaignExternalId}
                            label={channelNameById.get(r.channelCampaignExternalId) ?? r.channelCampaignExternalId}
                            value={moneyOrDash(r.paidRevenue)}
                            progressPct={Math.round((r.paidRevenue / max) * 100)}
                            barColor="emerald"
                          />
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Worst by conversion */}
                <div className="rct-card-inset p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <TrendingDown className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400" />
                        Слабые по конверсиям
                      </p>
                    </div>
                    <Badge variant="secondary" className="border-rose-200/50 dark:border-rose-800/30 text-rose-600 dark:text-rose-400 bg-rose-50/40 dark:bg-rose-950/15 hover:bg-rose-50/40 dark:hover:bg-rose-950/15">
                      внимание
                    </Badge>
                  </div>
                  {(() => {
                    const byId = new Map(rows.map((r) => [r.channelCampaignExternalId, r]));
                    const ids = Array.from(
                      new Set([
                        ...analytics.bestWorstChannelsSummary.worstByLeadToDealConversion.slice(0, 2),
                        ...analytics.bestWorstChannelsSummary.worstByDealToPaidConversion.slice(0, 2),
                      ])
                    ).slice(0, 3);
                    const top = ids.map((id) => byId.get(id)).filter(Boolean) as typeof rows;

                    if (!top.length) return <p className="text-sm text-muted-foreground">Нет данных.</p>;

                    return (
                      <div className="space-y-2">
                        {top.map((r) => {
                          const worstMetric = Math.min(r.leadToDealConversion, r.dealToPaidConversion);
                          return (
                            <div key={r.channelCampaignExternalId} className="flex items-center justify-between gap-3 py-1.5">
                              <p className="text-xs font-medium text-foreground truncate max-w-[200px]">
                                {channelNameById.get(r.channelCampaignExternalId) ?? r.channelCampaignExternalId}
                              </p>
                              <Badge variant="outline" className="text-xs text-rose-600 dark:text-rose-400 border-rose-300/60 dark:border-rose-800/40">
                                {percentFromRatio(worstMetric)}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Why it matters */}
                <div className="rct-card-inset p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Слабый по конверсиям канал = деньги не доходят до оплаты. Канал с просрочкой = приток под угрозой.
                    </p>
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          </div>
        </>
      )}
    </div>
  );
}
