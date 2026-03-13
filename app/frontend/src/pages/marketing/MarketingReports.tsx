import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSession, getMarketingSpend, getCustomers, getInvoices } from '@/lib/store';
import { calculateInvestorMetrics, formatKZT, formatNumber } from '@/lib/metrics';

type SortKey = 'month' | 'amount';
type SortDirection = 'asc' | 'desc';

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

function formatPercentValue(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatRatio(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}x`;
}

export default function MarketingReports() {
  const navigate = useNavigate();
  const session = getSession();

  const [sortKey, setSortKey] = useState<SortKey>('month');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  if (!session) {
    navigate('/');
    return null;
  }

  const marketingSpend = getMarketingSpend(session.companyId);
  const customers = getCustomers(session.companyId);
  const invoices = getInvoices(session.companyId);

  const investorMetrics = calculateInvestorMetrics(customers, invoices, marketingSpend);

  const sortedMarketingSpend = useMemo(() => {
    const rows = [...marketingSpend];

    rows.sort((a, b) => {
      if (sortKey === 'month') {
        const compare = a.month.localeCompare(b.month);
        return sortDirection === 'asc' ? compare : -compare;
      }

      const compare = a.amount - b.amount;
      return sortDirection === 'asc' ? compare : -compare;
    });

    return rows;
  }, [marketingSpend, sortKey, sortDirection]);

  const totalSpend = marketingSpend.reduce((sum, item) => sum + item.amount, 0);
  const averageSpend = marketingSpend.length > 0 ? totalSpend / marketingSpend.length : 0;

  const highestSpendPeriod = marketingSpend.length > 0
    ? [...marketingSpend].sort((a, b) => b.amount - a.amount)[0]
    : null;

  const lowestSpendPeriod = marketingSpend.length > 0
    ? [...marketingSpend].sort((a, b) => a.amount - b.amount)[0]
    : null;

  const latestPeriod = marketingSpend.length > 0
    ? [...marketingSpend].sort((a, b) => b.month.localeCompare(a.month))[0]
    : null;

  const previousPeriod = marketingSpend.length > 1
    ? [...marketingSpend].sort((a, b) => b.month.localeCompare(a.month))[1]
    : null;

  const periodChange =
    latestPeriod && previousPeriod && previousPeriod.amount > 0
      ? ((latestPeriod.amount - previousPeriod.amount) / previousPeriod.amount) * 100
      : null;

  const paidInvoices = invoices.filter((invoice) => invoice.status === 'paid');
  const totalPaidRevenue = paidInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);

  const spendVsRevenuePercent =
    totalPaidRevenue > 0 ? (totalSpend / totalPaidRevenue) * 100 : null;

  const hasMarketingData = marketingSpend.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Отчёты</h2>
          <p className="text-slate-600 mt-1">
            Сводная отчётность по маркетинговым расходам и связанным бизнес-метрикам
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

      {!hasMarketingData ? (
        <Card className="border-dashed border-slate-300 bg-white">
          <CardHeader>
            <CardTitle className="text-slate-900">Нет отчётов</CardTitle>
            <CardDescription className="text-slate-600">
              Загрузите файл marketing spend в разделе «Загрузки», чтобы появились отчёты.
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
                <CardTitle className="text-sm font-medium text-slate-600">Общий spend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{formatKZT(totalSpend)}</div>
                <p className="text-xs text-slate-500 mt-1">Сумма всех маркетинговых периодов</p>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Средний spend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{formatKZT(averageSpend)}</div>
                <p className="text-xs text-slate-500 mt-1">Среднее значение за период</p>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">CAC</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {investorMetrics.cacAvg !== null ? formatKZT(investorMetrics.cacAvg) : '—'}
                </div>
                <p className="text-xs text-slate-500 mt-1">Стоимость привлечения клиента</p>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">LTV:CAC</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatRatio(investorMetrics.ltvCacRatio)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Соотношение ценности клиента к CAC</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="bg-white xl:col-span-2">
              <CardHeader>
                <CardTitle className="text-slate-900">Сводка по периодам</CardTitle>
                <CardDescription className="text-slate-600">
                  Основные выводы по загруженным маркетинговым расходам
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Последний период</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {latestPeriod ? formatMonthLabel(latestPeriod.month) : '—'}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {latestPeriod ? formatKZT(latestPeriod.amount) : 'Нет данных'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Максимальный spend</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {highestSpendPeriod ? formatKZT(highestSpendPeriod.amount) : '—'}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {highestSpendPeriod ? formatMonthLabel(highestSpendPeriod.month) : 'Нет данных'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Минимальный spend</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {lowestSpendPeriod ? formatKZT(lowestSpendPeriod.amount) : '—'}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {lowestSpendPeriod ? formatMonthLabel(lowestSpendPeriod.month) : 'Нет данных'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Изменение к прошлому периоду</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {periodChange === null ? '—' : formatPercentValue(periodChange)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">Динамика последнего периода</p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Spend / Paid Revenue</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {spendVsRevenuePercent === null ? '—' : formatPercentValue(spendVsRevenuePercent)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Доля marketing spend от оплаченной выручки
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Активные клиенты</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {formatNumber(investorMetrics.activeCustomers)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Из {formatNumber(investorMetrics.totalCustomers)} клиентов в базе
                    </p>
                  </div>
                </div>

                {investorMetrics.missingData.length > 0 ? (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Для части метрик не хватает данных: {investorMetrics.missingData.join(', ')}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="text-slate-900">Выводы</CardTitle>
                <CardDescription className="text-slate-600">
                  Краткий аналитический комментарий
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm text-slate-500">Маркетинговая база</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {marketingSpend.length} период(ов)
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm text-slate-500">Оценка покрытия</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {investorMetrics.available ? 'Данные пригодны для анализа' : 'Данные частично неполные'}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm text-slate-500">Главный фокус</p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">
                    {investorMetrics.cacAvg === null
                      ? 'Сначала нужно загрузить и проверить полный набор связанных данных, чтобы корректно считать CAC и эффективность.'
                      : investorMetrics.ltvCacRatio !== null && investorMetrics.ltvCacRatio < 3
                        ? 'Стоит проверить эффективность расходов: соотношение LTV к CAC пока выглядит сдержанно.'
                        : 'Базовые маркетинговые показатели выглядят пригодными для дальнейшего анализа и детализации.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-slate-900">Таблица отчётов</CardTitle>
              <CardDescription className="text-slate-600">
                Детализированный список маркетинговых периодов
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1E3A5F]"
                >
                  <option value="month">Сортировка: период</option>
                  <option value="amount">Сортировка: сумма</option>
                </select>

                <select
                  value={sortDirection}
                  onChange={(e) => setSortDirection(e.target.value as SortDirection)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1E3A5F]"
                >
                  <option value="desc">По убыванию</option>
                  <option value="asc">По возрастанию</option>
                </select>
              </div>

              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-slate-600">
                      <th className="px-4 py-3 font-medium">Период</th>
                      <th className="px-4 py-3 font-medium">Spend</th>
                      <th className="px-4 py-3 font-medium">Доля от общего spend</th>
                      <th className="px-4 py-3 font-medium">Комментарий</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMarketingSpend.map((item) => {
                      const sharePercent = totalSpend > 0 ? (item.amount / totalSpend) * 100 : 0;

                      return (
                        <tr key={item.id} className="border-t border-slate-200">
                          <td className="px-4 py-3 text-slate-900 font-medium">
                            {formatMonthLabel(item.month)}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{formatKZT(item.amount)}</td>
                          <td className="px-4 py-3 text-slate-700">{sharePercent.toFixed(1)}%</td>
                          <td className="px-4 py-3 text-slate-500">
                            {highestSpendPeriod?.id === item.id
                              ? 'Максимальный расход'
                              : lowestSpendPeriod?.id === item.id
                                ? 'Минимальный расход'
                                : 'Стандартный период'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}