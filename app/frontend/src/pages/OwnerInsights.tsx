// Supporting surface: expands dashboard decision (does not compete as primary entry).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatKZT } from '@/lib/metrics';
import type { ProcessedMetricsRow } from '@/lib/supabaseMetrics';
import type { InsightRow } from '@/lib/supabaseInsights';
import { buildExecutionPlan, parseMatchedRule } from '@/lib/insightExecutionPlan';
import { resolveOwnerCloudBundle, type OwnerCloudBundle } from '@/lib/ownerCloudBundle';
import { buildFunnelBreakdown } from '@/lib/chronaSourceCredibility';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const RULE_TITLES: Record<number, string> = {
  1: 'Низкая конверсия лид → сделка (продажи)',
  2: 'Расход есть, лидов мало (верх воронки)',
  3: 'Выручка есть, кэш отрицательный (сроки оплат)',
  4: 'Рост расхода без роста результата',
  5: 'Критических отклонений нет — устойчивый период',
};

const CTX_LABEL_RU: Record<string, string> = {
  leadToDealRatePct: 'Конверсия лид → сделка, %',
  leads: 'Лиды',
  deals: 'Сделки',
  spend: 'Расход',
  revenue: 'Выручка',
  net_cash: 'Чистый кэш',
  cash_inflow: 'Приток',
  prevSpend: 'Расход (прошлый период)',
  deltaPct: 'Изменение расхода, %',
  prevRevenue: 'Выручка (прошлый период)',
};

function formatDataContext(ctx: Record<string, unknown> | null): { label: string; value: string }[] {
  if (!ctx) return [];
  const skip = new Set(['matchedRule']);
  const out: { label: string; value: string }[] = [];
  for (const [k, v] of Object.entries(ctx)) {
    if (skip.has(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) {
      const isMoney = /revenue|spend|cash|net|inflow|outflow|amount/i.test(k);
      out.push({
        label: CTX_LABEL_RU[k] ?? k,
        value: isMoney ? formatKZT(v) : v.toFixed(v % 1 === 0 ? 0 : 1),
      });
    }
  }
  return out.slice(0, 12);
}

export default function OwnerInsightsPage() {
  const [bundle, setBundle] = useState<OwnerCloudBundle | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const b = await resolveOwnerCloudBundle();
      setBundle(b);
    } catch {
      setBundle({ row: null, insight: null, source: 'empty', isStaticDemo: false, fetchError: null });
    } finally {
      setLoading(false);
    }
  }, []);

  const row: ProcessedMetricsRow | null = bundle?.row ?? null;
  const insight: InsightRow | null = bundle?.insight ?? null;

  useEffect(() => {
    void reload();
  }, [reload]);

  const plan = buildExecutionPlan(insight);
  const rule = parseMatchedRule(insight);
  const ctxRows = formatDataContext(insight?.data_context ?? null);
  const raw = (row?.raw_data ?? {}) as Record<string, unknown>;
  const funnel = row ? buildFunnelBreakdown(row, raw, rule) : null;

  return (
    <AppLayout>
      <div className="chrona-page max-w-3xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Объяснение</p>
            <h1 className="rct-page-title mt-1">Почему такой вывод</h1>
            <p className="rct-body-micro text-muted-foreground mt-1">
              Диагностика по цифрам периода — те же входы, что на главном экране.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard">← Главный экран</Link>
            </Button>
          </div>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}

        {!loading && !row && (
          <p className="text-sm text-muted-foreground">
            Нет данных — сначала подключите источники на «Данных» или включите демо-сценарий там же.
          </p>
        )}

        {!loading && row && (
          <>
            {insight ? (
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex flex-wrap gap-2 items-center">
                  {rule != null ? (
                    <Badge variant="secondary">{RULE_TITLES[rule] ?? `Правило ${rule}`}</Badge>
                  ) : null}
                </div>

                {funnel ? (
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Как шли лиды в периоде
                    </p>
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                      {funnel.stages.map((st, idx) => (
                        <div key={st.label} className="flex items-center gap-1 sm:gap-2">
                          {idx > 0 ? (
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
                          ) : null}
                          <div
                            className={cn(
                              'rounded-md border px-3 py-2 min-w-[7rem]',
                              idx === funnel.stages.length - 1
                                ? 'border-primary/30 bg-primary/5'
                                : 'border-border/60 bg-background/80',
                            )}
                          >
                            <p className="text-[10px] text-muted-foreground leading-tight">{st.label}</p>
                            <p className="text-lg font-semibold tabular-nums">{st.count}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-foreground leading-snug border-t border-border/50 pt-2">{funnel.mainDrop}</p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Почему это главное</p>
                  <p className="text-sm font-medium text-foreground">{insight.main_issue}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Выбранное действие</p>
                  <p className="text-sm text-foreground">{insight.recommended_action}</p>
                </div>
                {plan ? (
                  <div className="pt-2 border-t border-border/80 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Контекст цепочки</p>
                    <p className="text-sm text-foreground">{plan.chainHint}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Инсайт ещё не сохранён — после записи метрик в облако он появится при следующем обновлении.
              </p>
            )}

            <div className="rounded-xl border border-border/80 bg-muted/30 p-5 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Показатели, которые сработали в правиле
              </p>
              {ctxRows.length > 0 ? (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {ctxRows.map((r) => (
                    <li key={r.label} className="flex justify-between gap-2 border-b border-border/40 pb-1">
                      <span className="text-muted-foreground text-xs">{r.label}</span>
                      <span className="font-medium tabular-nums">{r.value}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Нет расшифровки показателей в облаке для этого вывода.</p>
              )}
            </div>

          </>
        )}
      </div>
    </AppLayout>
  );
}
