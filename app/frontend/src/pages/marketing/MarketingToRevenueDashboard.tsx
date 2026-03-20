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
  computeContentPerformance,
  isDateInRangeInclusive,
} from '@/lib/analytics';
import { formatKZT } from '@/lib/metrics';
import type { RevenueControlTowerAnalytics } from '@/lib/analytics/revenueControlTower';
import RecommendationsCard from '@/components/RecommendationsCard';
import { buildRecommendations } from '@/lib/recommendations';
import { AlertTriangle, ArrowRight } from 'lucide-react';

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

function platformLabel(platform: string): string {
  switch (platform) {
    case 'instagram':
      return 'Instagram';
    case 'tiktok':
      return 'TikTok';
    case 'facebook':
      return 'Facebook';
    case 'linkedin':
      return 'LinkedIn';
    case 'youtube':
      return 'YouTube';
    case 'telegram':
      return 'Telegram';
    default:
      return platform;
  }
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

  const contentById = useMemo(() => {
    const m = new Map<string, (typeof contentInRange)[number]>();
    for (const cm of contentInRange) m.set(cm.contentId, cm);
    return m;
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

  const hasCostData = channelTableData.some((c) => c.cost > 0);
  const roiUnavailableCount = channelTableData.filter((c) => c.roi === null).length;
  const hasAttributionIssue = analytics.paidRevenueBySource.unattributedPaidRevenue > 0;

  const marketingDataGaps = useMemo(() => {
    const gaps: string[] = [];
    const { leads: funnelLeads, deals: funnelDeals } = analytics.funnelDropOff;

    if (funnelLeads > 0 && deals.length === 0) {
      gaps.push(
        'Лиды есть, а сделок в системе нет — загрузите лист продаж (например «ПРОДАЖИ») через Uploads в умном режиме или проверьте ошибки импорта.',
      );
    } else if (funnelLeads > 0 && deals.length > 0 && funnelDeals === 0) {
      gaps.push(
        'Сделки загружены, но воронка их не видит: нет связи с лидом (одинаковый ID или телефон) или дата createdDate сделки вне выбранного периода. Перезагрузите Excel после обновления — телефоны лид↔сделка теперь совпадают в формате phone:…',
      );
    }

    if (funnelLeads > 0 && channelCampaigns.length === 0) {
      gaps.push(
        'Таблица каналов пуста: не загружен справочник каналов/кампаний. Без него и без источника у лидов разрез по каналам не строится.',
      );
    } else if (channelCampaigns.length > 0) {
      const leadsNoChannel = leads.filter(
        (l) =>
          l.createdDate &&
          isDateInRangeInclusive(l.createdDate, analyticsRange) &&
          !l.channelCampaignExternalId,
      ).length;
      if (leadsNoChannel > 0) {
        gaps.push(
          `У ${leadsNoChannel} лидов в периоде не указан источник (канал) — по каналам будет мало или ноль данных, даже если справочник загружен.`,
        );
      }
    }

    return gaps;
  }, [analytics.funnelDropOff, analyticsRange, channelCampaigns.length, deals.length, leads]);

  const organicMissingHint = (() => {
    if (organicTotals.reach > 0 && organicTotals.engagement === 0) return 'Reach есть, engagement не виден в отчёте';
    if (organicTotals.engagement > 0 && organicTotals.profileVisits === 0) return 'Интерес есть, но нет данных по визитам профиля';
    if (organicTotals.profileVisits > 0 && organicTotals.inboundMessages === 0) return 'Визиты есть, но DMs/сообщений нет (или они не загружены)';
    if (organicTotals.inboundMessages > 0 && organicTotals.leadsGenerated === 0) return 'Сообщения есть, но лидов в данных нет';
    if (organicTotals.leadsGenerated > 0 && organicTotals.dealsGenerated === 0) return 'Лиды есть, но сделок в данных нет';
    if (organicTotals.dealsGenerated > 0 && organicTotals.paidConversions === 0) return 'Сделки есть, но paid-конверсий в данных нет';
    return null;
  })();

  const socialMomentumLabel =
    organicTotals.engagement > 0 && organicTotals.leadsGenerated > 0
      ? 'Есть связка внимания и лидов'
      : organicTotals.reach > 0 && organicTotals.leadsGenerated === 0
        ? 'Охват есть, но лиды слабые'
        : 'Нужны дополнительные данные';

  return (
    <div className="chrona-page">
      {/* Header */}
      <div className="chrona-tier-1 chrona-reveal-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="rct-page-title">Маркетинг → Выручка</h2>
            <p className="rct-body-micro mt-1">Главная витрина роста: органика, каналы и денежный результат</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
              <SelectTrigger className="w-[170px] chrona-interactive-control">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">30 дней</SelectItem>
                <SelectItem value="90d">90 дней</SelectItem>
                <SelectItem value="180d">180 дней</SelectItem>
                <SelectItem value="all">Всё время</SelectItem>
              </SelectContent>
            </Select>
            <span className="chrona-topbar-chip">Social-first</span>
            <Button className="chrona-interactive-control" variant="outline" onClick={() => navigate('/marketing/data')}>Данные</Button>
            <Button className="chrona-interactive-control" variant="outline" onClick={() => navigate('/sales-cash')}>Sales/Cash</Button>
            <Button className="chrona-interactive-control" onClick={() => navigate('/uploads')}>Загрузки</Button>
          </div>
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
          {/* Showcase rail: KPI + live signals */}
          <section className="grid grid-cols-1 xl:grid-cols-12 gap-5 chrona-reveal-support">
            <div className="xl:col-span-8 chrona-tier-2">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="chrona-section-title">Ключевые сигналы маркетинга</h3>
                <Badge variant="outline" className="text-xs">быстрый срез</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <ControlTowerKpiCard
                  title="CPL"
                  value={analytics.cpl.value > 0 ? moneyOrDash(analytics.cpl.value) : '—'}
                  subtitle={!hasCostData ? 'Органика / без прямых затрат' : calculationBadge(analytics.cpl.calculationMode) ?? 'стоимость лида'}
                  status={!hasCostData ? 'default' : analytics.cpl.calculationMode === 'fallback' || analytics.cpl.value > 20000 ? 'warning' : 'success'}
                />
                <ControlTowerKpiCard
                  title="CAC"
                  value={analytics.cac.value > 0 ? moneyOrDash(analytics.cac.value) : '—'}
                  subtitle={!hasCostData ? 'Органика / без прямых затрат' : calculationBadge(analytics.cac.calculationMode) ?? 'стоимость клиента'}
                  status={!hasCostData ? 'default' : analytics.cac.calculationMode === 'fallback' || analytics.cac.value > 400000 ? 'warning' : 'success'}
                />
                <ControlTowerKpiCard
                  title="Цена won-сделки"
                  value={analytics.costPerWonDeal.value > 0 ? moneyOrDash(analytics.costPerWonDeal.value) : '—'}
                  subtitle={!hasCostData ? 'Органика / без прямых затрат' : calculationBadge(analytics.costPerWonDeal.calculationMode) ?? 'маркетинг / won deals'}
                  status={!hasCostData ? 'default' : analytics.costPerWonDeal.calculationMode === 'fallback' || analytics.costPerWonDeal.value > 900000 ? 'warning' : 'success'}
                />
                <ControlTowerKpiCard
                  title="Главный провал"
                  value={bottleneck.label}
                  subtitle={`провал ${percentFromRatio(bottleneck.v)}`}
                  status="danger"
                />
              </div>
            </div>
            <div className="xl:col-span-4 chrona-tier-2">
              <h3 className="chrona-section-title">Live Intelligence</h3>
              <div className="mt-3 space-y-2">
                <div className="chrona-tier-3">
                  <p className="text-xs text-muted-foreground">Органика</p>
                  <p className="text-sm font-medium text-foreground mt-1">{socialMomentumLabel}</p>
                </div>
                <div className="chrona-tier-3">
                  <p className="text-xs text-muted-foreground">ROI</p>
                  <p className="text-sm font-medium text-foreground mt-1">
                    {!hasCostData ? 'Нет данных по расходам' : roiUnavailableCount > 0 ? 'Частично доступен' : 'Доступен'}
                  </p>
                </div>
                <div className="chrona-tier-3">
                  <p className="text-xs text-muted-foreground">Атрибуция</p>
                  <p className="text-sm font-medium text-foreground mt-1">
                    {hasAttributionIssue ? `Есть неразмечено: ${moneyOrDash(analytics.paidRevenueBySource.unattributedPaidRevenue)}` : 'Цепочка размечена'}
                  </p>
                </div>
              </div>
            </div>
          </section>


          {/* ============================================= */}
          {/* ORGANIC FUNNEL (manual content upload)      */}
          {/* ============================================= */}
          <section className="space-y-4 chrona-reveal-support">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">Органическая воронка (Instagram / TikTok / соцсети)</h3>
              <Badge variant="outline" className="text-xs">
                {hasOrganicInRange ? `${organicTotals.reach} охватов` : 'нет данных'}
              </Badge>
            </div>

            <div className="chrona-tier-3 border-dashed">
              <p className="text-sm text-muted-foreground">
                Сейчас Meta Graph API не подключен. Для Instagram / TikTok / соцсетей используйте <strong>ручной импорт</strong> файла{' '}
                <strong>контент-метрик</strong> (охват, вовлечение, сообщения, лиды, сделки, оплаты). Это текущий поддерживаемый поток для органики.
              </p>
            </div>

            {!hasOrganicInRange ? (
              <p className="text-sm text-muted-foreground">В выбранном периоде нет данных по контенту/органике. Загрузите отчёт — и появится органическая воронка.</p>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <div className="xl:col-span-8 chrona-tier-1 chrona-hero-spotlight">
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

                <div className="xl:col-span-4 space-y-4">
                  <div className="chrona-tier-2">
                    <SectionHeader title="Social Pulse" size="sm" description="Текущий статус органики и путь к деньгам" />
                    <div className="mt-3 space-y-2">
                      <div className="chrona-tier-3">
                        <p className="text-xs text-muted-foreground">Reach → Leads</p>
                        <p className="text-sm font-medium text-foreground mt-1">
                          {organicTotals.reach > 0 ? `${percentFromRatio(organicTotals.leadsGenerated / Math.max(organicTotals.reach, 1))}` : '—'}
                        </p>
                      </div>
                      <div className="chrona-tier-3">
                        <p className="text-xs text-muted-foreground">Leads → Paid</p>
                        <p className="text-sm font-medium text-foreground mt-1">
                          {organicTotals.leadsGenerated > 0 ? percentFromRatio(organicTotals.paidConversions / organicTotals.leadsGenerated) : '—'}
                        </p>
                      </div>
                      {organicMissingHint ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400">{organicMissingHint}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Критичных разрывов в органической цепочке не видно.</p>
                      )}
                    </div>
                  </div>

                  <div className="chrona-tier-2">
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
                      Конверсии считаются только по данным, которые реально загружены. Если поле отсутствует или нулевое — мы не подставляем значения.
                    </p>
                  </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ============================================= */}
          {/* LAYER A: ORGANIC / SOCIAL FUNNEL              */}
          {/* ============================================= */}
          <section className="space-y-4 chrona-reveal-detail">
            {marketingDataGaps.length > 0 && (
              <div className="chrona-muted-surface border-l-[3px] border-l-violet-500/60 p-4 space-y-2">
                <p className="text-sm font-semibold text-foreground">Почему часть экрана пустая</p>
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1.5">
                  {marketingDataGaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">Воронка: от лида до оплаты</h3>
              <Badge variant="outline" className="text-xs">
                {analytics.funnelDropOff.leads} лидов → {analytics.funnelDropOff.paidWonDeals} оплачено
              </Badge>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-1 gap-5">
              {/* Full funnel with conversion rates */}
              <div className="chrona-surface">
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
            </div>
          </section>

          {/* ============================================= */}
          {/* LAYER B: CHANNEL PERFORMANCE TABLE            */}
          {/* ============================================= */}
          <section className="space-y-4 chrona-reveal-detail">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">Эффективность каналов</h3>
              <Badge variant="outline" className="text-xs">{channelTableData.length} каналов</Badge>
            </div>

            {channelTableData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Нет строк каналов: обычно не загружен справочник «Каналы / кампании» или у лидов не заполнен источник. Органика по контенту — в блоке выше; оплаты без связи с каналом сюда не попадут.
              </p>
            ) : (
              <div className="chrona-tier-2 overflow-hidden">
                <div className="chrona-table">
                  <table>
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Канал</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Расход</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Лиды</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Конверсии</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Выручка</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">ROI / расход</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelTableData.map((ch) => {
                        const roiPositive = ch.roi !== null && ch.roi > 0;
                        const roiNegative = ch.roi !== null && ch.roi < 0;
                        const hasNoSpend = ch.cost <= 0;
                        return (
                          <tr key={ch.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <span className="font-medium text-foreground text-sm truncate block max-w-[200px]">{ch.name}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{moneyOrDash(ch.cost)}</td>
                            <td className="px-4 py-3 text-right text-foreground font-medium">{ch.leads}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="space-y-1">
                                <div className="text-sm text-muted-foreground">
                                  L→D: {percentFromRatio(ch.leadToDeal)}
                                </div>
                                <div
                                  className={cn(
                                    'text-sm font-medium',
                                    ch.dealToPaid >= 0.2
                                      ? 'text-teal-600 dark:text-teal-400'
                                      : ch.dealToPaid >= 0.1
                                        ? 'text-foreground'
                                        : 'text-rose-600 dark:text-rose-400',
                                  )}
                                >
                                  D→P: {percentFromRatio(ch.dealToPaid)}
                                </div>
                              </div>
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
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-xs',
                                    hasNoSpend ? 'text-muted-foreground border-muted-foreground/25' : 'text-muted-foreground',
                                  )}
                                >
                                  {hasNoSpend ? 'ROI недоступен: нет расхода' : 'ROI недоступен'}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

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
              <div className="chrona-tier-3 mb-5 border-dashed">
                <p className="text-sm text-muted-foreground">
                  <strong>Нет данных по контенту.</strong> Загрузите файл с контент-метриками в разделе «Загрузки», и появится аналитика публикаций и вовлечения.
                </p>
              </div>
            )}
            {hasAnyContentMetrics && !hasOrganicInRange && (
              <div className="chrona-tier-3 mb-5 border-dashed">
                <p className="text-sm text-muted-foreground">
                  В выбранном периоде нет контент-данных. Загрузите отчёт за нужные даты — и появится органическая воронка и контент-анализ.
                </p>
              </div>
            )}
            {hasOrganicInRange && (
              <div className="chrona-tier-2 mb-5">
                <SectionHeader title="Контент / органика" size="sm" description="Какие посты дают лиды, а какие их почти не приносят" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Что работает (с лид-эффектом)</p>
                    <div className="space-y-2">
                      {contentPerformance.topPerforming.slice(0, 3).map((c) => (
                        <div key={c.contentId} className="chrona-tier-3 flex justify-between items-start gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground whitespace-normal break-words">
                              {c.contentTitle || c.contentId}
                            </p>
                            <div className="flex gap-2 flex-wrap mt-1">
                              <Badge variant="outline" className="text-[10px]">
                                {platformLabel(c.platform)}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px]">
                                Reach: {contentById.get(c.contentId)?.reach ?? '—'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              ER {(c.engagementRate * 100).toFixed(1)}% · Leads: {c.leadsGenerated}
                            </p>
                          </div>

                          <div className="shrink-0 text-right">
                            <Badge
                              variant="outline"
                              className={
                                c.leadsGenerated > 0 ? 'text-teal-600 dark:text-teal-400 border-teal-300/60' : 'text-muted-foreground border-muted-foreground/30'
                              }
                            >
                              {c.leadsGenerated > 0 ? 'Сильный' : 'Средний'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Что не работает (почти без лидов)</p>
                    <div className="space-y-2">
                      {contentPerformance.worstPerforming.slice(0, 3).map((c) => (
                        <div key={c.contentId} className="chrona-tier-3 flex justify-between items-start gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground whitespace-normal break-words">
                              {c.contentTitle || c.contentId}
                            </p>
                            <div className="flex gap-2 flex-wrap mt-1">
                              <Badge variant="outline" className="text-[10px]">
                                {platformLabel(c.platform)}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px]">
                                Reach: {contentById.get(c.contentId)?.reach ?? '—'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              ER {(c.engagementRate * 100).toFixed(1)}% · Leads: {c.leadsGenerated}
                            </p>
                          </div>

                          <div className="shrink-0 text-right">
                            <Badge
                              variant="outline"
                              className={
                                c.leadsGenerated > 0 ? 'text-muted-foreground border-muted-foreground/30' : 'text-rose-600 dark:text-rose-400 border-rose-300/60'
                              }
                            >
                              {c.leadsGenerated > 0 ? 'Средний' : 'Слабый'}
                            </Badge>
                          </div>
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
                          {p.label}: {p.contentCount} постов · Reach {p.totalReach} · Лиды {p.totalLeads}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="chrona-tier-2 mb-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                  <div>
                    <p className="text-base font-semibold text-foreground">Почему производительность слабая</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Коротко: где теряется конверсия и какие данные сейчас отсутствуют.
                    </p>
                  </div>
                </div>

                <Badge variant="outline" className="text-xs shrink-0">
                  {!hasCostData ? 'ROI недоступен (нет расхода)' : roiUnavailableCount > 0 ? 'ROI частично' : 'ROI доступен'}
                </Badge>
              </div>

              <div className="mt-4 space-y-2">
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Точка потерь:</span> {bottleneck.label} · drop {percentFromRatio(bottleneck.v)}
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Органика:</span>{' '}
                  {organicMissingHint ??
                    (organicTotals.leadsGenerated > 0
                      ? 'По контент-данным лиды и сделки присутствуют — проверяйте конверсию дальше.'
                      : 'В отчёте нет достаточных полей, чтобы посчитать полный путь Reach → Paid без подстановок.')}
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Атрибуция paid:</span>{' '}
                  {hasAttributionIssue
                    ? `есть неразмечено: ${moneyOrDash(analytics.paidRevenueBySource.unattributedPaidRevenue)}`
                    : 'цепочка атрибуции в целом размечена'}
                </div>
              </div>

              {!hasCostData && (
                <p className="text-xs text-muted-foreground mt-3">
                  Если расхода нет, оценивайте каналы по конверсиям L→D и D→P, а не по ROI.
                </p>
              )}
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
                  <div key={ch.id} className="chrona-tier-3">
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
