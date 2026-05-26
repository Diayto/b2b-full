import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ControlTowerKpiCard from '@/components/controltower/ControlTowerKpiCard';
import MarketingSupplementUpload from '@/components/MarketingSupplementUpload';
import EmptyStateCard from '@/components/controltower/EmptyStateCard';
import {
  resolveOwnerCloudBundle,
  type OwnerCloudBundle,
} from '@/lib/ownerCloudBundle';
import { CHRONA_DEMO_PROCESSED_METRICS_ROW, allowChronaDemoFallback } from '@/lib/chronaDemoPreview';
import { buildFunnelBreakdown } from '@/lib/chronaSourceCredibility';
import { parseMatchedRule } from '@/lib/insightExecutionPlan';
import {
  computePeriodEfficiency,
  enrichChannels,
  extractMarketingBundle,
  formatMoneyShort,
  formatPct,
  topContentByLeads,
} from '@/lib/marketingAnalytics';
import { formatKZT } from '@/lib/metrics';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

const EMPTY_ILLU =
  'https://mgx-backend-cdn.metadl.com/generate/images/977836/2026-02-19/7965a3e5-68d6-4367-bc84-3890e3b4889b.png';

function reachLabel(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} тыс.`;
  return String(n);
}

export default function MarketingPage() {
  const navigate = useNavigate();
  const [bundle, setBundle] = useState<OwnerCloudBundle | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setBundle(await resolveOwnerCloudBundle());
    } catch {
      if (allowChronaDemoFallback()) {
        setBundle({
          row: CHRONA_DEMO_PROCESSED_METRICS_ROW,
          insight: null,
          source: 'demo',
          isStaticDemo: true,
          fetchError: null,
        });
      } else {
        setBundle({ row: null, insight: null, source: 'empty', isStaticDemo: false, fetchError: 'Ошибка загрузки' });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const row = bundle?.row ?? null;
  const raw = (row?.raw_data ?? {}) as Record<string, unknown>;
  const marketing = useMemo(() => extractMarketingBundle(raw), [raw]);
  const efficiency = useMemo(() => (row ? computePeriodEfficiency(row) : null), [row]);
  const channels = useMemo(() => enrichChannels(marketing.channels), [marketing.channels]);
  const topContent = useMemo(() => topContentByLeads(marketing.content, 5), [marketing.content]);
  const rule = parseMatchedRule(bundle?.insight ?? null);
  const funnel = row ? buildFunnelBreakdown(row, raw, rule) : null;

  const periodLabel =
    row?.period_start && row?.period_end ? `${row.period_start} — ${row.period_end}` : 'Период не задан';

  const showEmpty = !loading && !row;

  return (
    <AppLayout>
      <div className="chrona-page max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 pb-3">
          <div>
            <h1 className="rct-page-title">Маркетинг</h1>
            <p className="rct-body-micro mt-1 text-muted-foreground">
              Эффективность периода, каналы и контент — на основе свода из «Данные».
            </p>
            {row ? (
              <p className="text-xs text-muted-foreground mt-2 tabular-nums">Период: {periodLabel}</p>
            ) : null}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void reload()}>
              Обновить
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
              <Link to="/uploads">Данные</Link>
            </Button>
          </div>
        </div>

        {bundle?.isStaticDemo ? (
          <Badge variant="outline" className="text-xs">
            Демо-превью
          </Badge>
        ) : null}

        {loading ? <p className="text-sm text-muted-foreground">Загрузка…</p> : null}

        {showEmpty ? (
          <EmptyStateCard
            title="Нет снимка периода"
            description="Сначала загрузите свод на странице «Данные» — затем здесь появятся CPL, каналы и топ контента."
            imageUrl={EMPTY_ILLU}
            ctaLabel="Перейти к данным"
            onCta={() => navigate('/uploads')}
          />
        ) : null}

        {!loading && row && efficiency ? (
          <>
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Эффективность</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                <ControlTowerKpiCard
                  title="CPL"
                  value={formatMoneyShort(efficiency.cpl)}
                  subtitle="расход / лид"
                  status={efficiency.cpl !== null && efficiency.cpl > 25_000 ? 'warning' : 'default'}
                />
                <ControlTowerKpiCard
                  title="Лид → сделка"
                  value={formatPct(efficiency.leadToDealPct)}
                  subtitle={`${efficiency.deals} из ${efficiency.leads}`}
                  status={
                    efficiency.leadToDealPct !== null && efficiency.leadToDealPct < 15 ? 'danger' : 'default'
                  }
                />
                <ControlTowerKpiCard
                  title="Стоимость сделки"
                  value={formatMoneyShort(efficiency.costPerDeal)}
                  subtitle="расход / сделка"
                />
                <ControlTowerKpiCard
                  title="Средний чек"
                  value={efficiency.avgCheck !== null ? formatKZT(efficiency.avgCheck) : '—'}
                  subtitle="выручка / сделка"
                />
                <ControlTowerKpiCard
                  title="ROMI"
                  value={formatPct(efficiency.romiPct)}
                  subtitle="(выручка − расход) / расход"
                  status={
                    efficiency.romiPct !== null && efficiency.romiPct < 0
                      ? 'danger'
                      : efficiency.romiPct !== null && efficiency.romiPct > 50
                        ? 'success'
                        : 'default'
                  }
                />
              </div>
            </section>

            {funnel ? (
              <section className="rounded-xl border border-border bg-card p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Воронка</p>
                <div className="flex flex-wrap items-end gap-4 sm:gap-8">
                  {funnel.stages.map((s, i) => (
                    <div key={s.label} className="min-w-[100px]">
                      <p className="text-2xl font-semibold tabular-nums text-foreground">{s.count}</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-[140px] leading-snug">{s.label}</p>
                      {i < funnel.stages.length - 1 ? (
                        <span className="hidden sm:inline text-muted-foreground/40 text-lg ml-2">→</span>
                      ) : null}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">{funnel.mainDrop}</p>
              </section>
            ) : null}

            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Каналы</p>
              {channels.length > 0 ? (
                <div className="rounded-xl border border-border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2.5 font-medium">Источник</th>
                        <th className="px-4 py-2.5 font-medium text-right">Расход</th>
                        <th className="px-4 py-2.5 font-medium text-right">Лиды</th>
                        <th className="px-4 py-2.5 font-medium text-right">Сделки</th>
                        <th className="px-4 py-2.5 font-medium text-right">CPL</th>
                        <th className="px-4 py-2.5 font-medium text-right">Конв.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channels.map((c) => (
                        <tr key={c.name} className="border-b border-border/50 last:border-0">
                          <td className="px-4 py-2.5 font-medium">{c.name}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{formatKZT(c.spend)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{c.leads}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{c.deals}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{formatMoneyShort(c.cpl)}</td>
                          <td
                            className={cn(
                              'px-4 py-2.5 text-right tabular-nums',
                              c.leadToDealPct !== null && c.leadToDealPct < 12 && 'text-destructive font-medium',
                            )}
                          >
                            {formatPct(c.leadToDealPct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-4 py-3">
                  Нет разбивки по каналам — загрузите файл ниже или включите демо на «Данные».
                </p>
              )}
            </section>

            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Топ контента по лидам</p>
              {topContent.length > 0 ? (
                <div className="rounded-xl border border-border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2.5 font-medium">Пост / ролик</th>
                        <th className="px-4 py-2.5 font-medium text-right">Охват</th>
                        <th className="px-4 py-2.5 font-medium text-right">Лиды</th>
                        <th className="px-4 py-2.5 font-medium text-right">Оплаты</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topContent.map((c) => (
                        <tr key={c.id} className="border-b border-border/50 last:border-0">
                          <td className="px-4 py-2.5">
                            <p className="font-medium truncate max-w-[220px]">{c.title}</p>
                            <p className="text-[11px] text-muted-foreground">{c.id}</p>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{reachLabel(c.reach)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium">{c.leads}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{c.conversions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-4 py-3">
                  Нет таблицы контента — выгрузите Insights в CSV (шаблон ниже) без подключения Instagram API.
                </p>
              )}
            </section>

            {isSupabaseConfigured() ? <MarketingSupplementUpload onSaved={() => void reload()} /> : null}

            <p className="text-xs text-muted-foreground">
              Главная проблема периода — на{' '}
              <Link to="/dashboard" className="text-primary hover:underline">
                главном экране
              </Link>
              , разбор правил — в{' '}
              <Link to="/insights" className="text-primary hover:underline">
                «Разбор»
              </Link>
              .
            </p>
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
