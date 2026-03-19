// ============================================================
// BizPulse — Explainability Layer
//
// Every metric or insight carries: what → why → action.
// This is not just for recommendations — it applies to
// dashboard cards, marketing blocks, lost deals, overdue insights.
// ============================================================

import type { MetricExplanation } from './domain';
import type { CompletenessScore } from './domain';
import type { FunnelStageMetrics } from './funnel';
import type { LeakageSummary } from './domain';

// --- Configurable thresholds ---
export const EXPLAIN_THRESHOLDS = {
  conversionCritical: 0.05,
  conversionWarning: 0.15,
  overdueRatioCritical: 0.25,
  overdueRatioWarning: 0.10,
  growthDeclineCritical: -0.15,
  growthDeclineWarning: -0.05,
  stalledDealsCritical: 5,
  stalledDealsWarning: 2,
  completenessLow: 50,
  completenessPartial: 80,
  roiNegative: 0,
  roiLow: 50,
  dropOffCritical: 0.5,
  dropOffWarning: 0.3,
} as const;

// --- Revenue explanation ---
export function explainRevenue(
  revenue: number,
  growthRate: number | null,
  previousRevenue: number,
): MetricExplanation {
  if (growthRate === null || previousRevenue === 0) {
    return {
      what: `Выручка: ${formatMoney(revenue)}`,
      why: 'Недостаточно данных для сравнения с предыдущим периодом',
      action: 'Загрузите данные за предыдущий период для трендового анализа',
      severity: 'info',
      confidence: 'incomplete',
    };
  }

  if (growthRate < EXPLAIN_THRESHOLDS.growthDeclineCritical) {
    return {
      what: `Выручка упала на ${Math.abs(Math.round(growthRate * 100))}%`,
      why: `Значительное снижение с ${formatMoney(previousRevenue)} до ${formatMoney(revenue)} — угроза устойчивости бизнеса`,
      action: 'Срочно: проанализируйте причины — потеря клиентов, сезонность или проблемы с продуктом',
      severity: 'critical',
      confidence: 'exact',
    };
  }

  if (growthRate < EXPLAIN_THRESHOLDS.growthDeclineWarning) {
    return {
      what: `Выручка снизилась на ${Math.abs(Math.round(growthRate * 100))}%`,
      why: 'Небольшое снижение может быть началом нисходящего тренда',
      action: 'Проверьте воронку — достаточно ли лидов и сделок для восстановления',
      severity: 'warning',
      confidence: 'exact',
    };
  }

  return {
    what: `Выручка: ${formatMoney(revenue)} (${growthRate > 0 ? '+' : ''}${Math.round(growthRate * 100)}%)`,
    why: 'Положительная динамика выручки',
    action: 'Продолжайте масштабировать работающие каналы',
    severity: 'success',
    confidence: 'exact',
  };
}

// --- Conversion rate explanation ---
export function explainConversionRate(
  label: string,
  rate: number,
  fromStage: string,
  toStage: string,
): MetricExplanation {
  const pct = Math.round(rate * 100);

  if (rate < EXPLAIN_THRESHOLDS.conversionCritical) {
    return {
      what: `${label}: ${pct}%`,
      why: `Критически низкая конверсия ${fromStage} → ${toStage}. Большинство возможностей теряются на этом этапе`,
      action: `Ревизия этапа: проверьте качество ${fromStage}, квалификацию и процесс перехода в ${toStage}`,
      severity: 'critical',
      confidence: 'exact',
    };
  }

  if (rate < EXPLAIN_THRESHOLDS.conversionWarning) {
    return {
      what: `${label}: ${pct}%`,
      why: `Конверсия ${fromStage} → ${toStage} ниже нормы. Потенциальная точка оптимизации`,
      action: `Проанализируйте причины потерь на переходе ${fromStage} → ${toStage}`,
      severity: 'warning',
      confidence: 'exact',
    };
  }

  return {
    what: `${label}: ${pct}%`,
    why: `Здоровая конверсия ${fromStage} → ${toStage}`,
    action: 'Поддерживайте текущий процесс',
    severity: 'success',
    confidence: 'exact',
  };
}

// --- Overdue explanation ---
export function explainOverdue(
  overdueAmount: number,
  totalExpected: number,
): MetricExplanation {
  const ratio = totalExpected > 0 ? overdueAmount / totalExpected : 0;
  const pct = Math.round(ratio * 100);

  if (ratio > EXPLAIN_THRESHOLDS.overdueRatioCritical) {
    return {
      what: `Просрочка: ${formatMoney(overdueAmount)} (${pct}% от ожидаемых поступлений)`,
      why: 'Критический уровень просрочки — реальная угроза кассовому потоку и операционной устойчивости',
      action: 'Немедленно: связаться с топ-должниками, проверить условия оплаты, рассмотреть штрафные санкции',
      severity: 'critical',
      confidence: 'exact',
    };
  }

  if (ratio > EXPLAIN_THRESHOLDS.overdueRatioWarning) {
    return {
      what: `Просрочка: ${formatMoney(overdueAmount)} (${pct}% от ожидаемых)`,
      why: 'Уровень просрочки выше нормы — может привести к кассовым разрывам',
      action: 'Отправить напоминания, проверить графики оплат с ключевыми клиентами',
      severity: 'warning',
      confidence: 'exact',
    };
  }

  if (overdueAmount > 0) {
    return {
      what: `Просрочка: ${formatMoney(overdueAmount)} (${pct}%)`,
      why: 'Незначительный объём просрочки, в пределах нормы',
      action: 'Мониторинг — следите за трендом',
      severity: 'info',
      confidence: 'exact',
    };
  }

  return {
    what: 'Просрочка: 0',
    why: 'Все оплаты поступают вовремя',
    action: 'Отличный результат, продолжайте контролировать',
    severity: 'success',
    confidence: 'exact',
  };
}

// --- Funnel stage drop-off explanation ---
export function explainFunnelDropOff(stage: FunnelStageMetrics): MetricExplanation | null {
  if (stage.dropOffRate === null) return null;

  const pct = Math.round(stage.dropOffRate * 100);

  if (stage.dropOffRate > EXPLAIN_THRESHOLDS.dropOffCritical) {
    return {
      what: `Потеря на этапе "${stage.stage}": ${pct}% (${stage.dropOffFromPrev} ед.)`,
      why: 'Критическая точка потерь в воронке — больше половины не переходят на следующий этап',
      action: 'Приоритетная оптимизация: пересмотрите процесс, квалификацию, скрипты, обратную связь',
      severity: 'critical',
      confidence: 'exact',
    };
  }

  if (stage.dropOffRate > EXPLAIN_THRESHOLDS.dropOffWarning) {
    return {
      what: `Потеря на этапе "${stage.stage}": ${pct}%`,
      why: 'Заметная потеря — возможна оптимизация',
      action: 'Проанализируйте причины потерь на этом этапе',
      severity: 'warning',
      confidence: 'exact',
    };
  }

  return null;
}

// --- Leakage explanation ---
export function explainLeakage(summary: LeakageSummary): MetricExplanation {
  if (summary.totalItems === 0) {
    return {
      what: 'Утечки в воронке не обнаружены',
      why: 'Все этапы воронки работают стабильно',
      action: 'Продолжайте мониторинг',
      severity: 'success',
      confidence: 'exact',
    };
  }

  const topCategory = summary.byCategory[0];

  return {
    what: `${summary.totalItems} точек утечки, ~${formatMoney(summary.totalEstimatedLoss)} потерь`,
    why: `Главная проблема: "${topCategory.label}" — ${topCategory.count} случаев (${Math.round(topCategory.percentage)}%)`,
    action: `Начните с устранения "${topCategory.label}" — это даст максимальный эффект`,
    severity: summary.totalEstimatedLoss > 0 ? 'warning' : 'info',
    confidence: 'estimated',
  };
}

// --- Completeness explanation ---
export function explainCompleteness(score: CompletenessScore): MetricExplanation {
  if (score.score < EXPLAIN_THRESHOLDS.completenessLow) {
    return {
      what: `${score.label}: ${score.score}% данных`,
      why: `Недостаточно данных для точной аналитики. Отсутствуют: ${score.missingCritical.join(', ')}`,
      action: 'Загрузите недостающие данные или проверьте связки между сущностями',
      severity: 'warning',
      confidence: 'incomplete',
      dataCompleteness: score.score,
    };
  }

  if (score.score < EXPLAIN_THRESHOLDS.completenessPartial) {
    return {
      what: `${score.label}: ${score.score}% данных`,
      why: 'Данные частичные — некоторые расчёты приблизительные',
      action: score.notes.length > 0 ? score.notes[0] : 'Дополните данные для повышения точности',
      severity: 'info',
      confidence: 'estimated',
      dataCompleteness: score.score,
    };
  }

  return {
    what: `${score.label}: ${score.score}% данных`,
    why: 'Данные достаточно полные для точной аналитики',
    action: 'Данные в хорошем состоянии',
    severity: 'success',
    confidence: 'exact',
    dataCompleteness: score.score,
  };
}

// --- ROI explanation ---
export function explainROI(roi: number | null, channelName: string): MetricExplanation {
  if (roi === null) {
    return {
      what: `ROI ${channelName}: нет данных`,
      why: 'Нет данных о расходах для расчёта ROI',
      action: 'Загрузите данные маркетинговых расходов для этого канала',
      severity: 'info',
      confidence: 'incomplete',
    };
  }

  if (roi < EXPLAIN_THRESHOLDS.roiNegative) {
    return {
      what: `ROI ${channelName}: ${Math.round(roi)}% (убыточный)`,
      why: 'Канал генерирует убытки — расходы превышают доход',
      action: 'Снизьте бюджет или остановите канал. Проверьте таргетинг и конверсию',
      severity: 'critical',
      confidence: 'exact',
    };
  }

  if (roi < EXPLAIN_THRESHOLDS.roiLow) {
    return {
      what: `ROI ${channelName}: ${Math.round(roi)}%`,
      why: 'Низкая окупаемость — канал работает на грани рентабельности',
      action: 'Оптимизируйте: снизьте CPL или улучшите конверсию в сделку',
      severity: 'warning',
      confidence: 'exact',
    };
  }

  return {
    what: `ROI ${channelName}: ${Math.round(roi)}%`,
    why: 'Здоровая окупаемость канала',
    action: 'Рассмотрите масштабирование бюджета',
    severity: 'success',
    confidence: 'exact',
  };
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}
