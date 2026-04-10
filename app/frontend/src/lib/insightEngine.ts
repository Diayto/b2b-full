// Task 3 — single insight from one processed_metrics row (+ optional previous row)
import type { ProcessedMetricsRow } from '@/lib/supabaseMetrics';
import { formatKZT } from '@/lib/metrics';

export type InsightRuleId = 1 | 2 | 3 | 4 | 5;

export type InsightEvaluation = {
  matchedRule: InsightRuleId;
  main_issue: string;
  recommended_action: string;
  priority_score: number;
  data_context: Record<string, number>;
};

const FORBIDDEN = /\b(consider|optimize|improve|leverage|enhance)\b/i;

function assertNoForbidden(s: string, label: string): void {
  if (FORBIDDEN.test(s)) {
    throw new Error(`${label} contains forbidden wording`);
  }
}

function assertHasDigit(s: string, label: string): void {
  if (!/\d/.test(s)) {
    throw new Error(`${label} must contain a number`);
  }
}

function clampWords(s: string, maxWords: number): string {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= maxWords) return parts.join(' ');
  return parts.slice(0, maxWords).join(' ');
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isInstagramPipeline(row: ProcessedMetricsRow): boolean {
  const raw = row.raw_data as Record<string, unknown> | null;
  return raw?.source === 'instagram_pipeline';
}

/**
 * Rule 3 uses "revenue" only when it represents money (upload path).
 * For Instagram, `revenue` holds paid_conversions count — skip rule 3 to avoid a false "revenue positive" story.
 */
export function shouldApplyRevenueCashRule(row: ProcessedMetricsRow): boolean {
  return !isInstagramPipeline(row) && num(row.revenue) > 0;
}

export function evaluateProcessedMetricsInsight(
  current: ProcessedMetricsRow,
  previous: ProcessedMetricsRow | null,
): InsightEvaluation {
  const spend = num(current.spend);
  const leads = Math.round(num(current.leads));
  const deals = Math.round(num(current.deals));
  const revenue = num(current.revenue);
  const netCash = num(current.net_cash);

  const leadToDealRate = leads > 0 ? deals / leads : 0;
  const ratePct = leadToDealRate * 100;

  // Rule 1
  if (leadToDealRate < 0.15 && leads >= 10) {
    const main_issue = clampWords(
      `Конверсия лид → сделка ${ratePct.toFixed(1)}% — узкое место в продажах, не в маркетинге`,
      18,
    );
    const recommended_action = clampWords(
      'За 7 дней разобрать записи звонков с лидами. Рекламный бюджет пока не увеличивать.',
      22,
    );
    const data_context = { leadToDealRatePct: ratePct, leads, deals, spend };
    assertNoForbidden(main_issue + recommended_action, 'insight');
    assertHasDigit(main_issue, 'main_issue');
    assertHasDigit(recommended_action, 'recommended_action');
    return {
      matchedRule: 1,
      main_issue,
      recommended_action,
      priority_score: 92,
      data_context,
    };
  }

  // Rule 2
  if (spend > 0 && leads <= 5) {
    const spendLabel = formatKZT(spend);
    const main_issue = clampWords(
      `Потрачено ${spendLabel}, лидов всего ${leads} — канал не отрабатывает`,
      18,
    );
    const recommended_action = clampWords(
      'На 14 дней снизить или остановить расход на этом канале. Найти, где отваливаются заявки, до новых вливаний.',
      24,
    );
    const data_context = { spend, leads, deals, revenue };
    assertNoForbidden(main_issue + recommended_action, 'insight');
    assertHasDigit(main_issue, 'main_issue');
    assertHasDigit(recommended_action, 'recommended_action');
    return {
      matchedRule: 2,
      main_issue,
      recommended_action,
      priority_score: 88,
      data_context,
    };
  }

  // Rule 3 (skip Instagram conversion-only revenue)
  if (shouldApplyRevenueCashRule(current) && netCash < 0) {
    const cashLabel = formatKZT(netCash);
    const revLabel = formatKZT(revenue);
    const main_issue = clampWords(
      `Выручка ${revLabel}, кэш ${cashLabel} — сбой по срокам оплат`,
      18,
    );
    const recommended_action = clampWords(
      'До следующего круга расходов закрыть 100% просроченных счетов.',
      20,
    );
    const data_context = { revenue, net_cash: netCash, cash_inflow: num(current.cash_inflow) };
    assertNoForbidden(main_issue + recommended_action, 'insight');
    assertHasDigit(main_issue, 'main_issue');
    assertHasDigit(recommended_action, 'recommended_action');
    return {
      matchedRule: 3,
      main_issue,
      recommended_action,
      priority_score: 90,
      data_context,
    };
  }

  // Rule 4
  if (previous) {
    const prevSpend = num(previous.spend);
    const prevRev = num(previous.revenue);
    if (prevSpend > 0) {
      const delta = (spend - prevSpend) / prevSpend;
      const spendUp = delta > 0.2;
      const revenueFlatOrDown = revenue <= prevRev;
      if (spendUp && revenueFlatOrDown) {
        const deltaPct = delta * 100;
        const resultWord = isInstagramPipeline(current) ? 'конверсии не выросли' : 'выручка не выросла';
        const main_issue = clampWords(
          `Расход вырос на ${deltaPct.toFixed(0)}%, а ${resultWord} — бюджет сгорает`,
          18,
        );
        const recommended_action = clampWords(
          '30 дней не открывать новые кампании. Сначала найти шаг воронки с максимальным отвалом.',
          22,
        );
        const data_context = {
          spend,
          prevSpend,
          deltaPct,
          revenue,
          prevRevenue: prevRev,
        };
        assertNoForbidden(main_issue + recommended_action, 'insight');
        assertHasDigit(main_issue, 'main_issue');
        assertHasDigit(recommended_action, 'recommended_action');
        return {
          matchedRule: 4,
          main_issue,
          recommended_action,
          priority_score: 86,
          data_context,
        };
      }
    }
  }

  // Rule 5
  const main_issue = clampWords(
    '0 критических отклонений за период — метрики в стабильном коридоре',
    18,
  );
  const recommended_action = clampWords(
    'Усилить один канал с лучшими цифрами. Пересмотреть итоги за 90 дней.',
      20,
  );
  const data_context = { spend, leads, deals, revenue, net_cash: netCash };
  assertNoForbidden(main_issue + recommended_action, 'insight');
  assertHasDigit(main_issue, 'main_issue');
  assertHasDigit(recommended_action, 'recommended_action');
  return {
    matchedRule: 5,
    main_issue,
    recommended_action,
    priority_score: 35,
    data_context,
  };
}
