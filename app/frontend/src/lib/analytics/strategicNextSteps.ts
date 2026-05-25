// Owner MVP — навигационные подсказки (только актуальные маршруты)
import type { ChannelCampaign, Deal, Invoice, Lead, MarketingSpend, PaymentTransaction } from '../types';
import type { ContentMetric } from './domain';

export type StrategicStepHref = '/uploads' | '/dashboard' | '/insights';

export interface StrategicNextStep {
  id: string;
  title: string;
  detail?: string;
  href: StrategicStepHref;
  priority: number;
}

export interface StrategicNextStepsInput {
  leads: Lead[];
  deals: Deal[];
  invoices: Invoice[];
  payments: PaymentTransaction[];
  marketingSpend: MarketingSpend[];
  channelCampaigns: ChannelCampaign[];
  contentMetrics: ContentMetric[];
}

/** Legacy helper — returns empty; funnel data no longer drives owner UI. */
export function computeStrategicNextSteps(_input: StrategicNextStepsInput): StrategicNextStep[] {
  return [
    {
      id: 'upload_summary',
      title: 'Загрузить сводную таблицу',
      detail: 'Главный экран строится из облачного снимка периода.',
      href: '/uploads',
      priority: 1,
    },
    {
      id: 'dashboard',
      title: 'Открыть главный экран',
      detail: 'KPI, приоритет периода и Instagram на одной странице.',
      href: '/dashboard',
      priority: 2,
    },
  ];
}
