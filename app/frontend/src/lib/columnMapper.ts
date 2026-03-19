// ============================================================
// BizPulse KZ — Smart Column Mapper
// Auto-detects file type and maps columns to internal schema
// ============================================================

import type { FileType } from './types';

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  confidence: number; // 0-100
  isAutoMapped: boolean;
}

export interface SmartMappingResult {
  detectedType: FileType;
  typeConfidence: number;
  mappings: ColumnMapping[];
  unmappedSourceColumns: string[];
  unmappedTargetFields: string[];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s_\-().#№]/g, '').trim();
}

// Extended alias map supporting common Russian/English business column names
const EXTENDED_ALIASES: Record<FileType, Record<string, string[]>> = {
  transactions: {
    date: ['date', 'дата', 'operationdate', 'transactiondate', 'датаоперации', 'dataoperacii'],
    amount: ['amount', 'sum', 'value', 'total', 'сумма', 'summa', 'итого'],
    direction: ['direction', 'type', 'flow', 'направление', 'операция', 'tip', 'vid'],
    category: ['category', 'категория', 'article', 'statya', 'статья'],
    counterparty: ['counterparty', 'partner', 'контрагент', 'kontragent', 'client', 'клиент'],
    description: ['description', 'comment', 'назначение', 'описание', 'kommentarij', 'note'],
    customerExternalId: ['customerexternalid', 'customerid', 'clientid', 'idклиента', 'kodklienta'],
  },
  customers: {
    customerExternalId: ['customerexternalid', 'customerid', 'clientid', 'idклиента', 'kodklienta', 'id', 'код'],
    name: ['name', 'customername', 'clientname', 'клиент', 'название', 'nazvanie', 'fullname', 'companyname', 'компания', 'имяклиента'],
    segment: ['segment', 'type', 'сегмент', 'категория', 'group', 'группа'],
    startDate: ['startdate', 'registeredat', 'датарегистрации', 'created', 'датасоздания'],
  },
  invoices: {
    invoiceDate: ['invoicedate', 'date', 'дата', 'датасчета', 'dataschet'],
    customerExternalId: ['customerexternalid', 'customerid', 'clientid', 'idклиента', 'клиент', 'customer'],
    amount: ['amount', 'sum', 'value', 'сумма', 'summa', 'total', 'итого'],
    status: ['status', 'state', 'статус', 'оплата'],
    paidDate: ['paiddate', 'paymentdate', 'датаоплаты', 'paid'],
    dueDate: ['duedate', 'duedatepayment', 'paymentduedate', 'дедлайн', 'срок', 'срокоплаты'],
    dealExternalId: ['dealexternalid', 'dealid', 'idсделки', 'сделка'],
    invoiceExternalId: ['invoiceexternalid', 'invoiceid', 'invoicenumber', 'number', 'номер', 'idсчета', 'номерсчета'],
  },
  marketing_spend: {
    month: ['month', 'period', 'месяц', 'период', 'дата'],
    amount: ['amount', 'sum', 'value', 'сумма', 'расход', 'бюджет', 'spend', 'cost', 'budget'],
    channelCampaignExternalId: ['channelcampaignexternalid', 'channelcampaignid', 'source', 'sourceid', 'канал', 'источник', 'campaign', 'кампания'],
  },
  leads: {
    leadExternalId: ['leadexternalid', 'leadid', 'idлида', 'id', 'лид', 'номер'],
    name: ['name', 'leadname', 'lead', 'имя', 'название', 'клиент', 'clientname'],
    channelCampaignExternalId: ['channelcampaignexternalid', 'source', 'sourceid', 'канал', 'источник', 'campaign'],
    managerExternalId: ['managerexternalid', 'managerid', 'менеджер', 'manager', 'ответственный', 'salesrep'],
    createdDate: ['createddate', 'date', 'дата', 'датасоздания', 'created'],
    status: ['status', 'state', 'статус', 'stage', 'этап'],
  },
  deals: {
    dealExternalId: ['dealexternalid', 'dealid', 'idсделки', 'id', 'номер', 'сделка'],
    leadExternalId: ['leadexternalid', 'leadid', 'idлида', 'лид'],
    customerExternalId: ['customerexternalid', 'customerid', 'clientid', 'клиент'],
    managerExternalId: ['managerexternalid', 'managerid', 'менеджер', 'manager', 'ответственный'],
    createdDate: ['createddate', 'date', 'дата', 'датасоздания', 'created'],
    expectedCloseDate: ['expectedclosedate', 'closedate', 'ожидаемаядата', 'планируемаядата'],
    lastActivityDate: ['lastactivitydate', 'lastactivity', 'lastupdated', 'последняяактивность', 'обновлено'],
    status: ['status', 'state', 'статус', 'stage', 'этап'],
    wonDate: ['wondate', 'closedwon', 'датаwon', 'датаокончания', 'датавыигрыша'],
    lostDate: ['lostdate', 'closedlost', 'датапотери'],
    lostReason: ['lostreason', 'reason', 'причина', 'причинапотери', 'failreason'],
    lostStage: ['loststage', 'стадияпотери', 'этаппотери'],
  },
  payments: {
    invoiceExternalId: ['invoiceexternalid', 'invoiceid', 'invoicenumber', 'номерсчета', 'счет'],
    paymentDate: ['paymentdate', 'date', 'дата', 'датаоплаты'],
    amount: ['amount', 'sum', 'value', 'сумма', 'total'],
    paymentExternalId: ['paymentexternalid', 'paymentid', 'idплатежа', 'номерплатежа'],
  },
  channels_campaigns: {
    channelCampaignExternalId: ['channelcampaignexternalid', 'id', 'sourceid', 'idисточника', 'код'],
    name: ['name', 'title', 'название', 'source', 'канал'],
    channelName: ['channelname', 'channel', 'канал', 'типканала'],
    campaignName: ['campaignname', 'campaign', 'кампания'],
  },
  managers: {
    managerExternalId: ['managerexternalid', 'managerid', 'id', 'idменеджера', 'код'],
    name: ['name', 'fullname', 'менеджер', 'имя', 'фио'],
  },
};

// Required fields per type — used for type detection scoring
const REQUIRED_FIELDS: Record<FileType, string[]> = {
  transactions: ['date', 'amount', 'direction'],
  customers: ['customerExternalId', 'name'],
  invoices: ['invoiceDate', 'customerExternalId', 'amount', 'status'],
  marketing_spend: ['month', 'amount'],
  leads: ['leadExternalId'],
  deals: ['dealExternalId'],
  payments: ['invoiceExternalId', 'paymentDate', 'amount'],
  channels_campaigns: ['channelCampaignExternalId', 'name'],
  managers: ['managerExternalId', 'name'],
};

function matchColumn(sourceNorm: string, candidates: string[]): number {
  // Exact match
  if (candidates.includes(sourceNorm)) return 100;

  // Substring match
  for (const c of candidates) {
    if (sourceNorm.includes(c) || c.includes(sourceNorm)) return 80;
  }

  // Fuzzy: shared prefix >= 4 chars
  for (const c of candidates) {
    let prefixLen = 0;
    for (let i = 0; i < Math.min(sourceNorm.length, c.length); i++) {
      if (sourceNorm[i] === c[i]) prefixLen++;
      else break;
    }
    if (prefixLen >= 4) return 60;
  }

  return 0;
}

/**
 * Auto-detects file type and maps source columns to internal schema fields.
 */
export function smartMapColumns(sourceColumns: string[]): SmartMappingResult {
  const sourceNormalized = sourceColumns.map(normalize);

  // Score each file type
  const typeScores: Array<{ type: FileType; score: number; mappings: ColumnMapping[] }> = [];

  for (const [type, aliases] of Object.entries(EXTENDED_ALIASES) as [FileType, Record<string, string[]>][]) {
    const mappings: ColumnMapping[] = [];
    const usedSources = new Set<number>();

    for (const [targetField, candidates] of Object.entries(aliases)) {
      let bestSourceIdx = -1;
      let bestConf = 0;

      for (let i = 0; i < sourceNormalized.length; i++) {
        if (usedSources.has(i)) continue;
        const conf = matchColumn(sourceNormalized[i], candidates.map(normalize));
        if (conf > bestConf) {
          bestConf = conf;
          bestSourceIdx = i;
        }
      }

      if (bestSourceIdx >= 0 && bestConf >= 60) {
        usedSources.add(bestSourceIdx);
        mappings.push({
          sourceColumn: sourceColumns[bestSourceIdx],
          targetField,
          confidence: bestConf,
          isAutoMapped: true,
        });
      }
    }

    // Score: required fields matched more, total matches contribute
    const requiredFields = REQUIRED_FIELDS[type];
    const requiredMatched = requiredFields.filter((rf) => mappings.some((m) => m.targetField === rf)).length;
    const score = requiredMatched * 100 + mappings.length * 10 + mappings.reduce((sum, m) => sum + m.confidence, 0);

    typeScores.push({ type, score, mappings });
  }

  // Pick best type
  typeScores.sort((a, b) => b.score - a.score);
  const best = typeScores[0];

  const allTargetFields = Object.keys(EXTENDED_ALIASES[best.type]);
  const mappedTargetFields = new Set(best.mappings.map((m) => m.targetField));
  const mappedSourceColumns = new Set(best.mappings.map((m) => m.sourceColumn));

  return {
    detectedType: best.type,
    typeConfidence: Math.min(100, Math.round((best.score / (REQUIRED_FIELDS[best.type].length * 100 + allTargetFields.length * 10 + allTargetFields.length * 100)) * 100)),
    mappings: best.mappings,
    unmappedSourceColumns: sourceColumns.filter((c) => !mappedSourceColumns.has(c)),
    unmappedTargetFields: allTargetFields.filter((f) => !mappedTargetFields.has(f)),
  };
}

/**
 * Applies a set of column mappings to raw data rows.
 */
export function applyMappings(
  rawRows: Record<string, unknown>[],
  mappings: ColumnMapping[],
): Record<string, unknown>[] {
  return rawRows.map((row) => {
    const mapped: Record<string, unknown> = {};
    for (const m of mappings) {
      if (row[m.sourceColumn] !== undefined) {
        mapped[m.targetField] = row[m.sourceColumn];
      }
    }
    // Also keep original fields for the parser's normalizeRowsForType
    return { ...row, ...mapped };
  });
}
