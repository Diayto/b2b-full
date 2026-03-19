// ============================================================
// BizPulse KZ — Contextual Recommendation Engine (Upgraded)
// Each recommendation: WHY it matters + WHAT to do
// Threshold-driven, actionable, context-aware
// ============================================================

import type { RevenueControlTowerAnalytics } from './analytics/revenueControlTower';

export type RecommendationPriority = 'high' | 'medium' | 'low';
export type RecommendationKind = 'risk' | 'action' | 'insight';
export type RecommendationSurface = 'executive' | 'marketing' | 'sales_cash';

export interface RecommendationItem {
  id: string;
  kind: RecommendationKind;
  priority: RecommendationPriority;
  title: string;
  what: string;   // What is wrong / what happened
  why: string;     // Why it matters for the business
  next: string;    // What to do about it
  tags?: string[];
}

const priorityRank: Record<RecommendationPriority, number> = { high: 3, medium: 2, low: 1 };

// --- Thresholds for contextual recommendations ---
const THRESHOLDS = {
  leadToDealConversion: 0.15,   // Below 15% = poor qualification
  dealToWonConversion: 0.30,    // Below 30% = poor closing
  wonToPaidConversion: 0.60,    // Below 60% = payment issues
  overdueRiskPercent: 0.10,     // Overdue > 10% of expected = risk
  stalledDealsCount: 3,         // More than 3 = action needed
  unattributedThreshold: 0.15,  // >15% unattributed = data gap
  growthWarning: -0.05,         // Growth below -5% = alert
};

function stageLabel(stage: RevenueControlTowerAnalytics['insightSignals']['funnelBottleneckStage']): string {
  switch (stage) {
    case 'lead_to_deal':
      return 'между лидом и сделкой';
    case 'deal_to_won':
      return 'между сделкой и выигранной сделкой';
    case 'won_to_paid':
      return 'между выигранной сделкой и оплатой';
    default:
      return 'в воронке';
  }
}

function stageNext(stage: RevenueControlTowerAnalytics['insightSignals']['funnelBottleneckStage']): string {
  switch (stage) {
    case 'lead_to_deal':
      return 'Проверьте качество лидов и скорость реакции: из каких источников лиды доходят до сделки, а из каких "замирают".';
    case 'deal_to_won':
      return 'Разберите причины проигрышей и закрепите следующий шаг после квалификации по каждой сделке.';
    case 'won_to_paid':
      return 'Сфокусируйтесь на оплате: что чаще всего "задерживает" счет и что нужно, чтобы он оплачивался вовремя.';
    default:
      return 'Выберите один узкий шаг воронки и поставьте цель по конверсии на неделю.';
  }
}

function actionTypeLabel(type: string): string {
  switch (type) {
    case 'collect_overdue_invoice':
      return 'Собрать просроченные оплаты';
    case 'follow_up_unpaid_invoice':
      return 'Дожать неоплаченные счета';
    case 'reengage_stalled_deal':
      return 'Разморозить застрявшие сделки';
    case 'prioritize_delayed_customer':
      return 'Приоритизировать клиентов с задержкой';
    default:
      return type;
  }
}

function actionNext(type: string): string {
  switch (type) {
    case 'collect_overdue_invoice':
      return 'Сегодня: список топ-5 просрочек → контакт ответственного → конкретная дата и сумма оплаты.';
    case 'follow_up_unpaid_invoice':
      return 'Проверьте "почему не оплачено": счет дошел? реквизиты? согласование? Затем — один понятный следующий шаг.';
    case 'reengage_stalled_deal':
      return 'Назначьте следующий шаг по каждой сделке: звонок/демо/КП/согласование. Без следующего шага сделка "умирает".';
    case 'prioritize_delayed_customer':
      return 'Соберите клиентов с повторяющейся задержкой → обновите условия/лимиты → выделите ответственного.';
    default:
      return 'Сформулируйте конкретный следующий шаг и ответственного.';
  }
}

export interface BuildRecommendationsParams {
  analytics: RevenueControlTowerAnalytics;
  channelNameById?: Map<string, string>;
  maxItems?: number;
  surface: RecommendationSurface;
  formatMoney?: (value: number) => string;
}

export function buildRecommendations(params: BuildRecommendationsParams): RecommendationItem[] {
  const { analytics, channelNameById, maxItems = 6, surface, formatMoney } = params;

  const money = (v: number) => {
    if (formatMoney) return formatMoney(v);
    if (!Number.isFinite(v)) return '—';
    return v.toFixed(0);
  };

  const items: RecommendationItem[] = [];

  const stalledCount = analytics.salesCashPriority.stalledDeals.length;
  const overdueValue = analytics.overdueAmount.value;
  const unattributed = analytics.paidRevenueBySource.unattributedPaidRevenue;
  const totalRevenue = analytics.revenue.value;
  const expectedInflow = analytics.expectedInflow.value;
  const growthRate = analytics.growthRate.value;
  const leadToDeal = analytics.leadToDealConversion.value;
  const dealToPaid = analytics.dealToPaidConversion.value;

  // ──────────────────────────────────────────────
  // 1. Conversion-based recommendations (threshold-driven)
  // ──────────────────────────────────────────────

  // Low lead-to-deal conversion
  if (leadToDeal < THRESHOLDS.leadToDealConversion && leadToDeal > 0) {
    items.push({
      id: 'low_lead_to_deal',
      kind: 'risk',
      priority: 'high',
      title: 'Низкая конверсия лидов в сделки',
      what: `Конверсия лид→сделка всего ${(leadToDeal * 100).toFixed(1)}% (порог: ${(THRESHOLDS.leadToDealConversion * 100).toFixed(0)}%).`,
      why: 'Большинство лидов не доходят до сделки — это значит, что либо качество лидов низкое, либо квалификация слишком медленная. Деньги на маркетинг тратятся впустую.',
      next: 'Улучшите квалификацию: проверьте скорость первого контакта, скорректируйте ICP (портрет клиента) и проверьте, какие источники дают "мёртвых" лидов.',
      tags: ['воронка', 'квалификация'],
    });
  }

  // Low deal-to-paid conversion
  if (dealToPaid < THRESHOLDS.dealToWonConversion && dealToPaid > 0) {
    items.push({
      id: 'low_deal_to_paid',
      kind: 'risk',
      priority: 'high',
      title: 'Сделки не доходят до оплаты',
      what: `Конверсия сделка→оплата ${(dealToPaid * 100).toFixed(1)}% (порог: ${(THRESHOLDS.dealToWonConversion * 100).toFixed(0)}%).`,
      why: 'Сделки закрываются, но оплаты не поступают — проблема может быть в ценообразовании, процессе подписания или follow-up после выигрыша.',
      next: 'Разберите последние 10 проигранных сделок: на каком этапе уходят, какие причины отказа. Внедрите обязательный "следующий шаг" для каждой активной сделки.',
      tags: ['sales', 'конверсия'],
    });
  }

  // ──────────────────────────────────────────────
  // 2. Cash / overdue risk (threshold-driven)
  // ──────────────────────────────────────────────

  if (overdueValue > 0) {
    const overdueRatio = expectedInflow > 0 ? overdueValue / expectedInflow : 1;
    const isCritical = overdueRatio > THRESHOLDS.overdueRiskPercent;
    const top = analytics.insightSignals.topOverdueInvoices[0];
    const topLabel = top?.invoiceExternalId ?? top?.customerExternalId ?? 'счет';

    items.push({
      id: 'overdue_cash',
      kind: 'risk',
      priority: isCritical ? 'high' : 'medium',
      title: isCritical ? 'Критический уровень просрочки' : 'Просрочка угрожает притоку',
      what: `Просрочено: ${money(overdueValue)} (${(overdueRatio * 100).toFixed(0)}% от ожидаемого притока). Топ: ${topLabel}.`,
      why: isCritical
        ? 'Уровень просрочки критический — каждый день без действий увеличивает риск кассового разрыва. Это прямая угроза операционной устойчивости.'
        : 'Просрочка — это деньги, которые "должны были прийти". Рост просрочки повышает риск кассового разрыва.',
      next: isCritical
        ? 'Экстренно: составьте список топ-5 просрочек, назначьте ответственного на каждую, установите дедлайн на контакт СЕГОДНЯ. Эскалируйте через 48 часов.'
        : 'Сделайте план взыскания: кто звонит/пишет, когда следующий контакт, какой ожидаемый срок оплаты.',
      tags: ['cash', 'просрочка'],
    });
  }

  // ──────────────────────────────────────────────
  // 3. Stalled deals (threshold-driven)
  // ──────────────────────────────────────────────

  if (stalledCount > THRESHOLDS.stalledDealsCount) {
    items.push({
      id: 'stalled_deals',
      kind: 'risk',
      priority: 'high',
      title: `${stalledCount} сделок без движения`,
      what: `Застрявших сделок: ${stalledCount} (порог: ${THRESHOLDS.stalledDealsCount}).`,
      why: 'Сделки без следующего шага "умирают" — клиент теряет интерес, конкурент перехватывает. Каждая замершая сделка — потенциально потерянная выручка.',
      next: 'Сегодня: назначьте конкретный следующий шаг и дату по каждой застрявшей сделке (звонок/демо/КП/согласование). Без действия → перевод в "lost".',
      tags: ['sales'],
    });
  } else if (stalledCount > 0) {
    items.push({
      id: 'stalled_deals',
      kind: 'insight',
      priority: 'medium',
      title: 'Сделки теряют темп',
      what: `Застрявших сделок: ${stalledCount}.`,
      why: 'Когда сделкам не назначают следующий шаг, деньги "зависают" даже при хорошем притоке лидов.',
      next: 'Назначьте следующий шаг по топ-сделкам — это самый быстрый способ "разморозить" воронку.',
      tags: ['sales'],
    });
  }

  // ──────────────────────────────────────────────
  // 4. Revenue growth warning
  // ──────────────────────────────────────────────

  if (growthRate !== null && growthRate < THRESHOLDS.growthWarning) {
    items.push({
      id: 'revenue_decline',
      kind: 'risk',
      priority: 'high',
      title: 'Выручка падает',
      what: `Рост выручки: ${(growthRate * 100).toFixed(1)}% к прошлому периоду.`,
      why: 'Отрицательная динамика выручки — сигнал системной проблемы: падение спроса, ухудшение конверсии или потеря ключевых клиентов.',
      next: 'Разберите причину: сократился поток лидов? Упала конверсия? Ушли крупные клиенты? Начните с самого крупного фактора и поставьте цель на неделю.',
      tags: ['revenue', 'тренд'],
    });
  }

  // ──────────────────────────────────────────────
  // 5. Funnel bottleneck insight
  // ──────────────────────────────────────────────

  items.push({
    id: 'bottleneck',
    kind: 'insight',
    priority: surface === 'marketing' ? 'medium' : (items.length === 0 ? 'high' : 'medium'),
    title: surface === 'sales_cash' ? 'Где "буксует" движение к деньгам' : 'Главное узкое место',
    what: `Больше всего теряется ${stageLabel(analytics.insightSignals.funnelBottleneckStage)}.`,
    why:
      surface === 'marketing'
        ? 'Это объясняет, почему лиды не превращаются в деньги даже при росте трафика.'
        : 'Это место сильнее всего влияет на деньги: улучшение здесь дает самый быстрый эффект.',
    next:
      surface === 'marketing'
        ? `Сфокусируйтесь на шаге "${stageLabel(analytics.insightSignals.funnelBottleneckStage)}": проверьте качество лидов и передачу в продажи.`
        : stageNext(analytics.insightSignals.funnelBottleneckStage),
    tags: ['воронка'],
  });

  // ──────────────────────────────────────────────
  // 6. Worst channel
  // ──────────────────────────────────────────────

  const worst = analytics.insightSignals.worstChannels[0];
  if (worst) {
    const name = channelNameById?.get(worst.channelCampaignExternalId) ?? worst.channelCampaignExternalId;
    items.push({
      id: `worst_channel_${worst.channelCampaignExternalId}`,
      kind: 'risk',
      priority: surface === 'marketing' ? 'high' : 'medium',
      title: 'Канал с низкой отдачей',
      what: `Источник "${name}" проседает: ${worst.reason}.`,
      why: 'Слабый источник "съедает" бюджет и загрузку команды, но не приносит денег. Каждый день — потерянные ресурсы.',
      next: 'Снизьте/остановите бюджет на 1–2 недели и проверьте, что именно в этом источнике не работает (оффер, аудитория, качество лидов).',
      tags: ['маркетинг', 'качество'],
    });
  }

  // ──────────────────────────────────────────────
  // 7. Attribution quality gap
  // ──────────────────────────────────────────────

  if (unattributed > 0 && totalRevenue > 0) {
    const unattributedRatio = unattributed / totalRevenue;
    if (unattributedRatio > THRESHOLDS.unattributedThreshold) {
      items.push({
        id: 'attribution_gap',
        kind: 'insight',
        priority: surface === 'marketing' ? 'high' : 'medium',
        title: `${(unattributedRatio * 100).toFixed(0)}% выручки без источника`,
        what: `Оплаты без привязки к маркетинг-источнику: ${money(unattributed)} (${(unattributedRatio * 100).toFixed(0)}% от общей выручки).`,
        why: 'Если деньги не привязаны к источнику, решения по бюджету становятся "на глаз". Вы не знаете, какие каналы реально зарабатывают.',
        next: 'Проверьте цепочку: источник → лид → сделка → счет → оплата. Если в цепочке нет звена — деньги "пропадают" из атрибуции. Начните с самых крупных неразмеченных оплат.',
        tags: ['данные', 'атрибуция'],
      });
    }
  }

  // ──────────────────────────────────────────────
  // 8. Priority actions from analytics
  // ──────────────────────────────────────────────

  const actions = [...analytics.salesCashPriority.priorityActionCandidates].sort((a, b) => {
    const pr = (x: typeof a) => priorityRank[x.priority] ?? 0;
    return pr(b) - pr(a);
  });

  for (const a of actions.slice(0, 3)) {
    items.push({
      id: `action_${a.id}`,
      kind: 'action',
      priority: a.priority,
      title: actionTypeLabel(a.type),
      what: a.facts[0] ? a.facts[0] : 'Есть кандидат на действие по данным.',
      why: 'Это действие имеет быстрый эффект на деньги/сроки и снижает операционный риск.',
      next: actionNext(a.type),
      tags: [a.area],
    });
  }

  // Sort by priority and return
  return items
    .sort((a, b) => (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0))
    .slice(0, maxItems);
}
