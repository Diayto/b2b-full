import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSession, getMarketingSpend, getCustomers, getInvoices, getSignals } from '@/lib/store';
import { calculateInvestorMetrics, formatKZT, formatNumber } from '@/lib/metrics';

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

function formatRatio(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}x`;
}

function formatPercentValue(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

function severityStyles(severity: string): string {
  switch (severity) {
    case 'high':
      return 'bg-rose-50 text-rose-700 border border-rose-200';
    case 'medium':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'low':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    default:
      return 'bg-slate-100 text-slate-700 border border-slate-200';
  }
}

function severityLabel(severity: string): string {
  switch (severity) {
    case 'high':
      return 'Высокий';
    case 'medium':
      return 'Средний';
    case 'low':
      return 'Низкий';
    default:
      return severity;
  }
}

export default function MarketingDashboard() {
  const navigate = useNavigate();
  const session = getSession();
  const companyId = session?.companyId ?? '';

  const marketingSpend = getMarketingSpend(companyId);
  const customers = getCustomers(companyId);
  const invoices = getInvoices(companyId);
  const signals = getSignals(companyId)
    .filter((signal) => signal.status === 'open')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const investorMetrics = calculateInvestorMetrics(customers, invoices, marketingSpend);

  const sortedMarketingSpend = useMemo(() => {
    return [...marketingSpend].sort((a, b) => a.month.localeCompare(b.month));
  }, [marketingSpend]);

  const totalSpend = marketingSpend.reduce((sum, row) => sum + row.amount, 0);
  const averageMonthlySpend = marketingSpend.length > 0 ? totalSpend / marketingSpend.length : 0;

  const latestPeriod = sortedMarketingSpend.length > 0
    ? sortedMarketingSpend[sortedMarketingSpend.length - 1]
    : null;

  const previousPeriod = sortedMarketingSpend.length > 1
    ? sortedMarketingSpend[sortedMarketingSpend.length - 2]
    : null;

  const spendChangePercent =
    latestPeriod && previousPeriod && previousPeriod.amount > 0
      ? ((latestPeriod.amount - previousPeriod.amount) / previousPeriod.amount) * 100
      : null;

  const recentPeriods = [...sortedMarketingSpend].reverse().slice(0, 6);

  const hasMarketingData = marketingSpend.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Маркетинг Дашборд</h2>
          <p className="text-slate-600 mt-1">Обзор расходов, CAC и связанных бизнес-метрик</p>
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
            className="bg-[#1E3A5F] hover:bg-[#1E3A5F]/90 text-white"
          >
            Перейти в Загрузки
          </Button>
        </div>
      </div>

      {!hasMarketingData ? (
        <Card className="border-dashed border-slate-300 bg-white">
          <CardHeader>
            <CardTitle className="text-slate-900">Нет данных по маркетингу</CardTitle>
            <CardDescription className="text-slate-600">
              Импортируйте файл marketing spend в разделе Загрузки, чтобы увидеть KPI и динамику.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-slate-500 mb-6 max-w-md">
              Пока маркетинговые данные не загружены. После импорта здесь появятся расходы по периодам,
              CAC, LTV:CAC и связанный обзор по компании.
            </p>
            <Button
              onClick={() => navigate('/uploads')}
              className="bg-[#1E3A5F] hover:bg-[#1E3A5F]/90 text-white"
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
                <CardTitle className="text-sm font-medium text-slate-600">Общий spend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{formatKZT(totalSpend)}</div>
                <p className="text-xs text-slate-500 mt-1">
                  Периодов в данных: {marketingSpend.length}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Средний spend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{formatKZT(averageMonthlySpend)}</div>
                <p className="text-xs text-slate-500 mt-1">
                  Среднее значение на период
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Последний период</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {latestPeriod ? formatKZT(latestPeriod.amount) : '—'}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {latestPeriod ? formatMonthLabel(latestPeriod.month) : 'Нет данных'}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Изменение к прошлому периоду</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {spendChangePercent === null ? '—' : formatPercentValue(spendChangePercent)}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Сравнение последнего и предыдущего периода
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="bg-white xl:col-span-2">
              <CardHeader>
                <CardTitle className="text-slate-900">Инвесторские метрики</CardTitle>
                <CardDescription className="text-slate-600">
                  Расчёт на основе customers, invoices и marketing spend
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">CAC</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {investorMetrics.cacAvg !== null ? formatKZT(investorMetrics.cacAvg) : '—'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Средняя стоимость привлечения клиента</p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">LTV</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {formatKZT(investorMetrics.ltvAvg)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Средняя lifetime value по оплаченной выручке</p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">LTV:CAC</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {formatRatio(investorMetrics.ltvCacRatio)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Соотношение ценности клиента к стоимости привлечения</p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Всего клиентов</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {formatNumber(investorMetrics.totalCustomers)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Размер клиентской базы</p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Активные клиенты</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {formatNumber(investorMetrics.activeCustomers)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Клиенты с оплаченной выручкой</p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Retention</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {formatPercentValue(investorMetrics.retentionRate)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Доля активных клиентов в базе</p>
                  </div>
                </div>

                {investorMetrics.missingData.length > 0 ? (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Неполные данные для части метрик: {investorMetrics.missingData.join(', ')}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="text-slate-900">Сводка по маркетингу</CardTitle>
                <CardDescription className="text-slate-600">
                  Быстрый контекст по текущему состоянию
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm text-slate-500">Последний месяц</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {latestPeriod ? formatMonthLabel(latestPeriod.month) : '—'}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm text-slate-500">Записей в marketing spend</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{marketingSpend.length}</p>
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm text-slate-500">Статус данных</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {investorMetrics.available ? 'Доступны для расчётов' : 'Частично доступны'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-slate-900">Последние маркетинговые периоды</CardTitle>
              <CardDescription className="text-slate-600">
                Последние 6 записей marketing spend
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-slate-600">
                      <th className="px-4 py-3 font-medium">Период</th>
                      <th className="px-4 py-3 font-medium">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPeriods.map((item) => (
                      <tr key={item.id} className="border-t border-slate-200">
                        <td className="px-4 py-3 text-slate-900 font-medium">
                          {formatMonthLabel(item.month)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatKZT(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-slate-900">Сигналы</CardTitle>
              <CardDescription className="text-slate-600">
                Открытые сигналы компании, связанные с общим состоянием бизнеса
              </CardDescription>
            </CardHeader>
            <CardContent>
              {signals.length === 0 ? (
                <div className="h-40 flex items-center justify-center rounded-md border border-slate-200 bg-slate-50">
                  <p className="text-slate-500">Открытых сигналов пока нет</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {signals.slice(0, 6).map((signal) => (
                    <div
                      key={signal.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{signal.title}</p>
                          <p className="mt-1 text-sm text-slate-600">{signal.description}</p>
                        </div>

                        <span
                          className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium ${severityStyles(signal.severity)}`}
                        >
                          {severityLabel(signal.severity)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}