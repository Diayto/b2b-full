// ============================================================
// BizPulse KZ — Marketing Intelligence Panel (Redesigned)
// 3-layer system: Organic Funnel → Channel Table → Content
// ============================================================

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import ControlTowerKpiCard from '@/components/controltower/ControlTowerKpiCard';
import SectionHeader from '@/components/controltower/SectionHeader';
import EmptyStateCard from '@/components/controltower/EmptyStateCard';
import { CollapsibleSection } from '@/components/controltower';
import { cn } from '@/lib/utils';
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
  getContentMetrics,
  seedDemoData,
} from '@/lib/store';
import {
  calculateRevenueControlTowerAnalytics,
  computeSourcePerformance,
  classifySources,
  computeContentPerformance,
  explainROI,
  isDateInRangeInclusive,
} from '@/lib/analytics';
import { formatKZT } from '@/lib/metrics';
import type { RevenueControlTowerAnalytics } from '@/lib/analytics/revenueControlTower';
import RecommendationsCard from '@/components/RecommendationsCard';
import { buildRecommendations } from '@/lib/recommendations';
import { AlertTriangle, ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';

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

// Funnel step component with conversion arrows
function FunnelStep({
  label,
  value,
  conversionRate,
  isLast,
  colorClass,
  maxValue,
}: {
  label: string;
  value: number;
  conversionRate?: string;
  isLast?: boolean;
  colorClass: string;
  maxValue: number;
}) {
  const w = Math.round((value / Math.max(1, maxValue)) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className="text-sm font-bold text-foreground">{value}</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', colorClass)} style={{ width: `${w}%` }} />
        </div>
      </div>
      {!isLast && conversionRate && (
        <div className="flex flex-col items-center shrink-0 w-16">
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-semibold text-primary">{conversionRate}</span>
        </div>
      )}
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

  const channelCampaigns = useMemo(() => getChannelCampaigns(companyId), [companyId]);
  const leads = useMemo(() => getLeads(companyId), [companyId]);
  const deals = useMemo(() => getDeals(companyId), [companyId]);
  const invoices = useMemo(() => getInvoices(companyId), [companyId]);
  const payments = useMemo(() => getPayments(companyId), [companyId]);
  const customers = useMemo(() => getCustomers(companyId), [companyId]);
  const marketingSpend = useMemo(() => getMarketingSpend(companyId), [companyId]);
  const managers = useMemo(() => getManagers(companyId), [companyId]);
  const contentMetrics = useMemo(() => getContentMetrics(companyId), [companyId]);

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

  const sourcePerformanceRows = useMemo(
    () => computeSourcePerformance(analytics.paidRevenueBySource.rows, channelNameById),
    [analytics.paidRevenueBySource.rows, channelNameById],
  );
  const { best: bestSources, worst: worstSources } = useMemo(
    () => classifySources(sourcePerformanceRows),
    [sourcePerformanceRows],
  );
  const contentInRange = useMemo(
    () => contentMetrics.filter((cm) => isDateInRangeInclusive(cm.publishedAt, analyticsRange)),
    [contentMetrics, analyticsRange],
  );
  const hasAnyContentMetrics = contentMetrics.length > 0;
  const hasOrganicInRange = contentInRange.length > 0;

  const contentPerformance = useMemo(
    () => computeContentPerformance(contentInRange, 5),
    [contentInRange],
  );

  // Organic funnel totals (derived from manually imported `content_metrics`)
  const organicTotals = useMemo(() => {
    let reach = 0;
    let likes = 0;
    let comments = 0;
    let saves = 0;
    let shares = 0;
    let profileVisits = 0;
    let inboundMessages = 0;
    let leadsGenerated = 0;
    let dealsGenerated = 0;
    let paidConversions = 0;

    for (const m of contentInRange) {
      reach += m.reach;
      likes += m.likes;
      comments += m.comments;
      saves += m.saves;
      shares += m.shares;
      profileVisits += m.profileVisits;
      inboundMessages += m.inboundMessages;
      leadsGenerated += m.leadsGenerated;
      dealsGenerated += m.dealsGenerated;
      paidConversions += m.paidConversions;
    }

    const engagement = likes + comments + saves + shares;
    return {
      reach,
      engagement,
      profileVisits,
      inboundMessages,
      leadsGenerated,
      dealsGenerated,
      paidConversions,
    };
  }, [contentInRange]);

  const recommendationItems = useMemo(
    () =>
      buildRecommendations({
        surface: 'marketing',
        analytics,
        channelNameById,
        formatMoney: formatKZT,
        maxItems: 4,
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

  const bottleneck = useMemo(() => {
    return [
      { key: 'lead_to_deal', v: analytics.funnelDropOff.dropOffLeadToDeal, label: 'лид → сделка' },
      { key: 'deal_to_won', v: analytics.funnelDropOff.dropOffDealToWon, label: 'сделка → выигранная' },
      { key: 'won_to_paid', v: analytics.funnelDropOff.dropOffWonToPaid, label: 'выигранная → оплата' },
    ].sort((a, b) => b.v - a.v)[0];
  }, [analytics.funnelDropOff]);

  // Channel performance table data (derived from shared `computeSourcePerformance`)
  const channelTableData = useMemo(() => {
    return sourcePerformanceRows
      .map((r) => ({
        id: r.channelCampaignExternalId,
        name: r.name,
        cost: r.cost,
        leads: r.leads,
        deals: r.deals,
        wonDeals: r.wonDeals,
        convRate: r.conversionRate,
        revenue: r.revenue,
        roi: r.roi,
        leadToDeal: r.leadToDealRate, // 0..1
        dealToPaid: r.dealToPaidRate, // 0..1
      }))
      .sort((a, b) => (b.roi ?? -999) - (a.roi ?? -999));
  }, [sourcePerformanceRows]);

  return (
    <div className="rct-page p-4 lg:p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="rct-page-title">Маркетинг → Выручка</h2>
          <p className="rct-body-micro mt-1">От лида до оплаты: воронка, каналы и эффективность</p>
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
          <Button variant="outline" onClick={() => navigate('/marketing/data')}>Данные</Button>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              title="Цена won-сделки"
              value={analytics.costPerWonDeal.value > 0 ? moneyOrDash(analytics.costPerWonDeal.value) : '—'}
              subtitle={calculationBadge(analytics.costPerWonDeal.calculationMode) ?? 'маркетинг / won deals'}
              status={analytics.costPerWonDeal.calculationMode === 'fallback' || analytics.costPerWonDeal.value > 900000 ? 'warning' : 'success'}
              detail={{
                what: 'Маркетинговые расходы на одну выигранную сделку',
                why: 'Связывает маркетинг с реальными продажами.',
              }}
            />
            <ControlTowerKpiCard
              title="Bottleneck"
              value={bottleneck.label}
              subtitle={`провал ${percentFromRatio(bottleneck.v)}`}
              status="danger"
              detail={{
                what: `Больше всего теряется на шаге: ${bottleneck.label}`,
                why: 'Устранение bottleneck даёт самый быстрый рост конверсии в деньги.',
              }}
            />
          </div>

          {/* ============================================= */}
          {/* ORGANIC FUNNEL (content_metrics input)      */}
          {/* ============================================= */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">Органическая воронка (Instagram / TikTok / соцсети)</h3>
              <Badge variant="outline" className="text-xs">
                {hasOrganicInRange ? `${organicTotals.reach} охватов` : 'нет данных'}
              </Badge>
            </div>

            <div className="rct-card-inset p-4 border-dashed">
              <p className="text-sm text-muted-foreground">
                Подключение Meta Graph API сейчас не настроено. Для органики используйте <strong>ручной импорт</strong> файла{' '}
                <strong>content_metrics</strong> (поля: reach, engagement/likes, DMs, leads, deals, paid conversions). В будущем подключим прямую выгрузку Meta.
              </p>
            </div>

            {!hasOrganicInRange ? (
              <p className="text-sm text-muted-foreground">В выбранном периоде нет данных по <strong>content_metrics</strong>. Загрузите отчёт — и появится органическая воронка.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="rct-card rct-card-padding">
                  <SectionHeader title="Reach → Engagement → Profile Visits → Messages → Leads → Deals → Paid" size="sm" />
                  <div className="mt-4 space-y-4">
                    {(() => {
                      const maxVal = Math.max(
                        organicTotals.reach,
                        organicTotals.engagement,
                        organicTotals.profileVisits,
                        organicTotals.inboundMessages,
                        organicTotals.leadsGenerated,
                        organicTotals.dealsGenerated,
                        organicTotals.paidConversions,
                        1,
                      );

                      const reachToEng =
                        organicTotals.reach > 0 ? percentFromRatio(organicTotals.engagement / organicTotals.reach) : undefined;
                      const engToProfile =
                        organicTotals.engagement > 0 ? percentFromRatio(organicTotals.profileVisits / organicTotals.engagement) : undefined;
                      const profileToMsg =
                        organicTotals.profileVisits > 0 ? percentFromRatio(organicTotals.inboundMessages / organicTotals.profileVisits) : undefined;
                      const msgToLeads =
                        organicTotals.inboundMessages > 0 ? percentFromRatio(organicTotals.leadsGenerated / organicTotals.inboundMessages) : undefined;
                      const leadsToDeals =
                        organicTotals.leadsGenerated > 0 ? percentFromRatio(organicTotals.dealsGenerated / organicTotals.leadsGenerated) : undefined;
                      const dealsToPaid =
                        organicTotals.dealsGenerated > 0 ? percentFromRatio(organicTotals.paidConversions / organicTotals.dealsGenerated) : undefined;

                      return (
                        <>
                          <FunnelStep
                            label="Reach"
                            value={organicTotals.reach}
                            conversionRate={reachToEng}
                            colorClass="bg-foreground/60"
                            maxValue={maxVal}
                          />
                          <FunnelStep
                            label="Engagement"
                            value={organicTotals.engagement}
                            conversionRate={engToProfile}
                            colorClass="bg-primary/60"
                            maxValue={maxVal}
                          />
                          <FunnelStep
                            label="Profile visits"
                            value={organicTotals.profileVisits}
                            conversionRate={profileToMsg}
                            colorClass="bg-indigo-500/50 dark:bg-indigo-400/50"
                            maxValue={maxVal}
                          />
                          <FunnelStep
                            label="Messages / DMs"
                            value={organicTotals.inboundMessages}
                            conversionRate={msgToLeads}
                            colorClass="bg-amber-500/50 dark:bg-amber-400/50"
                            maxValue={maxVal}
                          />
                          <FunnelStep
                            label="Leads"
                            value={organicTotals.leadsGenerated}
                            conversionRate={leadsToDeals}
                            colorClass="bg-teal-600/45 dark:bg-teal-500/45"
                            maxValue={maxVal}
                          />
                          <FunnelStep
                            label="Deals"
                            value={organicTotals.dealsGenerated}
                            conversionRate={dealsToPaid}
                            colorClass="bg-emerald-600/45 dark:bg-emerald-500/45"
                            maxValue={maxVal}
                          />
                          <FunnelStep
                            label="Paid"
                            value={organicTotals.paidConversions}
                            isLast
                            colorClass="bg-teal-500/70 dark:bg-teal-400/60"
                            maxValue={maxVal}
                          />
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="rct-card rct-card-padding">
                  <SectionHeader title="Частичные данные (без подстановок)" size="sm" description="Показываем что есть в импортированном отчёте." />
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Reach</span>
                      <Badge variant="outline" className="text-[11px]">
                        {organicTotals.reach > 0 ? 'данные есть' : 'нет данных'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Profile visits</span>
                      <Badge variant="outline" className="text-[11px]">
                        {organicTotals.profileVisits > 0 ? 'данные есть' : 'нет данных в поле'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Messages / DMs</span>
                      <Badge variant="outline" className="text-[11px]">
                        {organicTotals.inboundMessages > 0 ? 'данные есть' : 'нет данных в поле'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Leads → Deals → Paid</span>
                      <Badge variant="outline" className="text-[11px]">
                        {organicTotals.leadsGenerated > 0 ? 'воронка частично посчитана' : 'нет данных по лидам'}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground mt-2">
                      Конверсии считаются только по тем значениям, которые есть в <strong>content_metrics</strong>. Если поле отсутствует/нулевое, то и конверсия будет некорректной — мы не подставляем числа.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ============================================= */}
          {/* LAYER A: ORGANIC / SOCIAL FUNNEL              */}
          {/* ============================================= */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">Воронка: от лида до оплаты</h3>
              <Badge variant="outline" className="text-xs">
                {analytics.funnelDropOff.leads} лидов → {analytics.funnelDropOff.paidWonDeals} оплачено
              </Badge>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Full funnel with conversion rates */}
              <div className="rct-card rct-card-padding">
                <SectionHeader title="Сквозная воронка" size="sm" description="Конверсии между каждым шагом" />
                <div className="mt-4 space-y-4">
                  {(() => {
                    const maxVal = Math.max(
                      analytics.funnelDropOff.leads,
                      analytics.funnelDropOff.deals,
                      analytics.funnelDropOff.wonDeals,
                      analytics.funnelDropOff.paidWonDeals,
                      1,
                    );
                    return (
                      <>
                        <FunnelStep label="Лиды" value={analytics.funnelDropOff.leads} conversionRate={percentFromRatio(analytics.funnelDropOff.leadToDealRate)} colorClass="bg-foreground/60" maxValue={maxVal} />
                        <FunnelStep label="Сделки" value={analytics.funnelDropOff.deals} conversionRate={percentFromRatio(analytics.funnelDropOff.dealToWonRate)} colorClass="bg-primary/60" maxValue={maxVal} />
                        <FunnelStep label="Выигранные" value={analytics.funnelDropOff.wonDeals} conversionRate={percentFromRatio(analytics.funnelDropOff.wonToPaidRate)} colorClass="bg-teal-600/60 dark:bg-teal-500/50" maxValue={maxVal} />
                        <FunnelStep label="Оплачено" value={analytics.funnelDropOff.paidWonDeals} isLast colorClass="bg-teal-500/70 dark:bg-teal-400/60" maxValue={maxVal} />
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Drop-off analysis */}
              <div className="rct-card rct-card-padding">
                <SectionHeader title="Точки потерь" size="sm" description="Где теряются потенциальные клиенты" />
                <div className="mt-4 space-y-3">
                  {[
                    {
                      label: 'Лид → Сделка',
                      dropOff: analytics.funnelDropOff.dropOffLeadToDeal,
                      lost: analytics.funnelDropOff.leads - analytics.funnelDropOff.deals,
                      rate: analytics.funnelDropOff.leadToDealRate,
                      isCritical: analytics.insightSignals.funnelBottleneckStage === 'lead_to_deal',
                    },
                    {
                      label: 'Сделка → Выигранная',
                      dropOff: analytics.funnelDropOff.dropOffDealToWon,
                      lost: analytics.funnelDropOff.deals - analytics.funnelDropOff.wonDeals,
                      rate: analytics.funnelDropOff.dealToWonRate,
                      isCritical: analytics.insightSignals.funnelBottleneckStage === 'deal_to_won',
                    },
                    {
                      label: 'Выигранная → Оплата',
                      dropOff: analytics.funnelDropOff.dropOffWonToPaid,
                      lost: analytics.funnelDropOff.wonDeals - analytics.funnelDropOff.paidWonDeals,
                      rate: analytics.funnelDropOff.wonToPaidRate,
                      isCritical: analytics.insightSignals.funnelBottleneckStage === 'won_to_paid',
                    },
                  ].map((step) => (
                    <div
                      key={step.label}
                      className={cn(
                        'rct-card-inset p-3',
                        step.isCritical && 'ring-1 ring-rose-300/60 dark:ring-rose-800/40',
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {step.isCritical && <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />}
                          <span className="text-sm font-medium text-foreground">{step.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">потеряно: {step.lost}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              step.isCritical
                                ? 'text-rose-600 dark:text-rose-400 border-rose-300/60'
                                : 'text-muted-foreground',
                            )}
                          >
                            {percentFromRatio(step.dropOff)} drop
                          </Badge>
                        </div>
                      </div>
                      {step.isCritical && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1.5">
                          Главная точка потерь — требует приоритетного внимания
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ============================================= */}
          {/* LAYER B: CHANNEL PERFORMANCE TABLE            */}
          {/* ============================================= */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">Эффективность каналов</h3>
              <Badge variant="outline" className="text-xs">{channelTableData.length} каналов</Badge>
            </div>

            {channelTableData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Недостаточно данных для анализа каналов.</p>
            ) : (
              <div className="rct-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Канал</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Расход</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Лиды</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Конверсия</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Выручка</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">ROI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelTableData.map((ch) => {
                        const roiPositive = ch.roi !== null && ch.roi > 0;
                        const roiNegative = ch.roi !== null && ch.roi < 0;
                        return (
                          <tr key={ch.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <span className="font-medium text-foreground text-sm truncate block max-w-[200px]">{ch.name}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{moneyOrDash(ch.cost)}</td>
                            <td className="px-4 py-3 text-right text-foreground font-medium">{ch.leads}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={cn(
                                'text-sm',
                                ch.convRate >= 20 ? 'text-teal-600 dark:text-teal-400' : ch.convRate >= 10 ? 'text-foreground' : 'text-rose-600 dark:text-rose-400',
                              )}>
                                {ch.convRate.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-foreground">{moneyOrDash(ch.revenue)}</td>
                            <td className="px-4 py-3 text-right">
                              {ch.roi !== null ? (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-xs',
                                    roiPositive && 'text-teal-600 dark:text-teal-400 border-teal-300/60 dark:border-teal-800/40',
                                    roiNegative && 'text-rose-600 dark:text-rose-400 border-rose-300/60 dark:border-rose-800/40',
                                  )}
                                >
                                  {ch.roi > 0 ? '+' : ''}{ch.roi.toFixed(0)}%
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {analytics.paidRevenueBySource.unattributedPaidRevenue > 0 && (
                  <div className="px-4 py-2 bg-rose-50/30 dark:bg-rose-950/10 border-t">
                    <p className="text-xs text-rose-600 dark:text-rose-400">
                      Не размечено: {moneyOrDash(analytics.paidRevenueBySource.unattributedPaidRevenue)} — проверьте цепочку атрибуции
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ============================================= */}
          {/* LAYER C: CONTENT / SOURCE ANALYTICS           */}
          {/* ============================================= */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">Аналитика по источникам</h3>
            </div>

            {/* Content analytics (when content metrics exist in the system) */}
            {!hasAnyContentMetrics && (
              <div className="rct-card-inset p-4 mb-5 border-dashed">
                <p className="text-sm text-muted-foreground">
                  <strong>Нет данных по контенту.</strong> Загрузите файл content_metrics в разделе Загрузки — тогда появится аналитика по публикациям и вовлечению.
                </p>
              </div>
            )}
            {hasAnyContentMetrics && !hasOrganicInRange && (
              <div className="rct-card-inset p-4 mb-5 border-dashed">
                <p className="text-sm text-muted-foreground">
                  В выбранном периоде нет <strong>content_metrics</strong>. Загрузите отчёт за нужные даты — и появится органическая воронка и контент-анализ.
                </p>
              </div>
            )}
            {hasOrganicInRange && (
              <div className="rct-card rct-card-padding mb-5">
                <SectionHeader title="Контент / органика" size="sm" description="Топ и слабые публикации по вовлечению" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Лучший контент</p>
                    <div className="space-y-2">
                      {contentPerformance.topPerforming.slice(0, 3).map((c) => (
                        <div key={c.contentId} className="rct-card-inset p-3 flex justify-between items-center">
                          <span className="text-sm truncate max-w-[180px]">{c.contentTitle || c.contentId}</span>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {(c.engagementRate * 100).toFixed(1)}% ER
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Слабый контент</p>
                    <div className="space-y-2">
                      {contentPerformance.worstPerforming.slice(0, 3).map((c) => (
                        <div key={c.contentId} className="rct-card-inset p-3 flex justify-between items-center">
                          <span className="text-sm truncate max-w-[180px]">{c.contentTitle || c.contentId}</span>
                          <Badge variant="outline" className="text-[10px] text-rose-600 shrink-0">
                            {(c.engagementRate * 100).toFixed(1)}% ER
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {contentPerformance.byPlatform.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs font-medium text-muted-foreground mb-2">По платформам</p>
                    <div className="flex flex-wrap gap-2">
                      {contentPerformance.byPlatform.slice(0, 5).map((p) => (
                        <Badge key={p.platform} variant="secondary" className="text-xs">
                          {p.label}: {p.contentCount} постов, {p.totalLeads} лидов
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Best performing sources */}
              <div className="rct-card rct-card-padding">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-teal-500" />
                    <SectionHeader title="Лучшие источники" size="sm" />
                  </div>
                  <Badge variant="secondary" className="text-xs text-teal-700 dark:text-teal-400">топ</Badge>
                </div>
                {bestSources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет данных.</p>
                ) : (
                  <div className="space-y-3">
                    {bestSources.map((s, idx) => (
                      <div key={s.id} className="rct-card-inset p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {idx + 1}. {s.name}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {s.leads} лидов · {percentFromRatio(s.leadToDealRate)} лид→сделка
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-teal-600 dark:text-teal-400">{moneyOrDash(s.revenue)}</p>
                            {s.roi !== null && (
                              <p className="text-[11px] text-muted-foreground">ROI: {s.roi.toFixed(0)}%</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Worst performing sources */}
              <div className="rct-card rct-card-padding">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-rose-500" />
                    <SectionHeader title="Слабые источники" size="sm" />
                  </div>
                  <Badge variant="secondary" className="text-xs text-rose-600 dark:text-rose-400">внимание</Badge>
                </div>
                {worstSources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет данных.</p>
                ) : (
                  <div className="space-y-3">
                    {worstSources.map((s, idx) => (
                      <div key={s.id} className="rct-card-inset p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {idx + 1}. {s.name}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {s.leads} лидов · {percentFromRatio(s.dealToPaidRate)} сделка→оплата
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{moneyOrDash(s.revenue)}</p>
                            {s.roi !== null && (
                              <p className="text-[11px] text-muted-foreground">ROI: {s.roi.toFixed(0)}%</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Funnel by channel - detailed collapsible */}
            <CollapsibleSection
              title="Детализация воронки по каналам"
              summary={`${channelTableData.length} каналов`}
              badge={<Badge variant="outline" className="text-xs">лид→сделка→оплата</Badge>}
              defaultOpen={false}
            >
              <div className="space-y-3">
                {channelTableData.slice(0, 8).map((ch) => (
                  <div key={ch.id} className="rct-card-inset p-3">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="text-sm font-medium text-foreground truncate">{ch.name}</p>
                      <div className="flex gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px]">
                          L→D: {percentFromRatio(ch.leadToDeal)}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          D→P: {percentFromRatio(ch.dealToPaid)}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{ch.leads} лидов</span>
                      <span>{ch.deals} сделок</span>
                      <span>{ch.wonDeals} won</span>
                      <span className="font-medium text-foreground">{moneyOrDash(ch.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </section>

          {/* ============================================= */}
          {/* RECOMMENDATIONS (bottom)                       */}
          {/* ============================================= */}
          <RecommendationsCard
            title="Рекомендации"
            description="Что мешает деньгам и какой следующий шаг."
            items={recommendationItems}
            helpKey="priority_actions"
            compact
          />
        </>
      )}
    </div>
  );
}
