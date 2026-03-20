// ============================================================
// BizPulse — Import Presets
//
// Preset schemas for common import scenarios:
//   - CRM export
//   - Sales pipeline export
//   - Invoice / payment export
//   - Marketing performance export
//   - Organic/social content export
//
// Presets improve auto-detection and mapping confidence.
// ============================================================

import type { FileType } from '../types';

export interface PresetField {
  field: string;
  label: string;
  required: boolean;
  aliases: string[];  // RU + EN variations
}

export interface ImportPreset {
  id: string;
  name: string;
  description: string;
  fileType: FileType;
  fields: PresetField[];
  sampleColumns: string[];  // example column names the user might have
}

/**
 * All import presets.
 */
export const IMPORT_PRESETS: ImportPreset[] = [
  {
    id: 'crm_export',
    name: 'Экспорт из CRM',
    description: 'Данные клиентов / контактов из CRM-системы',
    fileType: 'customers',
    fields: [
      { field: 'customerExternalId', label: 'ID клиента', required: true, aliases: ['id', 'client_id', 'customer_id', 'id клиента', 'ид', 'код', 'номер клиента'] },
      { field: 'name', label: 'Имя / Название', required: true, aliases: ['name', 'client_name', 'customer_name', 'company', 'название', 'имя', 'организация', 'клиент', 'наименование', 'контрагент'] },
      { field: 'segment', label: 'Сегмент', required: false, aliases: ['segment', 'type', 'category', 'сегмент', 'тип', 'категория'] },
      { field: 'startDate', label: 'Дата начала', required: false, aliases: ['start_date', 'created', 'created_at', 'дата', 'дата создания', 'дата начала'] },
      { field: 'email', label: 'Email', required: false, aliases: ['email', 'e-mail', 'почта', 'электронная почта'] },
      { field: 'phone', label: 'Телефон', required: false, aliases: ['phone', 'tel', 'telephone', 'телефон', 'тел'] },
    ],
    sampleColumns: ['ID клиента', 'Название', 'Сегмент', 'Дата создания', 'Email', 'Телефон'],
  },

  {
    id: 'sales_pipeline',
    name: 'Воронка продаж',
    description: 'Сделки, лиды и воронка из CRM',
    fileType: 'deals',
    fields: [
      { field: 'dealExternalId', label: 'ID сделки', required: true, aliases: ['deal_id', 'id', 'id сделки', 'номер сделки', 'ид', 'код', '№', 'номер'] },
      { field: 'leadExternalId', label: 'ID лида', required: false, aliases: ['lead_id', 'lead', 'id лида', 'лид', 'номер телефона', 'телефон', 'phone', 'tel'] },
      { field: 'customerExternalId', label: 'ID клиента', required: false, aliases: ['client_id', 'customer_id', 'customer', 'клиент', 'id клиента', 'контрагент', 'номер телефона', 'телефон', 'phone'] },
      { field: 'managerExternalId', label: 'Менеджер', required: false, aliases: ['manager_id', 'manager', 'менеджер', 'ответственный', 'sales_rep', 'оп'] },
      { field: 'status', label: 'Статус', required: false, aliases: ['status', 'state', 'stage', 'статус', 'стадия', 'этап', 'результат', 'исход'] },
      { field: 'createdDate', label: 'Дата создания', required: false, aliases: ['created_date', 'created', 'date', 'дата', 'дата создания'] },
      { field: 'wonDate', label: 'Дата выигрыша', required: false, aliases: ['won_date', 'close_date', 'closed', 'дата выигрыша', 'дата закрытия'] },
      { field: 'lostReason', label: 'Причина потери', required: false, aliases: ['lost_reason', 'loss_reason', 'причина', 'причина потери', 'причина отказа', 'комментарий', 'почему отказ'] },
      { field: 'lostDate', label: 'Дата потери', required: false, aliases: ['lost_date', 'дата потери', 'дата проигрыша'] },
      { field: 'lostStage', label: 'Этап потери', required: false, aliases: ['lost_stage', 'этап потери', 'этап', 'стадия отказа', 'точка потери'] },
    ],
    sampleColumns: ['ID сделки', 'Клиент', 'Менеджер', 'Статус', 'Дата создания', 'Дата закрытия'],
  },

  {
    id: 'leads_export',
    name: 'Экспорт лидов',
    description: 'Лиды из CRM / маркетинга',
    fileType: 'leads',
    fields: [
      { field: 'leadExternalId', label: 'ID лида', required: true, aliases: ['lead_id', 'id', 'id лида', 'номер', 'ид', 'номер телефона', 'телефон', 'phone', 'tel'] },
      { field: 'name', label: 'Имя', required: false, aliases: ['name', 'имя', 'название', 'лид'] },
      { field: 'channelCampaignExternalId', label: 'Источник', required: false, aliases: ['source', 'channel', 'campaign', 'источник', 'канал', 'кампания', 'utm_source'] },
      { field: 'managerExternalId', label: 'Менеджер', required: false, aliases: ['manager', 'manager_id', 'менеджер', 'ответственный'] },
      { field: 'createdDate', label: 'Дата', required: false, aliases: ['date', 'created', 'created_date', 'дата', 'дата создания'] },
      { field: 'status', label: 'Статус', required: false, aliases: ['status', 'state', 'статус', 'состояние'] },
      { field: 'sourceType', label: 'Тип источника', required: false, aliases: ['source_type', 'тип источника', 'тип', 'type'] },
    ],
    sampleColumns: ['ID лида', 'Имя', 'Источник', 'Менеджер', 'Дата', 'Статус'],
  },

  {
    id: 'invoice_payment',
    name: 'Счета и оплаты',
    description: 'Выставленные счета и поступления',
    fileType: 'invoices',
    fields: [
      { field: 'invoiceExternalId', label: 'Номер счёта', required: true, aliases: ['invoice_id', 'id', 'invoice_number', 'номер', 'номер счета', 'ид', 'id счета', '№'] },
      { field: 'customerExternalId', label: 'Клиент', required: false, aliases: ['client', 'customer', 'customer_id', 'клиент', 'контрагент', 'покупатель', 'phone', 'телефон', 'номер телефона'] },
      { field: 'dealExternalId', label: 'Сделка', required: false, aliases: ['deal', 'deal_id', 'сделка', 'id сделки', '№', 'номер'] },
      { field: 'amount', label: 'Сумма', required: true, aliases: ['amount', 'total', 'sum', 'сумма', 'итого', 'стоимость', 'сумма оплаты', 'общая стоимость'] },
      { field: 'invoiceDate', label: 'Дата счёта', required: false, aliases: ['date', 'invoice_date', 'issued', 'дата', 'дата счета', 'дата выставления'] },
      { field: 'dueDate', label: 'Срок оплаты', required: false, aliases: ['due_date', 'due', 'payment_due', 'срок', 'срок оплаты', 'дата оплаты', 'дата истечения 14 дней'] },
      { field: 'status', label: 'Статус', required: false, aliases: ['status', 'state', 'payment_status', 'статус', 'оплачен', 'остаток'] },
    ],
    sampleColumns: ['Номер счёта', 'Клиент', 'Сумма', 'Дата выставления', 'Срок оплаты', 'Статус'],
  },

  {
    id: 'payments_export',
    name: 'Платежи',
    description: 'Реестр поступлений / оплат',
    fileType: 'payments',
    fields: [
      { field: 'paymentExternalId', label: 'ID платежа', required: true, aliases: ['payment_id', 'id', 'номер', 'ид', 'id платежа'] },
      { field: 'invoiceExternalId', label: 'Номер счёта', required: false, aliases: ['invoice_id', 'invoice', 'счет', 'номер счета', '№', 'номер'] },
      { field: 'amount', label: 'Сумма', required: true, aliases: ['amount', 'sum', 'total', 'сумма', 'поступление', 'сумма оплаты'] },
      { field: 'paymentDate', label: 'Дата', required: true, aliases: ['date', 'payment_date', 'paid_date', 'дата', 'дата оплаты', 'дата платежа'] },
      { field: 'method', label: 'Способ оплаты', required: false, aliases: ['method', 'payment_method', 'type', 'способ', 'тип оплаты'] },
    ],
    sampleColumns: ['ID платежа', 'Номер счёта', 'Сумма', 'Дата платежа', 'Способ оплаты'],
  },

  {
    id: 'marketing_performance',
    name: 'Маркетинговые расходы',
    description: 'Рекламные бюджеты по каналам и месяцам',
    fileType: 'marketing_spend',
    fields: [
      { field: 'channelCampaignExternalId', label: 'Канал / кампания', required: true, aliases: ['channel', 'campaign', 'source', 'канал', 'кампания', 'источник', 'utm_source', 'рекламный канал'] },
      { field: 'month', label: 'Месяц', required: true, aliases: ['month', 'period', 'date', 'месяц', 'период', 'дата'] },
      { field: 'amount', label: 'Расход', required: true, aliases: ['amount', 'spend', 'cost', 'budget', 'расход', 'бюджет', 'затраты', 'стоимость'] },
      { field: 'impressions', label: 'Показы', required: false, aliases: ['impressions', 'views', 'показы', 'просмотры'] },
      { field: 'clicks', label: 'Клики', required: false, aliases: ['clicks', 'click', 'клики', 'переходы'] },
    ],
    sampleColumns: ['Канал', 'Месяц', 'Расход', 'Показы', 'Клики'],
  },

  {
    id: 'organic_content',
    name: 'Контент / Органика',
    description: 'Публикации и метрики из соцсетей',
    fileType: 'content_metrics',
    fields: [
      { field: 'contentId', label: 'ID поста', required: true, aliases: ['post_id', 'id', 'content_id', 'id поста', 'ид', 'номер'] },
      { field: 'platform', label: 'Платформа', required: true, aliases: ['platform', 'network', 'social', 'платформа', 'соцсеть', 'сеть'] },
      { field: 'contentTitle', label: 'Заголовок', required: false, aliases: ['title', 'caption', 'text', 'заголовок', 'текст', 'описание'] },
      { field: 'publishedAt', label: 'Дата публикации', required: true, aliases: ['date', 'published', 'published_at', 'posted', 'дата', 'дата публикации'] },
      { field: 'impressions', label: 'Показы', required: false, aliases: ['impressions', 'views', 'показы', 'просмотры'] },
      { field: 'reach', label: 'Охват', required: false, aliases: ['reach', 'охват'] },
      { field: 'profileVisits', label: 'Визиты профиля', required: false, aliases: ['profile_visits', 'визиты', 'визиты профиля'] },
      { field: 'likes', label: 'Лайки', required: false, aliases: ['likes', 'like', 'лайки'] },
      { field: 'comments', label: 'Комментарии', required: false, aliases: ['comments', 'комментарии'] },
      { field: 'saves', label: 'Сохранения', required: false, aliases: ['saves', 'bookmarks', 'сохранения', 'закладки'] },
      { field: 'shares', label: 'Репосты', required: false, aliases: ['shares', 'reposts', 'репосты', 'пересылки'] },
      { field: 'inboundMessages', label: 'Сообщения (DM)', required: false, aliases: ['messages', 'dms', 'dm', 'inbound', 'сообщения', 'директ'] },
      { field: 'leadsGenerated', label: 'Лиды', required: false, aliases: ['leads', 'лиды', 'заявки'] },
      { field: 'dealsGenerated', label: 'Сделки', required: false, aliases: ['deals', 'сделки'] },
      { field: 'paidConversions', label: 'Оплаты', required: false, aliases: ['conversions', 'paid', 'оплаты', 'конверсии'] },
    ],
    sampleColumns: ['ID поста', 'Платформа', 'Дата', 'Показы', 'Охват', 'Лайки', 'Комменты', 'Лиды'],
  },

  {
    id: 'channels_campaigns',
    name: 'Каналы / кампании',
    description: 'Справочник каналов и рекламных кампаний',
    fileType: 'channels_campaigns',
    fields: [
      { field: 'channelCampaignExternalId', label: 'ID канала', required: true, aliases: ['id', 'channel_id', 'campaign_id', 'id канала', 'ид'] },
      { field: 'name', label: 'Название', required: true, aliases: ['name', 'title', 'channel', 'campaign', 'название', 'канал', 'кампания'] },
      { field: 'type', label: 'Тип', required: false, aliases: ['type', 'category', 'тип', 'категория'] },
    ],
    sampleColumns: ['ID канала', 'Название', 'Тип'],
  },
];

/**
 * Find matching preset by file type.
 */
export function getPresetByFileType(fileType: FileType): ImportPreset | undefined {
  return IMPORT_PRESETS.find((p) => p.fileType === fileType);
}

/**
 * Get all field aliases from a preset (used for enhanced auto-detection).
 */
export function getPresetAliases(preset: ImportPreset): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const f of preset.fields) {
    map.set(f.field, f.aliases);
  }
  return map;
}

/**
 * Get required fields for a preset.
 */
export function getPresetRequiredFields(preset: ImportPreset): string[] {
  return preset.fields.filter((f) => f.required).map((f) => f.field);
}
