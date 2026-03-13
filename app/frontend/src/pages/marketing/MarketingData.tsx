import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSession, getMarketingSpend, getUploads } from '@/lib/store';
import { formatKZT } from '@/lib/metrics';

type SortKey = 'month' | 'amount';
type SortDirection = 'asc' | 'desc';

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat('ru-KZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatUploadStatus(status: string): string {
  switch (status) {
    case 'completed':
      return 'Завершено';
    case 'processing':
      return 'В обработке';
    case 'pending':
      return 'В ожидании';
    case 'error':
      return 'Ошибка';
    default:
      return status;
  }
}

function getStatusClasses(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'processing':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'pending':
      return 'bg-slate-100 text-slate-700 border border-slate-200';
    case 'error':
      return 'bg-rose-50 text-rose-700 border border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 border border-slate-200';
  }
}

export default function MarketingData() {
  const navigate = useNavigate();
  const session = getSession();

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('month');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  if (!session) {
    navigate('/');
    return null;
  }

  const marketingRows = getMarketingSpend(session.companyId);
  const marketingUploads = getUploads(session.companyId)
    .filter((upload) => upload.fileType === 'marketing_spend')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const rows = marketingRows.filter((row) => {
      if (!normalizedSearch) return true;
      return row.month.toLowerCase().includes(normalizedSearch);
    });

    rows.sort((a, b) => {
      if (sortKey === 'month') {
        const compare = a.month.localeCompare(b.month);
        return sortDirection === 'asc' ? compare : -compare;
      }

      const compare = a.amount - b.amount;
      return sortDirection === 'asc' ? compare : -compare;
    });

    return rows;
  }, [marketingRows, search, sortKey, sortDirection]);

  const totalSpend = marketingRows.reduce((sum, row) => sum + row.amount, 0);
  const latestMonth = marketingRows.length
    ? [...marketingRows].sort((a, b) => b.month.localeCompare(a.month))[0].month
    : null;

  const averageSpend = marketingRows.length > 0 ? totalSpend / marketingRows.length : 0;

  const hasAnyData = marketingRows.length > 0 || marketingUploads.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Данные</h2>
        <p className="text-slate-600 mt-1">
          Исходные маркетинговые данные, история загрузок и сырые записи
        </p>
      </div>

      {!hasAnyData ? (
        <Card className="border-dashed border-slate-300 bg-white">
          <CardHeader>
            <CardTitle className="text-slate-900">Нет данных</CardTitle>
            <CardDescription className="text-slate-600">
              Импортируйте файл marketing spend, чтобы появились исходные данные и история загрузок.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-slate-500 mb-6 max-w-md">
              Пока маркетинговые данные не загружены. Перейдите в раздел Загрузки и импортируйте файл
              с колонками month и amount.
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-white">
              <CardHeader className="pb-3">
                <CardDescription className="text-slate-500">Всего записей</CardDescription>
                <CardTitle className="text-2xl text-slate-900">{marketingRows.length}</CardTitle>
              </CardHeader>
            </Card>

            <Card className="bg-white">
              <CardHeader className="pb-3">
                <CardDescription className="text-slate-500">Общий spend</CardDescription>
                <CardTitle className="text-2xl text-slate-900">{formatKZT(totalSpend)}</CardTitle>
              </CardHeader>
            </Card>

            <Card className="bg-white">
              <CardHeader className="pb-3">
                <CardDescription className="text-slate-500">Средний spend</CardDescription>
                <CardTitle className="text-2xl text-slate-900">
                  {marketingRows.length > 0 ? formatKZT(averageSpend) : '—'}
                </CardTitle>
                {latestMonth ? (
                  <p className="text-xs text-slate-500 mt-1">Последний период: {latestMonth}</p>
                ) : null}
              </CardHeader>
            </Card>
          </div>

          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-slate-900">История загрузок</CardTitle>
              <CardDescription className="text-slate-600">
                Последние импорты файлов marketing spend
              </CardDescription>
            </CardHeader>
            <CardContent>
              {marketingUploads.length === 0 ? (
                <div className="h-40 flex items-center justify-center bg-slate-50 rounded-md border border-slate-200">
                  <p className="text-slate-500">Маркетинговые загрузки пока отсутствуют</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-slate-600">
                        <th className="px-4 py-3 font-medium">Файл</th>
                        <th className="px-4 py-3 font-medium">Статус</th>
                        <th className="px-4 py-3 font-medium">Строк</th>
                        <th className="px-4 py-3 font-medium">Успешно</th>
                        <th className="px-4 py-3 font-medium">Ошибки</th>
                        <th className="px-4 py-3 font-medium">Загружен</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketingUploads.map((upload) => (
                        <tr key={upload.id} className="border-t border-slate-200">
                          <td className="px-4 py-3 text-slate-900 font-medium">{upload.originalFileName}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClasses(upload.status)}`}
                            >
                              {formatUploadStatus(upload.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{upload.totalRows}</td>
                          <td className="px-4 py-3 text-slate-700">{upload.successRows}</td>
                          <td className="px-4 py-3 text-slate-700">{upload.errorRows}</td>
                          <td className="px-4 py-3 text-slate-700">{formatDateTime(upload.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-slate-900">Сырые данные</CardTitle>
              <CardDescription className="text-slate-600">
                Все записи marketing spend, сохранённые после импорта
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                <div className="flex-1">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск по месяцу, например 2026-03"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1E3A5F] focus:ring-2 focus:ring-[#1E3A5F]/10"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1E3A5F]"
                  >
                    <option value="month">Сортировка: месяц</option>
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
              </div>

              {filteredRows.length === 0 ? (
                <div className="h-56 flex items-center justify-center bg-slate-50 rounded-md border border-slate-200">
                  <p className="text-slate-500">
                    По текущему фильтру записи не найдены
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-slate-600">
                        <th className="px-4 py-3 font-medium">Месяц</th>
                        <th className="px-4 py-3 font-medium">Сумма</th>
                        <th className="px-4 py-3 font-medium">Upload ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <tr key={row.id} className="border-t border-slate-200">
                          <td className="px-4 py-3 text-slate-900 font-medium">{row.month}</td>
                          <td className="px-4 py-3 text-slate-700">{formatKZT(row.amount)}</td>
                          <td className="px-4 py-3 text-slate-500">{row.uploadId || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-slate-500">
                <span>Показано записей: {filteredRows.length}</span>
                <span>Всего в хранилище: {marketingRows.length}</span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}