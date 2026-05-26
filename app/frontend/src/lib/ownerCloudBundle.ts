import {
  allowChronaDemoFallback,
  getActiveDemoMetricsRow,
  getOwnerDemoSessionRow,
} from '@/lib/chronaDemoPreview';
import { evaluateProcessedMetricsInsight, type InsightEvaluation } from '@/lib/insightEngine';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { fetchLatestProcessedMetrics, type ProcessedMetricsRow } from '@/lib/supabaseMetrics';
import { fetchLatestInsight, fetchLastTwoProcessedMetrics, type InsightRow } from '@/lib/supabaseInsights';

export type OwnerCloudBundleSource = 'real' | 'demo' | 'synthetic' | 'partial' | 'empty';

export type OwnerCloudBundle = {
  row: ProcessedMetricsRow | null;
  insight: InsightRow | null;
  source: OwnerCloudBundleSource;
  /** Static packaged demo (no live Supabase row). Show subtle Preview label. */
  isStaticDemo: boolean;
  /** Set when Supabase fetch failed but demo preview was used as fallback. */
  fetchError: string | null;
};

export function evaluationToInsightRow(evaluation: InsightEvaluation, row: ProcessedMetricsRow): InsightRow {
  return {
    id: 'chrona-local-evaluation',
    company_id: row.company_id,
    generated_at: new Date().toISOString(),
    period_start: row.period_start,
    period_end: row.period_end,
    main_issue: evaluation.main_issue,
    recommended_action: evaluation.recommended_action,
    priority_score: evaluation.priority_score,
    data_context: {
      ...evaluation.data_context,
      matchedRule: evaluation.matchedRule,
    },
  };
}

export function buildInsightForMetricsRow(
  row: ProcessedMetricsRow,
  previous: ProcessedMetricsRow | null,
): InsightRow {
  const evaluation = evaluateProcessedMetricsInsight(row, previous);
  return evaluationToInsightRow(evaluation, row);
}

function resolveDemoBundle(fetchError: string | null = null): OwnerCloudBundle {
  const row = getOwnerDemoSessionRow() ?? getActiveDemoMetricsRow();
  return {
    row,
    insight: buildInsightForMetricsRow(row, null),
    source: 'demo',
    isStaticDemo: true,
    fetchError,
  };
}

/**
 * Single decision path for Owner dashboard + Insights page: real → synthetic (eval) → static demo → empty.
 */
export async function resolveOwnerCloudBundle(): Promise<OwnerCloudBundle> {
  const demoOn = allowChronaDemoFallback();

  if (!isSupabaseConfigured()) {
    if (demoOn) return resolveDemoBundle(null);
    return { row: null, insight: null, source: 'empty', isStaticDemo: false, fetchError: null };
  }

  try {
    const [latest, insightRow] = await Promise.all([
      fetchLatestProcessedMetrics(),
      fetchLatestInsight().catch(() => null),
    ]);

    if (latest && insightRow) {
      return {
        row: latest,
        insight: insightRow,
        source: 'real',
        isStaticDemo: false,
        fetchError: null,
      };
    }

    if (latest && !insightRow) {
      if (demoOn) {
        let prev: ProcessedMetricsRow | null = null;
        try {
          const [, previous] = await fetchLastTwoProcessedMetrics();
          prev = previous && previous.id !== latest.id ? previous : null;
        } catch {
          prev = null;
        }
        return {
          row: latest,
          insight: buildInsightForMetricsRow(latest, prev),
          source: 'synthetic',
          isStaticDemo: false,
          fetchError: null,
        };
      }
      return {
        row: latest,
        insight: null,
        source: 'partial',
        isStaticDemo: false,
        fetchError: null,
      };
    }

    if (!latest && demoOn) {
      return resolveDemoBundle(null);
    }

    return { row: null, insight: null, source: 'empty', isStaticDemo: false, fetchError: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ошибка загрузки';
    if (demoOn) return resolveDemoBundle(msg);
    return { row: null, insight: null, source: 'empty', isStaticDemo: false, fetchError: msg };
  }
}
