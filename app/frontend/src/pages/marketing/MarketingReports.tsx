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
    completeness.overall >= 80 ? 'Точные данные' : completeness.overall >= 50 ? 'Частичные данные' : 'Неполные данные';
  const trustClass =
    completeness.overall >= 80
      ? 'text-teal-600 dark:text-teal-400 border-teal-300/60'
      : completeness.overall >= 50
        ? 'text-amber-600 dark:text-amber-400 border-amber-300/60'
        : 'text-rose-600 dark:text-rose-400 border-rose-300/60';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Отчёты</h2>
          <p className="text-slate-600 mt-1">
            Отчётный слой: что в маркетинге работает, что слабо и чему можно доверять.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={() => navigate('/marketing/data')}
            className="border-slate-300 text-slate-700"
          >
            Открыть данные
          </Button>
          <Button
            onClick={() => navigate('/uploads')}
            className="bg-[#1E3A5F] hover:bg-[#1E3A5F]/90 text-white px-6"
          >
            Перейти в Загрузки
          </Button>
        </div>
      </div>

      {!hasReportingData ? (
        <Card className="border-dashed border-slate-300 bg-white">
          <CardHeader>
            <CardTitle className="text-slate-900">Нет отчётов</CardTitle>
            <CardDescription className="text-slate-600">
              Загрузите маркетинговые данные (content_metrics, channels_campaigns, marketing_spend), чтобы сформировать отчёт.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-slate-500 mb-6 max-w-md">
              Пока маркетинговые данные не загружены. Отчёты строятся на основе импортированных
              расходов и связанных бизнес-данных компании.
            </p>
            <Button
              onClick={() => navigate('/uploads')}
              className="bg-[#1E3A5F] hover:bg-[#1E3A5F]/90 text-white px-6"
            >
              Перейти в Загрузки
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Источники с результатом</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{sourceRows.length}</div>
                <p className="text-xs text-slate-500 mt-1">Каналов со связями до выручки/лидов</p>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Контент / органика</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{contentSummary.totalContent}</div>
                <p className="text-xs text-slate-500 mt-1">
                  {contentSummary.totalLeads > 0 ? `${contentSummary.totalLeads} лидов из контента` : 'Лиды из контента пока не размечены'}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Маркетинг → выручка</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatKZT(analytics.revenue.value)}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {hasSpend ? `Spend: ${formatKZT(totalSpend)}` : 'Органика / без прямых затрат'}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Доверие к отчёту</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="outline" className={trustClass}>
                  {trustLabel}
                </Badge>
                <p className="text-xs text-slate-500 mt-2">Полнота маркетинг-данных: {completeness.overall}%</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="bg-white xl:col-span-2">
              <CardHeader>
                <CardTitle className="text-slate-900">Сводка эффективности источников</CardTitle>
                <CardDescription className="text-slate-600">
                  Где внимание становится лидами/деньгами, а где теряется.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {topSources.slice(0, 3).map((s) => (
                    <div key={s.channelCampaignExternalId} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">Работает</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900 truncate">{s.name}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Выручка {formatKZT(s.revenue)} · D→P {percentOrDash(s.dealToPaidRate)}
                      </p>
                    </div>
                  ))}
                </div>

                {!hasSpend ? (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Расход по каналам отсутствует или неполный: ROI/CAC-интерпретация ограничена. Органические и конверсионные метрики остаются валидными.
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="text-slate-900">Выводы</CardTitle>
                <CardDescription className="text-slate-600">
                  Что сейчас работает слабее всего
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {weakSources.length === 0 ? (
                  <p className="text-sm text-slate-600">Пока нет достаточно каналов для ранжирования слабых зон.</p>
                ) : (
                  weakSources.slice(0, 3).map((s) => (
                    <div key={s.channelCampaignExternalId} className="rounded-lg border border-slate-200 p-4">
                      <p className="text-sm text-slate-500 truncate">{s.name}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-700">
                        L→D {percentOrDash(s.leadToDealRate)} · D→P {percentOrDash(s.dealToPaidRate)} · Выручка {formatKZT(s.revenue)}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-slate-900">Справка по spend (поддерживающий слой)</CardTitle>
              <CardDescription className="text-slate-600">
                Расходы по месяцам для cost-based метрик.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {marketingSpend.length === 0 ? (
                <p className="text-sm text-slate-600">Нет marketing_spend. Для ROI/CAC загрузите файл расходов.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-slate-600">
                        <th className="px-4 py-3 font-medium">Период</th>
                        <th className="px-4 py-3 font-medium">Spend</th>
                        <th className="px-4 py-3 font-medium">Доля spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...marketingSpend].sort((a, b) => b.month.localeCompare(a.month)).map((item) => {
                        const sharePercent = totalSpend > 0 ? (item.amount / totalSpend) * 100 : 0;
                        return (
                          <tr key={item.id} className="border-t border-slate-200">
                            <td className="px-4 py-3 text-slate-900 font-medium">{formatMonthLabel(item.month)}</td>
                            <td className="px-4 py-3 text-slate-700">{formatKZT(item.amount)}</td>
                            <td className="px-4 py-3 text-slate-700">{sharePercent.toFixed(1)}%</td>
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