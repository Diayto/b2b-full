// ============================================================
// BizPulse — Extended Domain Types for Revenue Operating System
//
// New entities and classifications that extend the base types.ts
// without breaking backward compatibility.
// ============================================================

// --- Source classification ---
export type SourceType = 'organic' | 'paid' | 'referral' | 'outbound' | 'direct' | 'unknown';

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  organic: 'Органический',
  paid: 'Платный',
  referral: 'Реферальный',
  outbound: 'Исходящий',
  direct: 'Прямой',
  unknown: 'Не определён',
};

// --- Content / Organic metrics ---
export type ContentPlatform = 'instagram' | 'tiktok' | 'facebook' | 'linkedin' | 'youtube' | 'telegram' | 'other';

export const PLATFORM_LABELS: Record<ContentPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  telegram: 'Telegram',
  other: 'Другое',
};

export interface ContentMetric {
  id: string;
  companyId: string;
  platform: ContentPlatform;
  contentId: string;
  contentTitle?: string;
  publishedAt: string;             // YYYY-MM-DD

  // Reach & visibility
  impressions: number;
  reach: number;
  profileVisits: number;

  // Engagement
  likes: number;
  comments: number;
  saves: number;
  shares: number;

  // Conversion to business
  inboundMessages: number;         // DMs / inquiries
  leadsGenerated: number;
  dealsGenerated: number;
  paidConversions: number;

  // Linkage
  channelCampaignExternalId?: string; // links content → source/channel
  uploadId?: string;
}

export interface ParsedContentMetricRow {
  platform: ContentPlatform;
  contentId: string;
  contentTitle?: string;
  publishedAt: string;
  impressions: number;
  reach: number;
  profileVisits: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  inboundMessages: number;
  leadsGenerated: number;
  dealsGenerated: number;
  paidConversions: number;
  channelCampaignExternalId?: string;
}

// --- Pipeline leakage metadata ---
export type StalledReason = 'no_response' | 'decision_pending' | 'budget_hold' | 'champion_left' | 'other';

export const STALLED_REASON_LABELS: Record<StalledReason, string> = {
  no_response: 'Нет ответа',
  decision_pending: 'Ожидание решения',
  budget_hold: 'Бюджет заморожен',
  champion_left: 'Контактное лицо ушло',
  other: 'Другое',
};

// --- Leakage categories (unified across funnel) ---
export type LeakageCategory =
  | 'lost_lead'
  | 'stalled_deal'
  | 'lost_deal'
  | 'won_not_invoiced'
  | 'invoiced_not_paid'
  | 'overdue_payment'
  | 'organic_no_conversion';

export const LEAKAGE_LABELS: Record<LeakageCategory, string> = {
  lost_lead: 'Потерянный лид',
  stalled_deal: 'Замершая сделка',
  lost_deal: 'Проигранная сделка',
  won_not_invoiced: 'Выиграна, но нет счёта',
  invoiced_not_paid: 'Выставлен счёт, не оплачен',
  overdue_payment: 'Просрочка оплаты',
  organic_no_conversion: 'Органика без конверсии',
};

export interface LeakageItem {
  category: LeakageCategory;
  stage: string;              // funnel stage where leakage occurred
  entityId: string;           // external ID of the leaked entity
  entityType: 'lead' | 'deal' | 'invoice' | 'content';
  amount: number;             // estimated lost value (0 if unknown)
  reason?: string;
  date?: string;
  managerId?: string;
}

export interface LeakageSummary {
  totalItems: number;
  totalEstimatedLoss: number;
  byCategory: Array<{
    category: LeakageCategory;
    label: string;
    count: number;
    estimatedLoss: number;
    percentage: number;        // of total items
  }>;
  byStage: Array<{
    stage: string;
    count: number;
    estimatedLoss: number;
  }>;
}

// --- Data completeness scoring ---
export interface CompletenessScore {
  area: string;
  label: string;
  score: number;              // 0..100
  totalFields: number;
  populatedFields: number;
  missingCritical: string[];  // critical missing fields
  notes: string[];
}

export interface SystemCompleteness {
  overall: number;            // 0..100
  areas: CompletenessScore[];
}

// --- Explainability layer ---
export interface MetricExplanation {
  what: string;               // What is wrong / current state
  why: string;                // Why it matters for business
  action: string;             // What to do about it
  severity: 'critical' | 'warning' | 'info' | 'success';
  confidence: 'exact' | 'estimated' | 'incomplete';
  dataCompleteness?: number;  // 0..100
}

/**
 * Any metric or insight block can carry an explanation.
 */
export interface ExplainableMetric<T> {
  value: T;
  explanation: MetricExplanation;
}
