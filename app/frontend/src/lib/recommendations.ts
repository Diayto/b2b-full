import type { RevenueControlTowerAnalytics } from './analytics/revenueControlTower';

export type RecommendationPriority = 'high' | 'medium' | 'low';
export type RecommendationKind = 'risk' | 'action' | 'insight';
export type RecommendationSurface = 'executive' | 'marketing' | 'sales_cash';

export interface RecommendationItem {
  id: string;
  kind: RecommendationKind;
  priority: RecommendationPriority;
  title: string;
  what: string;
  why: string;
  next: string;
  tags?: string[];
}

const priorityRank: Record<RecommendationPriority, number> = { high: 3, medium: 2, low: 1 };

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
      return 'Проверьте качество лидов и скорость реакции: из каких источников лиды доходят до сделки, а из каких “замирают”.';
    case 'deal_to_won':
      return 'Разберите причины проигрышей и закрепите следующий шаг после квалификации по каждой сделке.';
    case 'won_to_paid':
      return 'Сфокусируйтесь на оплате: что чаще всего “задерживает” счет и что нужно, чтобы он оплачивался вовремя.';
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
      return 'Проверьте “почему не оплачено”: счет дошел? реквизиты? закрывающие? согласование? Затем — один понятный следующий шаг.';
    case 'reengage_stalled_deal':
      return 'Назначьте следующий шаг по каждой сделке: звонок/демо/коммерческое/согласование. Без следующего шага сделка “умирает”.';
    case 'prioritize_delayed_customer':
      return 'Соберите клиентов с повторяющейся задержкой → обновите условия/лимиты → выделите ответственного на контроль оплат.';
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

  // 1) Bottleneck insight (always present)
  items.push({
    id: 'bottleneck',
    kind: 'insight',
    priority: surface === 'marketing' ? 'medium' : 'high',
    title: surface === 'sales_cash' ? 'Где “буксует” движение к деньгам' : 'Главное узкое место',
    what: `Сейчас больше всего “теряется” ${stageLabel(analytics.insightSignals.funnelBottleneckStage)}.`,
    why:
      surface === 'marketing'
        ? 'Это объясняет, почему лиды не превращаются в деньги даже при росте трафика.'
        : 'Это место сильнее всего влияет на деньги: улучшение здесь дает самый быстрый эффект.',
    next:
      surface === 'marketing'
        ? `Сфокусируйтесь на ${stageLabel(analytics.insightSignals.funnelBottleneckStage)}: проверьте качество лидов и передачу в продажи.`
        : stageNext(analytics.insightSignals.funnelBottleneckStage),
    tags: ['воронка'],
  });

  // 2) Worst channel (if present)
  const worst = analytics.insightSignals.worstChannels[0];
  if (worst) {
    const name = channelNameById?.get(worst.channelCampaignExternalId) ?? worst.channelCampaignExternalId;
    items.push({
      id: `worst_channel_${worst.channelCampaignExternalId}`,
      kind: 'risk',
      priority: surface === 'marketing' ? 'high' : 'medium',
      title: surface === 'marketing' ? 'Канал с низкой отдачей' : 'Источник с просадкой',
      what: `Источник “${name}” проседает: ${worst.reason}.`,
      why:
        surface === 'sales_cash'
          ? 'Слабый источник увеличивает нагрузку на продажи и удлиняет цикл, а деньги не приходят.'
          : 'Слабый источник “съедает” бюджет и загрузку команды, но не приносит денег.',
      next:
        surface === 'marketing'
          ? 'Снизьте/остановите бюджет на 1–2 недели и проверьте, что именно в этом источнике не “дожимает” до денег.'
          : 'Пауза/перераспределение бюджета на 1–2 недели + проверка качества лидов и оффера по этому источнику.',
      tags: ['маркетинг', 'качество'],
    });
  }

  // 3) Overdue cash risk (if any)
  if (overdueValue > 0) {
    const top = analytics.insightSignals.topOverdueInvoices[0];
    const topLabel = top?.invoiceExternalId ?? top?.customerExternalId ?? 'счет';
    items.push({
      id: 'overdue_cash',
      kind: 'risk',
      priority: 'high',
      title: 'Просрочка угрожает притоку',
      what: `Просрочено: ${money(overdueValue)} (см. ${topLabel}).`,
      why: 'Просрочка — это деньги, которые “должны были прийти”, и она повышает риск кассового разрыва.',
      next:
        surface === 'marketing'
          ? 'Не расширяйте бюджет, пока просрочка растёт: сначала стабилизируйте приток (контроль сроков оплаты и взыскание).'
          : 'Сделайте короткий план взыскания: кто звонит/пишет, когда следующий контакт, какой ожидаемый срок оплаты.',
      tags: ['cash', 'просрочка'],
    });
  }

  // 4) Attribution quality (only when it blocks decision-making)
  if (unattributed > 0) {
    items.push({
      id: 'attribution_gap',
      kind: 'insight',
      priority: surface === 'marketing' ? 'high' : 'medium',
      title: 'Часть денег без источника',
      what: `Оплаты без привязки к маркетинг-источнику: ${money(unattributed)}.`,
      why: 'Если деньги не привязаны к источнику, решения по бюджету становятся “на глаз”.',
      next:
        surface === 'marketing'
          ? 'Проверьте цепочку связей: источник → лид → сделка → счет → оплата. Если в цепочке нет звена — источник денег “пропадает”.'
          : 'Проверьте цепочку связей: источник → лид → сделка → счет → оплата. Это нужно, чтобы деньги корректно считались по источникам.',
      tags: ['данные', 'атрибуция'],
    });
  }

  // 5) Stalled deals (sales/cash emphasis)
  if (stalledCount > 0) {
    items.push({
      id: 'stalled_deals',
      kind: 'risk',
      priority: surface === 'marketing' ? 'medium' : 'high',
      title: 'Сделки теряют темп',
      what: `Застрявших сделок: ${stalledCount}.`,
      why: 'Когда сделкам не назначают следующий шаг, деньги “зависают” даже при хорошем притоке лидов.',
      next:
        surface === 'sales_cash'
          ? 'На сегодня: назначьте следующий шаг и дату по топ-10 застрявших сделок (звонок/демо/КП/согласование).'
          : 'Сверьте качество лидов и передачу в продажи: по каким источникам сделки чаще “замирают” и почему.',
      tags: ['sales'],
    });
  }

  // 6) Priority actions from analytics (deterministic)
  const actions = [...analytics.salesCashPriority.priorityActionCandidates].sort((a, b) => {
    const pr = (x: typeof a) => priorityRank[x.priority] ?? 0;
    return pr(b) - pr(a);
  });

  for (const a of actions.slice(0, 4)) {
    items.push({
      id: `action_${a.id}`,
      kind: 'action',
      priority: a.priority,
      title: actionTypeLabel(a.type),
      what: a.facts[0] ? a.facts[0] : 'Есть кандидат на действие по данным.',
      why: 'Это действие имеет быстрый эффект на деньги/сроки и снижает риск.',
      next:
        surface === 'marketing' && a.type === 'reengage_stalled_deal'
          ? 'Согласуйте с ответственным по продажам: где именно “затык” и какой следующий шаг должен стать стандартом для сделок из этих источников.'
          : actionNext(a.type),
      tags: [a.area],
    });
  }

  return items
    .filter((it) => (surface === 'marketing' ? it.id !== 'overdue_cash' || overdueValue > 0 : true))
    .sort((a, b) => (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0))
    .slice(0, maxItems);
}

