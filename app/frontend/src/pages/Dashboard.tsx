// Chrona — Owner decision surface (Supabase + centralized preview fallback)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatKZT } from '@/lib/metrics';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import type { ProcessedMetricsRow } from '@/lib/supabaseMetrics';
import type { InsightRow } from '@/lib/supabaseInsights';
import { buildExecutionPlan, parseMatchedRule } from '@/lib/insightExecutionPlan';
import {
  resolveOwnerCloudBundle,
  getChronaDemoInsightRow,
  type OwnerCloudBundle,
} from '@/lib/ownerCloudBundle';
import {
  CHRONA_DEMO_PROCESSED_METRICS_ROW,
  allowChronaDemoFallback,
  isAcceleratorDemoMode,
} from '@/lib/chronaDemoPreview';
import { resolveInstagramSignal, resolveTableSourceSignal } from '@/lib/chronaSourceCredibility';
import EmptyStateCard from '@/components/controltower/EmptyStateCard';
import ControlTowerKpiCard from '@/components/controltower/ControlTowerKpiCard';
import OwnerBusinessChain from '@/components/OwnerBusinessChain';
import OwnerSourceSignalCards from '@/components/OwnerSourceSignalCards';
import { cn } from '@/lib/utils';

const EMPTY_ILLU =
  'https://mgx-backend-cdn.metadl.com/generate/images/977836/2026-02-19/7965a3e5-68d6-4367-bc84-3890e3b4889b.png';

function moneyOrDash(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return formatKZT(value);
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const accelerator = isAcceleratorDemoMode();
  const [bundle, setBundle] = useState<OwnerCloudBundle | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const b = await resolveOwnerCloudBundle();
      setBundle(b);
    } catch {
      if (allowChronaDemoFallback()) {
        setBundle({
          row: CHRONA_DEMO_PROCESSED_METRICS_ROW,
          insight: getChronaDemoInsightRow(),
          source: 'demo',
          isStaticDemo: true,
          fetchError: null,
        });
      } else {
        setBundle({
          row: null,
          insight: null,
          source: 'empty',
          isStaticDemo: false,
          fetchError: 'Не удалось загрузить данные',
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const row: ProcessedMetricsRow | null = bundle?.row ?? null;
  const insight: InsightRow | null = bundle?.insight ?? null;
  const isStaticDemo = bundle?.isStaticDemo ?? false;
  const bundleSource = bundle?.source ?? 'empty';
  const fetchError = bundle?.fetchError ?? null;

  const plan = useMemo(() => buildExecutionPlan(insight), [insight]);
  const matchedRule = useMemo(() => parseMatchedRule(insight), [insight]);
  const sourceSignals = useMemo(() => {
    if (!row) {
      return {
        instagram: null as ReturnType<typeof resolveInstagramSignal>,
        table: null as ReturnType<typeof resolveTableSourceSignal> | null,
      };
    }
    const rawLocal = (row.raw_data ?? {}) as Record<string, unknown>;
    return {
      instagram: resolveInstagramSignal(row, rawLocal),
      table: resolveTableSourceSignal(row, rawLocal),
    };
  }, [row]);

  const periodLabel =
    row?.period_start && row?.period_end ? `${row.period_start} — ${row.period_end}` : 'Период не задан';

  const raw = (row?.raw_data ?? {}) as Record<string, unknown>;
  const revenueDisplay =
    raw.source === 'instagram_pipeline'
      ? String(Math.round(Number(row?.revenue ?? 0)))
      : moneyOrDash(Number(row?.revenue ?? 0));

  const showTrueEmpty = !loading && bundle && !row && bundleSource === 'empty' && !fetchError;

  const showErrorNoData = !loading && bundle && fetchError && !row;

  return (
    <AppLayout>
      <div className="chrona-page">
        {loading && <p className="text-sm text-muted-foreground py-3">Загрузка…</p>}

        {showErrorNoData && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {fetchError}
          </div>
        )}

        {showTrueEmpty && (
          <EmptyStateCard
            title="Нет метрик в облаке"
            description={
              accelerator
                ? 'Загрузите сводный файл или подключите источник на странице «Данные» — главный экран заполнится автоматически.'
                : isSupabaseConfigured()
                  ? 'Загрузите сводный файл на странице «Данные» или вставьте строку в Supabase с company_id = вашему UUID из Auth. Без облака: кнопка «Демо-сценарий» на «Данных» или VITE_CHRONA_DEMO_PREVIEW=true.'
                  : 'Укажите Supabase в .env или включите демо на странице «Данные».'
            }
            imageUrl={EMPTY_ILLU}
            ctaLabel="Подключить данные"
            onCta={() => navigate('/uploads')}
            className="text-center"
          />
        )}

        {!loading && row && (
          <div className="rct-section-gap space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/50 pb-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                <p className="text-xs text-muted-foreground">
                  Период{' '}
                  <span className="text-foreground font-medium tabular-nums">{periodLabel}</span>
                  {row.created_at ? (
                    <>
                      {' '}
                      · обновлено {new Date(row.created_at).toLocaleString('ru-KZ')}
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={() => navigate('/uploads')}>
                  Данные
                </Button>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={() => void reload()}>
                  Обновить
                </Button>
              </div>
            </div>

            {insight ? (
              <div className="space-y-6">
                <div className="rounded-2xl border-2 border-primary/35 bg-primary/[0.06] dark:bg-primary/10 p-6 sm:p-8 shadow-sm space-y-5">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <Badge className="bg-primary text-primary-foreground hover:bg-primary/90">Приоритет периода</Badge>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Главная проблема</p>
                    <p className="text-lg sm:text-xl font-semibold text-foreground leading-snug tracking-tight">
                      {insight.main_issue}
                    </p>
                    {plan ? (
                      <>
                        <p className="text-sm text-primary font-medium mt-3">{plan.bottleneckLabel}</p>
                        <p className="text-sm text-muted-foreground mt-1">{plan.chainHint}</p>
                      </>
                    ) : null}
                  </div>

                  <div className="rounded-lg bg-background/80 border border-border/80 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Следующее действие</p>
                    <p className="text-base font-medium text-foreground leading-relaxed">{insight.recommended_action}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" asChild>
                      <Link to="/insights">Почему так</Link>
                    </Button>
                  </div>
                </div>

                {plan ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="rounded-xl border border-border bg-card p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">План на 7 дней</p>
                      <ol className="list-decimal list-inside space-y-2 text-sm text-foreground">
                        {plan.weeklySteps.map((s, i) => (
                          <li key={i} className="leading-relaxed pl-1 marker:text-primary">
                            {s}
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                        Направление на месяц
                      </p>
                      <p className="text-sm text-foreground leading-relaxed">{plan.monthlyDirection}</p>
                      {matchedRule === 5 ? (
                        <p className="text-xs text-muted-foreground mt-3">
                          Период стабилен — фокус на закреплении, а не на тушении пожара.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 bg-muted/15 px-4 py-3 space-y-1.5">
                <p className="text-sm font-medium text-foreground">Анализируем данные периода…</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {accelerator
                    ? 'Нажмите «Обновить» или проверьте загрузку данных — вывод появится после синхронизации периода.'
                    : 'Нажмите «Обновить» после загрузки метрик. Без сохранённого инсайта в облаке включите демо на «Данных» или VITE_CHRONA_DEMO_PREVIEW=true.'}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Цифры периода</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                <ControlTowerKpiCard
                  title="Расходы"
                  value={moneyOrDash(Number(row.spend))}
                  subtitle="на привлечение"
                  status="default"
                />
                <ControlTowerKpiCard title="Лиды" value={String(row.leads)} subtitle="заявки" status="default" />
                <ControlTowerKpiCard title="Сделки" value={String(row.deals)} subtitle="в работе" status="default" />
                <ControlTowerKpiCard
                  title={raw.source === 'instagram_pipeline' ? 'Конверсии' : 'Выручка'}
                  value={revenueDisplay}
                  subtitle={raw.source === 'instagram_pipeline' ? 'по данным канала' : 'за период'}
                  status="default"
                />
                <ControlTowerKpiCard
                  title="Чистый денежный поток"
                  value={moneyOrDash(Number(row.net_cash))}
                  subtitle="приток минус отток"
                  status={Number(row.net_cash) < 0 ? 'danger' : 'success'}
                />
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3 text-sm text-foreground flex flex-wrap gap-x-8 gap-y-2">
                <span>
                  <span className="text-muted-foreground">Приток</span>{' '}
                  <span className="font-semibold tabular-nums">{moneyOrDash(Number(row.cash_inflow))}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">Отток</span>{' '}
                  <span className="font-semibold tabular-nums">{moneyOrDash(Number(row.cash_outflow))}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">Итог по деньгам</span>{' '}
                  <span
                    className={cn(
                      'font-semibold tabular-nums',
                      Number(row.net_cash) < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400',
                    )}
                  >
                    {moneyOrDash(Number(row.net_cash))}
                  </span>
                </span>
              </div>
            </div>

            {sourceSignals.table && (
              <OwnerSourceSignalCards instagram={sourceSignals.instagram} table={sourceSignals.table} />
            )}

            <OwnerBusinessChain row={row} rule={matchedRule} />

            <p className="text-xs text-muted-foreground">
              Сводка строится из подключённых входов на странице «Данные» и облачного снимка периода.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
