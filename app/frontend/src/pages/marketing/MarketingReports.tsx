import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getSession,
  getMarketingSpend,
  getCustomers,
  getInvoices,
  getLeads,
  getDeals,
  getPayments,
  getChannelCampaigns,
  getContentMetrics,
} from '@/lib/store';
import { formatKZT } from '@/lib/metrics';
import {
  calculateRevenueControlTowerAnalytics,
  computeSourcePerformance,
  computeContentPerformance,
  computeSystemCompleteness,
} from '@/lib/analytics';

function formatMonthLabel(month: string): string {
  const [year, monthPart] = month.split('-');
  const monthIndex = Number(monthPart) - 1;

  if (!year || Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return month;
  }

  const date = new Date(Number(year), monthIndex, 1);

  return new Intl.DateTimeFormat('ru-KZ', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function percentOrDash(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';
}

export default function MarketingReports() {
  const navigate = useNavigate();
  const session = getSession();

  if (!session) {
    navigate('/');
    return null;
  }

  const companyId = session.companyId;
  const marketingSpend = getMarketingSpend(companyId);
  const customers = getCustomers(companyId);
  const invoices = getInvoices(companyId);
  const leads = getLeads(companyId);
  const deals = getDeals(companyId);
  const payments = getPayments(companyId);
  const channelCampaigns = getChannelCampaigns(companyId);
  const contentMetrics = getContentMetrics(companyId);

  const analytics = useMemo(
    () =>
      calculateRevenueControlTowerAnalytics({
        dateRange: (() => {
          const now = new Date();
          const from = new Date(now);
          from.setDate(from.getDate() - 180);
          return { from: from.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
        })(),
        channelCampaigns,
        leads,
        deals,
        invoices,
        payments,
        customers,
        marketingSpend,
        managers: [],
      }),
    [channelCampaigns, leads, deals, invoices, payments, customers, marketingSpend],
  );

  const channelNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of channelCampaigns) m.set(c.channelCampaignExternalId, c.name);
    return m;
  }, [channelCampaigns]);

  const sourceRows = useMemo(
    () => computeSourcePerformance(analytics.paidRevenueBySource.rows, channelNameById),
    [analytics.paidRevenueBySource.rows, channelNameById],
  );
  const contentSummary = useMemo(() => computeContentPerformance(contentMetrics, 3), [contentMetrics]);
  const completeness = useMemo(
    () =>
      computeSystemCompleteness({
        leads,
        deals,
        invoices,
        payments,
        marketingSpend,
        channelCampaigns,
        contentMetrics,
      }),
    [leads, deals, invoices, payments, marketingSpend, channelCampaigns, contentMetrics],
  );

  const totalSpend = marketingSpend.reduce((sum, item) => sum + item.amount, 0);
  const hasSpend = totalSpend > 0;
  const hasOrganic = contentMetrics.length > 0;
  const hasReportingData = sourceRows.length > 0 || hasOrganic || leads.length > 0 || deals.length > 0;

  const topSources = sourceRows.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 4);
  const weakSources = sourceRows
    .slice()
    .sort((a, b) => (a.dealToPaidRate - b.dealToPaidRate) || (a.revenue - b.revenue))
    .slice(0, 4);

  const trustLabel =
    completeness.overall >= 80 ? 'Exact (точно)' : completeness.overall >= 50 ? 'Fallback (по неполным связям)' : 'Incomplete (неполно)';
  const trustClass =
    completeness.overall >= 80
      ? 'text-teal-600 dark:text-teal-400 border-teal-300/60'
      : completeness.overall >= 50
        ? 'text-amber-600 dark:text-amber-400 border-amber-300/60'
        : 'text-rose-600 dark:text-rose-400 border-rose-300/60';

  return (
    <div className="chrona-page">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="rct-page-title">Отчёты маркетинга</h2>
          <p className="rct-body-micro text-muted-foreground mt-1">
            Отчётный слой: что в маркетинге работает, что слабо и чему можно доверять.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={() => navigate('/marketing/data')}
          >
            Открыть данные
          </Button>
          <Button onClick={() => navigate('/uploads')}>
            Перейти в Загрузки
          </Button>
        </div>
      </div>

      {!hasReportingData ? (
        <Card className="chrona-surface border-dashed">
          <CardHeader>
            <CardTitle>Нет отчётов</CardTitle>
            <CardDescription>
              Загрузите ключевые маркетинг-слои: контент/органика, источники/каналы и расходы.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground mb-6 max-w-md">
              Пока маркетинговые данные не загружены. Отчёты строятся на основе импортированных
              расходов и связанных бизнес-данных компании.
            </p>
            <Button onClick={() => navigate('/uploads')}>
              Перейти в Загрузки
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <Card className="chrona-surface">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Источники с результатом</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{sourceRows.length}</div>
                <p className="text-xs text-muted-foreground mt-1">Каналов со связями до выручки/лидов</p>
              </CardContent>
            </Card>

            <Card className="chrona-surface">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Контент / органика</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{contentSummary.totalContent}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {contentSummary.totalLeads > 0 ? `${contentSummary.totalLeads} лидов из контента` : 'Лиды из контента пока не размечены'}
                </p>
              </CardContent>
            </Card>

            <Card className="chrona-surface">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Маркетинг → выручка</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">
                  {formatKZT(analytics.revenue.value)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {hasSpend ? `Spend: ${formatKZT(totalSpend)}` : 'Органика / без прямых затрат'}
                </p>
              </CardContent>
            </Card>

            <Card className="chrona-surface">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Доверие к отчёту</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="outline" className={trustClass}>
                  {trustLabel}
                </Badge>
                <p className="text-xs text-muted-foreground mt-2">Полнота маркетинг-данных: {completeness.overall}%</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="chrona-hero xl:col-span-2">
              <CardHeader>
                <CardTitle>Сводка эффективности источников</CardTitle>
                <CardDescription>
                  Где внимание становится лидами/деньгами, а где теряется.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {topSources.slice(0, 3).map((s) => (
                    <div key={s.channelCampaignExternalId} className="chrona-muted-surface">
                      <p className="text-sm text-muted-foreground">Работает</p>
                      <p className="mt-2 text-lg font-semibold text-foreground truncate">{s.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Выручка {formatKZT(s.revenue)} · D→P {percentOrDash(s.dealToPaidRate)}
                      </p>
                    </div>
                  ))}
                </div>

                {!hasSpend ? (
                  <div className="mt-4 rounded-lg border border-amber-300/60 bg-amber-100/50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                    Расход по каналам отсутствует или неполный: ROI и стоимость привлечения ограничены. Органические и конверсионные метрики остаются валидными.
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="chrona-surface">
              <CardHeader>
                <CardTitle>Выводы</CardTitle>
                <CardDescription>
                  Что сейчас работает слабее всего
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {weakSources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Пока нет достаточно каналов для ранжирования слабых зон.</p>
                ) : (
                  weakSources.slice(0, 3).map((s) => (
                    <div key={s.channelCampaignExternalId} className="chrona-muted-surface">
                      <p className="text-sm text-muted-foreground truncate">{s.name}</p>
                      <p className="mt-1 text-sm leading-6 text-foreground/90">
                        L→D {percentOrDash(s.leadToDealRate)} · D→P {percentOrDash(s.dealToPaidRate)} · Выручка {formatKZT(s.revenue)}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="chrona-surface">
            <CardHeader>
              <CardTitle>Справка по spend (поддерживающий слой)</CardTitle>
              <CardDescription>
                Расходы по месяцам для метрик эффективности затрат.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {marketingSpend.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет данных по расходам. Для ROI и стоимости привлечения загрузите файл расходов.</p>
              ) : (
                <div className="chrona-table">
                  <table className="text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Период</th>
                        <th className="px-4 py-3 font-medium">Spend</th>
                        <th className="px-4 py-3 font-medium">Доля spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...marketingSpend].sort((a, b) => b.month.localeCompare(a.month)).map((item) => {
                        const sharePercent = totalSpend > 0 ? (item.amount / totalSpend) * 100 : 0;
                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-3 text-foreground font-medium">{formatMonthLabel(item.month)}</td>
                            <td className="px-4 py-3 text-muted-foreground">{formatKZT(item.amount)}</td>
                            <td className="px-4 py-3 text-muted-foreground">{sharePercent.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}