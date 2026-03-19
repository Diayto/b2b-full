import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getSession,
  getMarketingSpend,
  getUploads,
  getChannelCampaigns,
  getContentMetrics,
  getLeads,
  getDeals,
} from '@/lib/store';
import { formatKZT } from '@/lib/metrics';
import { computeSystemCompleteness } from '@/lib/analytics';

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
      return 'bg-emerald-100/60 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-800/40';
    case 'processing':
      return 'bg-amber-100/60 dark:bg-amber-900/25 text-amber-700 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800/40';
    case 'pending':
      return 'bg-muted text-muted-foreground border border-border/60';
    case 'error':
      return 'bg-rose-100/60 dark:bg-rose-900/25 text-rose-700 dark:text-rose-300 border border-rose-300/60 dark:border-rose-800/40';
    default:
      return 'bg-muted text-muted-foreground border border-border/60';
  }
}

function fileTypeLabel(type: string): string {
  switch (type) {
    case 'content_metrics':
      return 'Контент / органика';
    case 'channels_campaigns':
      return 'Источники / каналы';
    case 'marketing_spend':
      return 'Расходы';
    case 'leads':
      return 'Лиды';
    case 'deals':
      return 'Сделки';
    default:
      return type;
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

  const companyId = session.companyId;
  const marketingRows = getMarketingSpend(companyId);
  const channelCampaigns = getChannelCampaigns(companyId);
  const contentMetrics = getContentMetrics(companyId);
  const leads = getLeads(companyId);
  const deals = getDeals(companyId);

  const marketingUploads = getUploads(companyId)
    .filter((upload) => ['marketing_spend', 'channels_campaigns', 'content_metrics', 'leads', 'deals'].includes(upload.fileType))
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

  const completeness = useMemo(
    () =>
      computeSystemCompleteness({
        leads,
        deals,
        invoices: [],
        payments: [],
        marketingSpend: marketingRows,
        channelCampaigns,
        contentMetrics,
      }),
    [leads, deals, marketingRows, channelCampaigns, contentMetrics],
  );

  const hasAnyData =
    marketingRows.length > 0 ||
    marketingUploads.length > 0 ||
    channelCampaigns.length > 0 ||
    contentMetrics.length > 0 ||
    leads.length > 0 ||
    deals.length > 0;

  const latestUpload = marketingUploads[0];
  const uploadsByType = useMemo(() => {
    const m = new Map<string, number>();
    for (const up of marketingUploads) m.set(up.fileType, (m.get(up.fileType) ?? 0) + 1);
    return m;
  }, [marketingUploads]);

  return (
    <div className="chrona-page">
      <div>
        <h2 className="rct-page-title">Данные маркетинга</h2>
        <p className="rct-body-micro text-muted-foreground mt-1">
          Центр контроля маркетинг-данных: что загружено, что отсутствует и насколько данные пригодны для аналитики.
        </p>
      </div>

      {!hasAnyData ? (
        <Card className="chrona-surface border-dashed">
          <CardHeader>
            <CardTitle>Нет данных</CardTitle>
            <CardDescription>
              Загрузите маркетинговые файлы: контент/органика, источники/каналы и расходы.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground mb-6 max-w-md">
              Пока нет маркетингового набора данных. Начните с контента/органики, затем добавьте источники и расходы.
            </p>
            <Button onClick={() => navigate('/uploads')}>
              Перейти в Загрузки
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            <Card className="chrona-surface">
              <CardHeader className="pb-3">
                <CardDescription>Контент / органика</CardDescription>
                <CardTitle className="text-2xl text-foreground">{contentMetrics.length}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Органика / Instagram / TikTok</p>
              </CardHeader>
            </Card>

            <Card className="chrona-surface">
              <CardHeader className="pb-3">
                <CardDescription>Источники / каналы</CardDescription>
                <CardTitle className="text-2xl text-foreground">{channelCampaigns.length}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Связь источников и кампаний</p>
              </CardHeader>
            </Card>

            <Card className="chrona-surface">
              <CardHeader className="pb-3">
                <CardDescription>Расходы</CardDescription>
                <CardTitle className="text-2xl text-foreground">
                  {marketingRows.length}
                </CardTitle>
                {latestMonth ? (
                  <p className="text-xs text-muted-foreground mt-1">Последний месяц: {latestMonth}</p>
                ) : null}
              </CardHeader>
            </Card>

            <Card className="chrona-surface">
              <CardHeader className="pb-3">
                <CardDescription>Доверие к маркетинг-данным</CardDescription>
                <CardTitle className="text-2xl text-foreground">{completeness.overall}%</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {completeness.overall >= 80 ? 'Exact (точно)' : completeness.overall >= 50 ? 'Fallback (по неполным связям)' : 'Incomplete (неполно)'}
                </p>
              </CardHeader>
            </Card>
          </div>

          <Card className="chrona-hero">
            <CardHeader>
              <CardTitle>Готовность маркетинг-аналитики</CardTitle>
              <CardDescription>
                Быстрый ответ: достаточно ли данных для отчётов и overview.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  Органика: {contentMetrics.length > 0 ? 'загружена' : 'отсутствует'}
                </Badge>
                <Badge variant="outline">
                  Каналы: {channelCampaigns.length > 0 ? 'загружены' : 'отсутствуют'}
                </Badge>
                <Badge variant="outline">
                  Расход: {marketingRows.length > 0 ? 'загружен' : 'отсутствует'}
                </Badge>
                <Badge variant="outline">
                  CRM связка: {leads.length > 0 && deals.length > 0 ? 'частично есть' : 'ограничена'}
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground">
                {contentMetrics.length > 0 && marketingRows.length === 0
                  ? 'Органика доступна, но метрики затрат (ROI и стоимость привлечения) будут ограничены без данных по расходам.'
                  : contentMetrics.length === 0 && marketingRows.length > 0
                    ? 'Расход есть, но без контент-данных не виден вклад публикаций и органики.'
                    : contentMetrics.length > 0 && marketingRows.length > 0
                      ? 'Есть и органика, и расходы — отчёты будут наиболее полными.'
                      : 'Загрузите хотя бы один ключевой слой (контент/органика или расходы), чтобы начать анализ.'}
              </p>
            </CardContent>
          </Card>

          <Card className="chrona-surface">
            <CardHeader>
              <CardTitle>История загрузок</CardTitle>
              <CardDescription>
                Последние импорты маркетинговых файлов
              </CardDescription>
            </CardHeader>
            <CardContent>
              {marketingUploads.length === 0 ? (
                <div className="h-40 flex items-center justify-center bg-muted/30 rounded-md border border-border/60">
                  <p className="text-muted-foreground">Маркетинговые загрузки пока отсутствуют</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {Array.from(uploadsByType.entries()).map(([type, count]) => (
                      <Badge key={type} variant="secondary" className="text-xs">
                        {fileTypeLabel(type)}: {count}
                      </Badge>
                    ))}
                  </div>

                  {latestUpload && (
                    <p className="text-xs text-muted-foreground">
                      Последняя загрузка: {latestUpload.originalFileName} · {formatDateTime(latestUpload.createdAt)}
                    </p>
                  )}

                  <div className="chrona-table">
                  <table className="text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Тип</th>
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
                        <tr key={upload.id}>
                          <td className="px-4 py-3 text-muted-foreground">{fileTypeLabel(upload.fileType)}</td>
                          <td className="px-4 py-3 text-foreground font-medium">{upload.originalFileName}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClasses(upload.status)}`}
                            >
                              {formatUploadStatus(upload.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{upload.totalRows}</td>
                          <td className="px-4 py-3 text-muted-foreground">{upload.successRows}</td>
                          <td className="px-4 py-3 text-muted-foreground">{upload.errorRows}</td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDateTime(upload.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="chrona-surface">
            <CardHeader>
              <CardTitle>Базовые записи расходов</CardTitle>
              <CardDescription>
                Источник для метрик затрат и сравнения периодов.
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
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="month">Сортировка: месяц</option>
                    <option value="amount">Сортировка: сумма</option>
                  </select>

                  <select
                    value={sortDirection}
                    onChange={(e) => setSortDirection(e.target.value as SortDirection)}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="desc">По убыванию</option>
                    <option value="asc">По возрастанию</option>
                  </select>
                </div>
              </div>

              {filteredRows.length === 0 ? (
                <div className="h-56 flex items-center justify-center bg-muted/30 rounded-md border border-border/60">
                  <p className="text-muted-foreground">
                    По текущему фильтру записи не найдены
                  </p>
                </div>
              ) : (
                <div className="chrona-table">
                  <table className="text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Месяц</th>
                        <th className="px-4 py-3 font-medium">Сумма</th>
                        <th className="px-4 py-3 font-medium">Upload ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-3 text-foreground font-medium">{row.month}</td>
                          <td className="px-4 py-3 text-muted-foreground">{formatKZT(row.amount)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{row.uploadId || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-muted-foreground">
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