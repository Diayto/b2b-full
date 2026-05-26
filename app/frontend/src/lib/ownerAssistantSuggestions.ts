import type { OwnerAssistantContext } from '@/lib/ownerAssistantContext';

const POOL: Record<string, string[]> = {
  priority: [
    'Что сделать в первую очередь на этой неделе?',
    'Какой один шаг даст максимальный эффект за 7 дней?',
    'Что отложить, пока не закроем главную проблему периода?',
  ],
  budget: [
    'Стоит ли увеличивать рекламный бюджет сейчас?',
    'Какой CPL считать нормальным для этого периода?',
    'Куда перераспределить расход, если новые кампании не открываем?',
  ],
  funnel: [
    'Где главное узкое место в воронке?',
    'Почему так мало сделок относительно лидов?',
    'На каком этапе теряем больше всего денег?',
  ],
  cash: [
    'Почему выручка есть, а денег на счёте не хватает?',
    'Что проверить по оплатам и срокам?',
    'Как ускорить приток денег без роста расхода?',
  ],
  channels: [
    'Какой канал выглядит сильнее остальных?',
    'Стоит ли масштабировать Instagram organic или Meta Ads?',
    'Какой контент масштабировать по лидам?',
  ],
  marketing: [
    'Много лидов, мало сделок — это маркетинг или продажи?',
    'Какие 2 метрики смотреть каждый понедельник?',
    'Что проверить в первом контакте с лидом?',
  ],
  stable: [
    'Период стабилен — куда вложить следующий рубль?',
    'Какой канал усилить для роста без риска?',
    'Какие гипотезы протестировать в следующем месяце?',
  ],
};

function pickN(items: string[], n: number): string[] {
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export function buildAssistantSuggestions(ctx: OwnerAssistantContext | null): string[] {
  if (!ctx) return pickN(POOL.priority, 3);

  const out: string[] = [];
  const rule = ctx.insight.ruleId;
  const m = ctx.metrics;

  out.push(...pickN(POOL.priority, 1));

  if (rule === 1) out.push(...pickN(POOL.funnel, 2));
  else if (rule === 2) out.push(...pickN(POOL.budget, 2));
  else if (rule === 3) out.push(...pickN(POOL.cash, 2));
  else if (rule === 5) out.push(...pickN(POOL.stable, 2));
  else out.push(...pickN(POOL.funnel, 1), ...pickN(POOL.marketing, 1));

  if (m.spend > 0 && m.leads > 0) out.push(...pickN(POOL.budget, 1));
  if (ctx.marketing?.channels?.length) out.push(...pickN(POOL.channels, 1));
  if (ctx.marketing?.content?.length) out.push('Какой ролик масштабировать, а какой остановить?');

  const unique = [...new Set(out)];
  return pickN(unique, Math.min(8, unique.length));
}
