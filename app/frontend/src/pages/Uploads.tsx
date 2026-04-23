// ============================================================
// BizPulse KZ — Smart Upload Center
// Auto-detect, auto-map, mapping confirmation UI
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle,
  FileText, Eye, ArrowRight, ArrowDown, Zap, Settings2, ChevronDown,
} from 'lucide-react';
import {
  getSession,
  addTransactions,
  addCustomers,
  getCustomers,
  addInvoices,
  addMarketingSpend,
  addLeads,
  addDeals,
  addChannelCampaigns,
  addManagers,
  addPayments,
  addUpload,
  getUploads,
  addContentMetrics,
  getManagers,
  getLeads,
  getDeals,
  getInvoices,
  getPayments,
  getChannelCampaigns,
  getMarketingSpend,
  getContentMetrics,
} from '@/lib/store';
import { computeLinkageDiagnostics } from '@/lib/analytics';
import {
  sortSmartBatchPlans,
  ensureDefaultOrganicChannel,
  enrichLeadsWithDefaultChannel,
  applyDefaultChannelToLeadRows,
  ensureChannelsForMarketingSpendRows,
} from '@/lib/import/smartWorkbookDefaults';
import { buildAggregateSheetPlans, isAggregateSheetNameNormalized } from '@/lib/import/aggregateSheetPlans';
import { parseFromRows } from '@/lib/parsers';
import { detectAndMap, mapWithPreset, getTargetFieldsForType } from '@/lib/import';
import { applyColumnMappings } from '@/lib/import/pipeline';
import type { ColumnMapping, DetectionResult } from '@/lib/import/pipeline';
import { smartMapColumns } from '@/lib/columnMapper';
import type {
  FileType,
  ValidationError,
  ValidationWarning,
  ParsedTransactionRow,
  ParsedCustomerRow,
  ParsedInvoiceRow,
  ParsedMarketingSpendRow,
  ParsedLeadRow,
  ParsedDealRow,
  ParsedPaymentRow,
  ParsedChannelCampaignRow,
  ParsedManagerRow,
  ParsedContentMetricRow,
} from '@/lib/types';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { cn } from '@/lib/utils';
import { allowChronaDemoFallback } from '@/lib/chronaDemoPreview';
import { MvpSupabaseUploadCard } from '@/components/MvpSupabaseUploadCard';
import DemoSourcesStrip from '@/components/DemoSourcesStrip';
import OwnerDemoScenarioCard from '@/components/OwnerDemoScenarioCard';
import DataInstagramPreviewCard from '@/components/DataInstagramPreviewCard';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const EMPTY_URL = 'https://mgx-backend-cdn.metadl.com/generate/images/977836/2026-02-19/564e0562-0b93-4cbb-9ae9-7398783510cc.png';

const FILE_TYPE_CONFIG: Record<FileType | 'auto', { label: string; description: string; columns: string[] }> = {
  auto: {
    label: 'Автоопределение',
    description: 'Система определит тип и сопоставит колонки',
    columns: [],
  },
  transactions: {
    label: 'Транзакции',
    description: 'Доходы и расходы компании',
    columns: ['date', 'amount', 'direction', 'category', 'counterparty', 'description'],
  },
  customers: {
    label: 'Клиенты',
    description: 'База клиентов для расчёта LTV',
    columns: ['customerExternalId', 'name', 'segment', 'startDate'],
  },
  invoices: {
    label: 'Счета',
    description: 'Счета для дебиторки и LTV',
    columns: ['invoiceDate', 'customerExternalId', 'amount', 'status', 'paidDate', 'dueDate', 'dealExternalId', 'invoiceExternalId'],
  },
  marketing_spend: {
    label: 'Маркетинг расходы',
    description: 'Расходы для CAC',
    columns: ['month', 'amount', 'channelCampaignExternalId'],
  },
  leads: {
    label: 'Лиды',
    description: 'Вход в воронку',
    columns: ['leadExternalId', 'name', 'channelCampaignExternalId', 'managerExternalId', 'createdDate', 'status'],
  },
  deals: {
    label: 'Сделки',
    description: 'Коммерческие сделки',
    columns: ['dealExternalId', 'leadExternalId', 'customerExternalId', 'managerExternalId', 'createdDate', 'expectedCloseDate', 'lastActivityDate', 'status', 'wonDate'],
  },
  payments: {
    label: 'Оплаты',
    description: 'Платежи по счетам',
    columns: ['invoiceExternalId', 'paymentDate', 'amount', 'paymentExternalId'],
  },
  channels_campaigns: {
    label: 'Каналы / кампании',
    description: 'Источники маркетинга',
    columns: ['channelCampaignExternalId', 'name', 'channelName', 'campaignName'],
  },
  managers: {
    label: 'Менеджеры',
    description: 'Ответственные за сделки',
    columns: ['managerExternalId', 'name'],
  },
  content_metrics: {
    label: 'Контент / органика',
    description: 'Публикации и метрики из соцсетей',
    columns: ['contentId', 'platform', 'contentTitle', 'publishedAt', 'impressions', 'reach', 'likes', 'comments', 'leadsGenerated', 'paidConversions'],
  },
};

// Read file to raw rows (duplicated for mapping step)
async function fileToRawRows(file: File, sheetName?: string): Promise<Record<string, unknown>[]> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (result) => resolve(result.data as Record<string, unknown>[]),
        error: (err: Error) => reject(err),
      });
    });
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const resolvedSheetName = sheetName && wb.Sheets[sheetName] ? sheetName : wb.SheetNames[0];
    const sheet = wb.Sheets[resolvedSheetName];
    return parseWorksheetToRows(sheet);
  }

  throw new Error(`Неподдерживаемый формат: .${ext}`);
}

type UploadStep = 'select' | 'mapping' | 'preview' | 'done';

interface PostImportChecklist {
  hasLeads: boolean;
  hasDeals: boolean;
  hasInvoices: boolean;
  hasPayments: boolean;
  hasChannels: boolean;
  hasSpend: boolean;
  hasContent: boolean;
  linkageCoveragePercent: number;
  actions: string[];
}

interface GuidedStep {
  id: 'consultations' | 'sales' | 'summary';
  title: string;
  sheetHint: string;
  targetType: FileType;
  done: boolean;
}

function suggestFileTypeBySheetName(sheetName: string): FileType | null {
  const normalized = sheetName.toLowerCase().trim();
  if (normalized.includes('консультац')) return 'leads';
  if (normalized.includes('продаж')) return 'deals';
  if (normalized.includes('свод')) return 'marketing_spend';
  if (normalized.includes('расход') || normalized.includes('spend')) return 'marketing_spend';
  return null;
}

function parseWorksheetToRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  if (!matrix.length) return [];

  let bestHeaderIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(12, matrix.length); i++) {
    const row = matrix[i] ?? [];
    const score = row.filter((cell) => {
      const text = String(cell ?? '').trim();
      return text.length > 0 && Number.isNaN(Number(text));
    }).length;
    if (score > bestScore) {
      bestScore = score;
      bestHeaderIndex = i;
    }
  }

  const headerRow = matrix[bestHeaderIndex] ?? [];
  const headers = headerRow.map((cell, idx) => {
    const text = String(cell ?? '').trim();
    if (!text) return idx === 0 ? '№' : `col_${idx + 1}`;
    return text;
  });

  const rows = matrix.slice(bestHeaderIndex + 1).map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = row?.[idx] ?? '';
    });
    return obj;
  });

  return rows.filter((row) => {
    const values = Object.values(row);
    const nonEmpty = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
    if (nonEmpty.length === 0) return false;

    const keys = Object.keys(row).map((k) => k.toLowerCase().trim());
    const hasPhoneCol = keys.some((k) => k.includes('номер телефона') || k.includes('phone'));
    if (hasPhoneCol) {
      const phoneKey = Object.keys(row).find((k) => k.toLowerCase().includes('номер телефона') || k.toLowerCase().includes('phone'));
      const nameKey = Object.keys(row).find((k) => k.toLowerCase().trim() === 'имя');
      const managerKey = Object.keys(row).find((k) => k.toLowerCase().includes('менеджер') || k.toLowerCase().includes('оп'));
      const dateKey = Object.keys(row).find((k) => k.toLowerCase().trim() === 'дата');

      const phoneVal = phoneKey ? String(row[phoneKey] ?? '').trim() : '';
      const nameVal = nameKey ? String(row[nameKey] ?? '').trim() : '';
      const managerVal = managerKey ? String(row[managerKey] ?? '').trim() : '';
      const dateVal = dateKey ? String(row[dateKey] ?? '').trim() : '';

      if (!phoneVal && !nameVal && !managerVal && !dateVal) return false;
    }

    const hasAggregateWord = nonEmpty.some((v) => {
      const s = String(v).toLowerCase();
      return s.includes('итог') || s.includes('total');
    });
    if (hasAggregateWord && nonEmpty.length <= 3) return false;

    return true;
  });
}

interface SmartBatchSheetPlan {
  sheetName: string;
  fileType: FileType;
  mappedRows: Record<string, unknown>[];
  parsed: Awaited<ReturnType<typeof parseFromRows>>;
}

/**
 * Build 0..n import plans per sheet (e.g. ПРОДАЖИ → deals + invoices).
 */
function buildPlansForWorkbookSheet(sheetName: string, rows: Record<string, unknown>[]): SmartBatchSheetPlan[] {
  if (rows.length === 0) return [];
  const normalized = sheetName.toLowerCase().trim();

  const cols = Object.keys(rows[0]);
  const out: SmartBatchSheetPlan[] = [];

  if (normalized.includes('продаж')) {
    const dealDet = mapWithPreset(cols, 'deals', rows);
    if (dealDet.mappings.length > 0) {
      const mapped = applyColumnMappings(rows, dealDet.mappings);
      const parsed = parseFromRows(mapped, 'deals');
      if (parsed.rows.length > 0) {
        out.push({ sheetName, fileType: 'deals', mappedRows: mapped, parsed });
      }
    }
    const invDet = mapWithPreset(cols, 'invoices', rows);
    if (invDet.mappings.length > 0) {
      const mapped = applyColumnMappings(rows, invDet.mappings);
      const parsed = parseFromRows(mapped, 'invoices');
      if (parsed.rows.length > 0) {
        out.push({ sheetName, fileType: 'invoices', mappedRows: mapped, parsed });
      }
    }
    return out;
  }

  if (isAggregateSheetNameNormalized(normalized)) {
    return buildAggregateSheetPlans(sheetName, rows) as SmartBatchSheetPlan[];
  }

  const suggestedType = suggestFileTypeBySheetName(sheetName);
  let detection: DetectionResult = suggestedType
    ? mapWithPreset(cols, suggestedType, rows)
    : detectAndMap(cols, rows);

  if (!detection.mappings.length) return out;

  let mappedRows = applyColumnMappings(rows, detection.mappings);
  let parsed = parseFromRows(mappedRows, detection.fileType);

  if (parsed.rows.length === 0 && !suggestedType) {
    const fallbacks: FileType[] = ['leads', 'deals', 'invoices', 'marketing_spend', 'customers'];
    for (const ft of fallbacks) {
      const det = mapWithPreset(cols, ft, rows);
      if (det.mappings.length === 0) continue;
      const m = applyColumnMappings(rows, det.mappings);
      const p = parseFromRows(m, ft);
      if (p.rows.length > 0) {
        detection = det;
        mappedRows = m;
        parsed = p;
        break;
      }
    }
  }

  if (parsed.rows.length === 0) return out;

  const finalParsed =
    detection.fileType === 'leads' ? enrichLeadsWithDefaultChannel(parsed) : parsed;

  out.push({ sheetName, fileType: detection.fileType, mappedRows, parsed: finalParsed });
  return out;
}

export default function UploadsPage() {
  const navigate = useNavigate();
  const session = getSession();
  const companyId = session?.companyId || '';

  const [fileType, setFileType] = useState<FileType | 'auto'>('auto');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [warnings, setWarnings] = useState<ValidationWarning[]>([]);
  const [result, setResult] = useState<{ success: number; total: number; errors: number } | null>(null);
  const [autoDetectedType, setAutoDetectedType] = useState<FileType | null>(null);

  // Smart mapping state
  const [step, setStep] = useState<UploadStep>('select');
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [parsedResult, setParsedResult] = useState<Awaited<ReturnType<typeof parseFromRows>> | null>(null);
  const [editableMappings, setEditableMappings] = useState<ColumnMapping[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [sourceColumns, setSourceColumns] = useState<string[]>([]);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [sheetTypeSuggestion, setSheetTypeSuggestion] = useState<FileType | null>(null);
  const [postImportChecklist, setPostImportChecklist] = useState<PostImportChecklist | null>(null);
  const [smartBatchPlan, setSmartBatchPlan] = useState<SmartBatchSheetPlan[] | null>(null);
  const [autoAnalyzeAttempted, setAutoAnalyzeAttempted] = useState(false);

  const uploads = getUploads(companyId);

  const readSheetNames = useCallback(async (file: File): Promise<string[]> => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') return [];
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    return wb.SheetNames ?? [];
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      toast.error('Поддерживаются только файлы .xlsx, .xls, .csv');
      return;
    }

    setSelectedFile(file);
    setPreview(null);
    setErrors([]);
    setWarnings([]);
    setResult(null);
    setAutoDetectedType(null);
    setStep('select');
    setDetectionResult(null);
    setParsedResult(null);
    setRawRows([]);
    setSourceColumns([]);
    setEditableMappings([]);
    setAvailableSheets([]);
    setSelectedSheet('');
    setSheetTypeSuggestion(null);
    setPostImportChecklist(null);
    setSmartBatchPlan(null);
    setAutoAnalyzeAttempted(false);

    const normalizedExt = ext?.toLowerCase();
    if (normalizedExt === 'xlsx' || normalizedExt === 'xls') {
      void readSheetNames(file)
        .then((sheetNames) => {
          setAvailableSheets(sheetNames);
          const initialSheet = sheetNames[0] ?? '';
          setSelectedSheet(initialSheet);
          setSheetTypeSuggestion(initialSheet ? suggestFileTypeBySheetName(initialSheet) : null);
        })
        .catch(() => {
          setAvailableSheets([]);
          setSelectedSheet('');
          setSheetTypeSuggestion(null);
        });
    }
  }, [readSheetNames]);

  // Smart analyze:
  // - CSV/single-sheet: detect type + mapping confirmation
  // - XLSX multi-sheet: auto-build batch plan (no per-sheet manual selection)
  const handleSmartAnalyze = useCallback(async () => {
    if (!selectedFile) return;
    setProcessing(true);
    try {
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      const isWorkbook = ext === 'xlsx' || ext === 'xls';

      if (isWorkbook && fileType === 'auto' && availableSheets.length >= 1) {
        const buffer = await selectedFile.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
        const plans: SmartBatchSheetPlan[] = [];
        const allErrors: ValidationError[] = [];
        const allWarnings: ValidationWarning[] = [];

        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const rows = parseWorksheetToRows(ws);
          const sheetPlans = buildPlansForWorkbookSheet(sheetName, rows);
          for (const plan of sheetPlans) {
            plans.push(plan);
            for (const e of plan.parsed.errors.slice(0, 10)) {
              allErrors.push({
                ...e,
                field: `${plan.sheetName} · ${plan.fileType} · ${e.field}`,
              });
            }
            for (const w of (plan.parsed.warnings ?? []).slice(0, 10)) {
              allWarnings.push({
                ...w,
                field: `${plan.sheetName} · ${plan.fileType} · ${w.field}`,
              });
            }
          }
        }

        if (plans.length === 0) {
          toast.error('Не удалось автоматически разобрать листы файла. Попробуйте ручной режим.');
          return;
        }

        setSmartBatchPlan(plans);
        setDetectionResult(null);
        setEditableMappings([]);
        setAutoDetectedType(null);

        const first = plans[0];
        setRawRows(first.mappedRows);
        setSourceColumns(Object.keys(first.mappedRows[0] ?? {}));
        setPreview(first.mappedRows.slice(0, 20));
        setErrors(allErrors);
        setWarnings(allWarnings);
        setStep('preview');

        const importedTypes = Array.from(new Set(plans.map((p) => FILE_TYPE_CONFIG[p.fileType].label))).join(', ');
        toast.success(`Умный режим подготовил ${plans.length} лист(ов): ${importedTypes}`);
      } else {
        const rows = await fileToRawRows(selectedFile, selectedSheet || undefined);
        setRawRows(rows);
        setSmartBatchPlan(null);

        if (rows.length === 0) {
          toast.error('Файл пустой');
          return;
        }

        const cols = Object.keys(rows[0]);
        setSourceColumns(cols);

        let detection: DetectionResult;
        const suggestedType = sheetTypeSuggestion ?? suggestFileTypeBySheetName(selectedSheet || '');
        if (suggestedType) {
          detection = mapWithPreset(cols, suggestedType, rows);
          if (!detection || detection.mappings.length === 0) {
            detection = detectAndMap(cols, rows);
          }
        } else {
          const primary = detectAndMap(cols, rows);
          if (primary.confidence >= 0.2 && primary.mappings.length > 0) {
            detection = primary;
          } else {
            const fallback = smartMapColumns(cols);
            detection = {
              fileType: fallback.detectedType,
              confidence: fallback.typeConfidence / 100,
              mappings: fallback.mappings.map((m) => ({
                sourceColumn: m.sourceColumn,
                targetField: m.targetField,
                confidence: m.confidence / 100,
                isUserOverride: false,
              })),
              unmappedSourceColumns: fallback.unmappedSourceColumns,
              unmappedTargetFields: fallback.unmappedTargetFields,
            };
          }
        }

        setDetectionResult(detection);
        setEditableMappings([...detection.mappings]);
        setAutoDetectedType(detection.fileType);
        setStep('mapping');

        const confPct = Math.round(detection.confidence * 100);
        toast.success(`Определено как "${FILE_TYPE_CONFIG[detection.fileType].label}" (${detection.mappings.length} колонок · уверенность ${confPct}%)`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка чтения файла');
    } finally {
      setProcessing(false);
    }
  }, [selectedFile, selectedSheet, availableSheets, sheetTypeSuggestion, fileType]);

  // Auto-analyze immediately after file selection in smart mode.
  useEffect(() => {
    if (!selectedFile) return;
    if (fileType !== 'auto') return;
    if (step !== 'select' || processing || autoAnalyzeAttempted) return;

    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    const isWorkbook = ext === 'xlsx' || ext === 'xls';
    if (isWorkbook && availableSheets.length === 0) return;

    setAutoAnalyzeAttempted(true);
    void handleSmartAnalyze();
  }, [
    selectedFile,
    fileType,
    step,
    processing,
    autoAnalyzeAttempted,
    availableSheets.length,
    handleSmartAnalyze,
  ]);

  const updateMapping = useCallback((sourceColumn: string, newTarget: string) => {
    setEditableMappings((prev) =>
      prev.map((m) =>
        m.sourceColumn === sourceColumn
          ? { ...m, targetField: newTarget, isUserOverride: true }
          : m
      )
    );
  }, []);

  const importRowsForType = useCallback((resolvedFileType: FileType, successRows: Awaited<ReturnType<typeof parseFromRows>>['rows']) => {
    switch (resolvedFileType) {
      case 'transactions':
        addTransactions(companyId, successRows as ParsedTransactionRow[]);
        break;
      case 'customers':
        addCustomers(companyId, (successRows as ParsedCustomerRow[]).map((c) => ({
          ...c,
          customerExternalId: c.customerExternalId,
        })));
        break;
      case 'invoices':
        addInvoices(companyId, successRows as ParsedInvoiceRow[]);
        {
          const invoiceRows = successRows as ParsedInvoiceRow[];
          const existingCustomerIds = new Set(
            getCustomers(companyId)
              .map((c) => c.customerExternalId?.trim())
              .filter((id): id is string => Boolean(id)),
          );
          const customersFromInvoices: ParsedCustomerRow[] = [];
          for (const inv of invoiceRows) {
            const customerId = inv.customerExternalId?.trim();
            if (!customerId || existingCustomerIds.has(customerId)) continue;
            existingCustomerIds.add(customerId);
            customersFromInvoices.push({ customerExternalId: customerId, name: customerId });
          }
          if (customersFromInvoices.length > 0) addCustomers(companyId, customersFromInvoices);
        }
        break;
      case 'marketing_spend':
        ensureChannelsForMarketingSpendRows(companyId, successRows as ParsedMarketingSpendRow[]);
        addMarketingSpend(companyId, successRows as ParsedMarketingSpendRow[]);
        break;
      case 'leads':
        ensureDefaultOrganicChannel(companyId);
        addLeads(companyId, applyDefaultChannelToLeadRows(successRows as ParsedLeadRow[]));
        break;
      case 'deals':
        addDeals(companyId, successRows as ParsedDealRow[]);
        {
          const dealRows = successRows as ParsedDealRow[];
          const existingCustomerIds = new Set(
            getCustomers(companyId)
              .map((c) => c.customerExternalId?.trim())
              .filter((id): id is string => Boolean(id)),
          );
          const existingManagerIds = new Set(
            getManagers(companyId)
              .map((m) => m.managerExternalId?.trim())
              .filter((id): id is string => Boolean(id)),
          );
          const customersFromDeals: ParsedCustomerRow[] = [];
          const managersFromDeals: ParsedManagerRow[] = [];
          for (const d of dealRows) {
            const customerId = d.customerExternalId?.trim();
            const managerId = d.managerExternalId?.trim();
            if (customerId && !existingCustomerIds.has(customerId)) {
              existingCustomerIds.add(customerId);
              customersFromDeals.push({ customerExternalId: customerId, name: customerId });
            }
            if (!managerId || existingManagerIds.has(managerId)) continue;
            existingManagerIds.add(managerId);
            managersFromDeals.push({ managerExternalId: managerId, name: managerId });
          }
          if (customersFromDeals.length > 0) addCustomers(companyId, customersFromDeals);
          if (managersFromDeals.length > 0) addManagers(companyId, managersFromDeals);
        }
        break;
      case 'payments':
        addPayments(companyId, successRows as ParsedPaymentRow[]);
        break;
      case 'channels_campaigns':
        addChannelCampaigns(companyId, successRows as ParsedChannelCampaignRow[]);
        break;
      case 'managers':
        addManagers(companyId, successRows as ParsedManagerRow[]);
        break;
      case 'content_metrics':
        addContentMetrics(companyId, successRows as ParsedContentMetricRow[]);
        break;
    }
  }, [companyId]);

  const handleConfirmMapping = useCallback(async () => {
    if (!detectionResult || !autoDetectedType) return;
    setProcessing(true);
    try {
      const mappedRows = applyColumnMappings(rawRows, editableMappings);
      const rawParsed = parseFromRows(mappedRows, autoDetectedType);
      const parsed =
        autoDetectedType === 'leads' ? enrichLeadsWithDefaultChannel(rawParsed) : rawParsed;

      setParsedResult(parsed);
      setPreview(mappedRows.slice(0, 20));
      setErrors(parsed.errors);
      setWarnings(parsed.warnings ?? []);
      setStep('preview');

      toast.success(`Распознано ${parsed.totalRows} строк, ошибок: ${parsed.errors.length}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка парсинга');
    } finally {
      setProcessing(false);
    }
  }, [detectionResult, autoDetectedType, rawRows, editableMappings]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !companyId) return;
    setProcessing(true);
    try {
      let totalRows = 0;
      let totalSuccess = 0;
      let totalErrors = 0;

      if (smartBatchPlan && smartBatchPlan.length > 0) {
        const orderedPlans = sortSmartBatchPlans(smartBatchPlan);
        for (const plan of orderedPlans) {
          const successRows = plan.parsed.rows;
          importRowsForType(plan.fileType, successRows);
          addUpload(companyId, {
            fileType: plan.fileType,
            originalFileName: `${selectedFile.name} · ${plan.sheetName}`,
            status: 'completed',
            totalRows: plan.parsed.totalRows,
            successRows: successRows.length,
            errorRows: plan.parsed.errors.length,
            errors: plan.parsed.errors,
            warnings: plan.parsed.warnings ?? [],
          });
          totalRows += plan.parsed.totalRows;
          totalSuccess += successRows.length;
          totalErrors += plan.parsed.errors.length;
        }
      } else {
        let parsed: Awaited<ReturnType<typeof parseFromRows>>;
        let resolvedFileType: FileType;

        if (step === 'preview' && parsedResult) {
          parsed = parsedResult;
          resolvedFileType = autoDetectedType ?? fileType as FileType;
        } else {
          resolvedFileType = fileType as FileType;
          if (resolvedFileType === 'auto') {
            toast.error('Используйте умный анализ перед загрузкой.');
            return;
          }
          const directRows = await fileToRawRows(selectedFile, selectedSheet || undefined);
          const directColumns = Object.keys(directRows[0] ?? {});
          const presetDetection = mapWithPreset(directColumns, resolvedFileType, directRows);
          const mappedRows =
            presetDetection.mappings.length > 0
              ? applyColumnMappings(directRows, presetDetection.mappings)
              : directRows;
          parsed = parseFromRows(mappedRows, resolvedFileType);

          if (presetDetection.mappings.length > 0) {
            const mappedPct = Math.round(
              (presetDetection.mappings.length / Math.max(directColumns.length, 1)) * 100,
            );
            toast.success(
              `Автосопоставление колонок: ${presetDetection.mappings.length}/${directColumns.length} (${mappedPct}%)`,
            );
          }
        }

        const successRows = parsed.rows;
        importRowsForType(resolvedFileType, successRows);
        addUpload(companyId, {
          fileType: resolvedFileType,
          originalFileName: selectedFile.name,
          status: 'completed',
          totalRows: parsed.totalRows,
          successRows: successRows.length,
          errorRows: parsed.errors.length,
          errors: parsed.errors,
          warnings: parsed.warnings ?? [],
        });
        totalRows = parsed.totalRows;
        totalSuccess = successRows.length;
        totalErrors = parsed.errors.length;
      }

      setResult({
        success: totalSuccess,
        total: totalRows,
        errors: totalErrors,
      });

      const leadsAfter = getLeads(companyId);
      const dealsAfter = getDeals(companyId);
      const invoicesAfter = getInvoices(companyId);
      const paymentsAfter = getPayments(companyId);
      const channelsAfter = getChannelCampaigns(companyId);
      const spendAfter = getMarketingSpend(companyId);
      const contentAfter = getContentMetrics(companyId);
      const linkage = computeLinkageDiagnostics({
        leads: leadsAfter,
        deals: dealsAfter,
        invoices: invoicesAfter,
        payments: paymentsAfter,
      });
      setPostImportChecklist({
        hasLeads: leadsAfter.length > 0,
        hasDeals: dealsAfter.length > 0,
        hasInvoices: invoicesAfter.length > 0,
        hasPayments: paymentsAfter.length > 0,
        hasChannels: channelsAfter.length > 0,
        hasSpend: spendAfter.length > 0,
        hasContent: contentAfter.length > 0,
        linkageCoveragePercent: linkage.linkageCoveragePercent,
        actions: linkage.actions,
      });

      if (!(smartBatchPlan && smartBatchPlan.length > 0)) {
        // In single-sheet mode keep parse diagnostics; in batch mode keep pre-upload diagnostics.
        setErrors([]);
        setWarnings([]);
      }
      setStep('done');
      setSmartBatchPlan(null);
      toast.success(`Загружено ${totalSuccess} записей из ${totalRows}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setProcessing(false);
    }
  }, [selectedFile, fileType, companyId, step, parsedResult, autoDetectedType, selectedSheet, smartBatchPlan, importRowsForType]);

  const resetForm = () => {
    setSelectedFile(null);
    setPreview(null);
    setErrors([]);
    setResult(null);
    setAutoDetectedType(null);
    setStep('select');
    setEditableMappings([]);
    setRawRows([]);
    setSourceColumns([]);
    setAvailableSheets([]);
    setSelectedSheet('');
    setSheetTypeSuggestion(null);
    setPostImportChecklist(null);
    setSmartBatchPlan(null);
    setAutoAnalyzeAttempted(false);
  };

  // Available target fields for the detected type
  const targetFieldOptions = autoDetectedType
    ? FILE_TYPE_CONFIG[autoDetectedType]?.columns ?? []
    : [];

  const guidedSteps = (() => {
    const leadsCount = getLeads(companyId).length;
    const dealsCount = getDeals(companyId).length;
    const invoicesCount = getInvoices(companyId).length;
    const steps: GuidedStep[] = [
      {
        id: 'consultations',
        title: 'Шаг 1: Консультации → Лиды',
        sheetHint: 'Консультации',
        targetType: 'leads',
        done: leadsCount > 0,
      },
      {
        id: 'sales',
        title: 'Шаг 2: Продажи → Сделки',
        sheetHint: 'ПРОДАЖИ',
        targetType: 'deals',
        done: dealsCount > 0,
      },
      {
        id: 'summary',
        title: 'Шаг 3: Продажи → Счета (опционально)',
        sheetHint: 'ПРОДАЖИ',
        targetType: 'invoices',
        done: invoicesCount > 0,
      },
    ];
    return steps;
  })();

  const completedGuidedSteps = guidedSteps.filter((s) => s.done).length;
  const guidedProgressPercent = Math.round((completedGuidedSteps / guidedSteps.length) * 100);
  const nextGuidedStep = guidedSteps.find((s) => !s.done) ?? null;

  return (
    <AppLayout>
      <div className="chrona-page">
        {/* Header */}
        <div className="chrona-tier-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="rct-page-title">Данные</h1>
              <p className="rct-body-micro mt-1 max-w-2xl">
                Подключите входы — свод в облаке формирует главный экран. Instagram и таблицы — части одной картины, не
                отдельные продукты.
              </p>
            </div>
          </div>
        </div>

        <DemoSourcesStrip />

        <OwnerDemoScenarioCard companyId={companyId} />

        <MvpSupabaseUploadCard companyId={companyId} />

        {allowChronaDemoFallback() ? <DataInstagramPreviewCard /> : null}

        <p className="text-xs text-muted-foreground -mt-2">
          Ниже — пошаговая загрузка листов Excel/CSV, если нужен разбор по типам файлов. В демо-режиме блок по умолчанию
          свёрнут.
        </p>

        <Collapsible defaultOpen={!allowChronaDemoFallback()} className="space-y-3">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-medium shadow-sm hover:bg-muted/40 transition-colors"
            >
              <span>Детальная загрузка таблиц (Excel / CSV)</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3">
        {/* Progress steps */}
        <div className="chrona-surface flex items-center gap-2 text-sm">
          {[
            { key: 'select', label: '1. Файл' },
            { key: 'mapping', label: '2. Маппинг' },
            { key: 'preview', label: '3. Проверка' },
            { key: 'done', label: '4. Готово' },
          ].map((s, idx) => (
            <div key={s.key} className="flex items-center gap-2">
              {idx > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
              <Badge
                variant={step === s.key ? 'default' : 'outline'}
                className={cn(
                  'text-xs',
                  step === s.key && 'bg-primary text-primary-foreground',
                )}
              >
                {s.label}
              </Badge>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main area */}
          <div className="lg:col-span-2 space-y-5">

            {/* Step 1: File selection */}
            {step === 'select' && (
              <Card className="chrona-hero">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Upload className="h-5 w-5 text-primary" />
                    Загрузить файл
                  </CardTitle>
                  <CardDescription>Выберите режим и загрузите файл</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="chrona-muted-surface">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">Ручной режим: порядок листов</p>
                      <Badge variant="outline" className="text-xs">{guidedProgressPercent}%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-medium text-foreground">Умная загрузка</span> уже тянет все листы сразу. Ниже — подсказка только если вы сами выбираете тип файла: Консультации → Продажи → Свод.
                    </p>
                    <div className="mt-3 space-y-2">
                      {guidedSteps.map((stepItem) => (
                        <div key={stepItem.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground">{stepItem.title}</p>
                            <p className="text-[11px] text-muted-foreground">Лист: {stepItem.sheetHint} · Тип: {FILE_TYPE_CONFIG[stepItem.targetType].label}</p>
                          </div>
                          <Badge variant={stepItem.done ? 'default' : 'outline'} className="text-[10px]">
                            {stepItem.done ? 'Готово' : 'Ожидает'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                    {nextGuidedStep && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground mb-2">
                          Следующий шаг: <span className="font-medium text-foreground">{nextGuidedStep.title}</span>
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setFileType(nextGuidedStep.targetType)}
                        >
                          Подготовить режим для шага
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Mode: Auto vs Manual */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setFileType('auto')}
                      className={cn(
                        'p-4 rounded-lg border text-left transition-all',
                        fileType === 'auto'
                          ? 'border-primary/50 bg-primary/10 ring-1 ring-primary/40'
                          : 'border-border hover:border-muted-foreground/30',
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">Умная загрузка</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Авторазбор всех листов и раскладка по разделам</p>
                    </button>
                    <button
                      onClick={() => setFileType(fileType === 'auto' ? 'transactions' : fileType)}
                      className={cn(
                        'p-4 rounded-lg border text-left transition-all',
                        fileType !== 'auto'
                          ? 'border-primary/50 bg-primary/10 ring-1 ring-primary/40'
                          : 'border-border hover:border-muted-foreground/30',
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Settings2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">Ручной выбор</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Укажите тип данных сами</p>
                    </button>
                  </div>

                  {/* Manual type selector */}
                  {fileType !== 'auto' && (
                    <div>
                      <label className="text-sm font-medium text-foreground mb-2 block">Тип данных</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {(Object.keys(FILE_TYPE_CONFIG) as (FileType | 'auto')[]).filter(ft => ft !== 'auto').map(ft => {
                          const config = FILE_TYPE_CONFIG[ft];
                          const isSelected = fileType === ft;
                          return (
                            <button
                              key={ft}
                              onClick={() => setFileType(ft)}
                              className={cn(
                                'p-2.5 rounded-lg border text-left transition-all text-xs',
                                isSelected
                                  ? 'border-primary/50 bg-primary/10 ring-1 ring-primary/40'
                                  : 'border-border hover:border-muted-foreground/30',
                              )}
                            >
                              <p className={cn('font-medium', isSelected ? 'text-primary' : 'text-foreground')}>{config.label}</p>
                              <p className="text-muted-foreground mt-0.5 text-[10px]">{config.description}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* File Input */}
                  <div>
                    <label
                      htmlFor="file-input"
                      className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-muted-foreground/20 rounded-xl cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
                    >
                      {selectedFile ? (
                        <div className="text-center">
                          <FileSpreadsheet className="h-8 w-8 text-primary mx-auto mb-2" />
                          <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <Upload className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">Нажмите для выбора</p>
                          <p className="text-xs text-muted-foreground/60 mt-1">.xlsx, .xls, .csv</p>
                        </div>
                      )}
                      <input
                        id="file-input"
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                    </label>
                  </div>

                  {availableSheets.length > 1 && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Листы Excel</label>
                      {fileType === 'auto' ? (
                        <div className="chrona-muted-surface">
                          <p className="text-xs text-muted-foreground">
                            Умный режим обрабатывает <span className="font-medium text-foreground">все листы по смыслу</span>:
                            Консультации → лиды, ПРОДАЖИ → сделки и счета, <span className="font-medium text-foreground">СВОД / бюджет / итоги</span> → расходы и другие агрегаты (в т.ч. широкая таблица по месяцам → marketing spend для маркетинга и дашборда), без принудительного «всё в маркетинг».
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Листов в файле: <span className="font-medium text-foreground">{availableSheets.length}</span>
                          </p>
                        </div>
                      ) : (
                        <Select
                          value={selectedSheet}
                          onValueChange={(value) => {
                            setSelectedSheet(value);
                            setSheetTypeSuggestion(suggestFileTypeBySheetName(value));
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Выберите лист для импорта" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableSheets.map((sheet) => (
                              <SelectItem key={sheet} value={sheet}>
                                {sheet}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Ручной режим: загрузка из выбранного листа. Умный режим: загрузка со всех листов.
                      </p>
                      {sheetTypeSuggestion && (
                        <div className="chrona-muted-surface">
                          <p className="text-xs text-muted-foreground">
                            Рекомендация для листа: <span className="font-medium text-foreground">{FILE_TYPE_CONFIG[sheetTypeSuggestion].label}</span>
                          </p>
                          {fileType !== 'auto' && fileType !== sheetTypeSuggestion && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-2 text-xs"
                              onClick={() => setFileType(sheetTypeSuggestion)}
                            >
                              Применить рекомендацию
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  {selectedFile && (
                    <div className="flex gap-3">
                      {fileType === 'auto' ? (
                        <Button onClick={handleSmartAnalyze} disabled={processing} className="bg-primary hover:bg-primary/90">
                          <Zap className="h-4 w-4 mr-2" />
                          {processing ? 'Анализ...' : 'Анализировать'}
                        </Button>
                      ) : (
                        <Button onClick={handleUpload} disabled={processing} className="bg-primary hover:bg-primary/90">
                          {processing ? 'Обработка...' : 'Загрузить'}
                        </Button>
                      )}
                    </div>
                  )}

                  {processing && (
                    <div className="space-y-2">
                      <Progress value={66} className="h-2" />
                      <p className="text-xs text-muted-foreground">Обработка файла...</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 2: Mapping Confirmation */}
            {step === 'mapping' && detectionResult && (
              <Card className="chrona-surface">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings2 className="h-5 w-5 text-primary" />
                    Маппинг колонок
                  </CardTitle>
                  <CardDescription>
                    Определено как: <Badge variant="secondary" className="ml-1">{FILE_TYPE_CONFIG[detectionResult.fileType].label}</Badge>
                    {' '}— проверьте соответствие колонок
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Mapping table */}
                  <div className="chrona-table">
                    <table className="text-sm">
                      <thead>
                        <tr>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Колонка в файле</th>
                          <th className="text-center px-2 py-2.5 font-medium text-muted-foreground text-xs w-10">→</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Поле в системе</th>
                          <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Уверенность</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editableMappings.map((m) => (
                          <tr key={m.sourceColumn}>
                            <td className="px-4 py-2.5">
                              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{m.sourceColumn}</span>
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <ArrowRight className="h-3.5 w-3.5 text-primary mx-auto" />
                            </td>
                            <td className="px-4 py-2.5">
                              <Select
                                value={m.targetField}
                                onValueChange={(v) => updateMapping(m.sourceColumn, v)}
                              >
                                <SelectTrigger className="h-8 text-xs w-[200px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {targetFieldOptions.map((f) => (
                                    <SelectItem key={f} value={f} className="text-xs">
                                      {f}
                                    </SelectItem>
                                  ))}
                                  <SelectItem value="_skip" className="text-xs text-muted-foreground">
                                    (пропустить)
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px]',
                                  m.confidence >= 0.9 && 'text-teal-600 dark:text-teal-400 border-teal-300/60',
                                  m.confidence >= 0.6 && m.confidence < 0.9 && 'text-amber-600 dark:text-amber-400 border-amber-300/60',
                                  m.confidence < 0.6 && 'text-rose-600 dark:text-rose-400 border-rose-300/60',
                                )}
                              >
                                {Math.round(m.confidence * 100)}%
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Unmapped columns */}
                  {detectionResult.unmappedSourceColumns.length > 0 && (
                    <div className="chrona-muted-surface">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Не сопоставлены (будут пропущены):</p>
                      <div className="flex flex-wrap gap-1.5">
                        {detectionResult.unmappedSourceColumns.map((c) => (
                          <Badge key={c} variant="outline" className="text-[10px] font-mono">{c}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sample data */}
                  {rawRows.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Первые строки файла:</p>
                      <div className="chrona-table max-h-[200px]">
                        <table className="text-xs">
                          <thead>
                            <tr className="sticky top-0">
                              {sourceColumns.map((col) => (
                                <th key={col} className="text-left px-3 py-1.5 font-medium text-muted-foreground whitespace-nowrap">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rawRows.slice(0, 5).map((row, idx) => (
                              <tr key={idx}>
                                {sourceColumns.map((col) => (
                                  <td key={col} className="px-3 py-1.5 text-muted-foreground truncate max-w-[120px]">
                                    {row[col] === null || row[col] === undefined ? '—' : String(row[col])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setStep('select')}>Назад</Button>
                    <Button onClick={handleConfirmMapping} disabled={processing} className="bg-primary hover:bg-primary/90">
                      {processing ? 'Проверка...' : 'Подтвердить маппинг'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Preview + Upload */}
            {step === 'preview' && (
              <Card className="chrona-surface">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Eye className="h-5 w-5 text-primary" />
                    Предпросмотр и загрузка
                  </CardTitle>
                  <CardDescription>
                    Тип: <Badge variant="secondary" className="ml-1">{FILE_TYPE_CONFIG[autoDetectedType ?? 'auto'].label}</Badge>
                    {' '}· {rawRows.length} строк
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {preview && preview.length > 0 && (
                    <div className="chrona-table max-h-[250px]">
                      <table className="text-xs">
                        <thead>
                          <tr className="sticky top-0">
                            {Object.keys(preview[0]).slice(0, 8).map(key => (
                              <th key={key} className="text-left px-3 py-1.5 font-medium text-muted-foreground whitespace-nowrap">{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.slice(0, 10).map((row, idx) => (
                            <tr key={idx}>
                              {Object.keys(preview[0]).slice(0, 8).map((key) => (
                                <td key={key} className="px-3 py-1.5 text-muted-foreground truncate max-w-[120px]">
                                  {row[key] === null || row[key] === undefined ? '—' : String(row[key])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {errors.length > 0 && (
                    <div className="chrona-muted-surface border-l-[3px] border-l-rose-400/70">
                      <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-2 flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5" />
                        {errors.length} ошибок валидации
                      </p>
                      <div className="space-y-1 max-h-[120px] overflow-y-auto">
                        {errors.slice(0, 10).map((err, idx) => (
                          <p key={idx} className="text-xs text-muted-foreground">
                            Строка {err.row}, <span className="font-mono">{err.field}</span>: {err.message}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {warnings.length > 0 && (
                    <div className="chrona-muted-surface border-l-[3px] border-l-amber-400/70">
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {warnings.length} предупреждений
                      </p>
                      <div className="space-y-1 max-h-[80px] overflow-y-auto">
                        {warnings.slice(0, 5).map((w, idx) => (
                          <p key={idx} className="text-xs text-muted-foreground">
                            Строка {w.row}, <span className="font-mono">{w.field}</span>: {w.message}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setStep(smartBatchPlan && smartBatchPlan.length > 0 ? 'select' : 'mapping')}
                    >
                      Назад к маппингу
                    </Button>
                    <Button onClick={handleUpload} disabled={processing} className="bg-primary hover:bg-primary/90">
                      {processing ? 'Загрузка...' : 'Загрузить данные'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: Result */}
            {step === 'done' && result && (
              <Card className="chrona-surface border-teal-300/40 dark:border-teal-800/30">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <CheckCircle2 className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                    <p className="text-lg font-semibold text-teal-700 dark:text-teal-300">Загрузка завершена</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-5">
                    <div className="chrona-muted-surface">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Всего</div>
                      <div className="text-2xl font-bold text-foreground mt-2">{result.total}</div>
                    </div>
                    <div className="chrona-muted-surface">
                      <div className="text-xs font-medium text-teal-700 dark:text-teal-300 uppercase tracking-wide">Успешно</div>
                      <div className="text-2xl font-bold text-teal-800 dark:text-teal-200 mt-2">{result.success}</div>
                    </div>
                    <div className="chrona-muted-surface">
                      <div className="text-xs font-medium uppercase tracking-wide">Ошибок</div>
                      <div className="text-2xl font-bold mt-2">{result.errors}</div>
                    </div>
                  </div>

                  {postImportChecklist && (
                    <div className="chrona-muted-surface mb-5">
                      <p className="text-sm font-semibold text-foreground mb-3">Чеклист после импорта</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Badge variant="outline">Лиды: {postImportChecklist.hasLeads ? 'есть' : 'нет'}</Badge>
                        <Badge variant="outline">Сделки: {postImportChecklist.hasDeals ? 'есть' : 'нет'}</Badge>
                        <Badge variant="outline">Счета: {postImportChecklist.hasInvoices ? 'есть' : 'нет'}</Badge>
                        <Badge variant="outline">Оплаты: {postImportChecklist.hasPayments ? 'есть' : 'нет'}</Badge>
                        <Badge variant="outline">Источники: {postImportChecklist.hasChannels ? 'есть' : 'нет'}</Badge>
                        <Badge variant="outline">Расходы: {postImportChecklist.hasSpend ? 'есть' : 'нет'}</Badge>
                        <Badge variant="outline">Контент: {postImportChecklist.hasContent ? 'есть' : 'нет'}</Badge>
                        <Badge variant="outline">Связка до денег: {postImportChecklist.linkageCoveragePercent}%</Badge>
                      </div>
                      <div className="mt-3 space-y-1">
                        {postImportChecklist.actions.slice(0, 3).map((action, idx) => (
                          <p key={idx} className="text-xs text-muted-foreground">- {action}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2 mb-5">
                    <Button variant="outline" onClick={() => navigate('/dashboard')} className="flex-1">
                      Главный экран
                    </Button>
                    <Button variant="outline" onClick={() => navigate('/insights')} className="flex-1">
                      Разбор
                    </Button>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={resetForm}>Загрузить ещё</Button>
                    <Button onClick={() => navigate('/dashboard')} className="bg-primary hover:bg-primary/90">
                      Готово
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right sidebar: History */}
          <div className="space-y-6">
            <Card className="chrona-surface">
              <CardHeader>
                <CardTitle className="text-base">История загрузок</CardTitle>
              </CardHeader>
              <CardContent>
                {uploads.length === 0 ? (
                  <div className="text-center py-6">
                    <img src={EMPTY_URL} alt="" className="h-16 w-16 mx-auto mb-3 opacity-70" />
                    <p className="text-sm text-muted-foreground">Нет загрузок</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {uploads
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .slice(0, 10)
                      .map(upload => (
                        <div key={upload.id} className="chrona-muted-surface">
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground/60" />
                              <span className="text-sm font-medium text-foreground truncate max-w-[150px]">
                                {upload.originalFileName}
                              </span>
                            </div>
                            <Badge
                              variant="outline"
                              className={
                                upload.status === 'completed'
                                  ? 'text-teal-600 dark:text-teal-400 border-teal-300/60'
                                  : 'text-red-600 border-red-300'
                              }
                            >
                              {upload.status === 'completed' ? 'OK' : 'Ошибка'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {FILE_TYPE_CONFIG[upload.fileType]?.label} · {upload.successRows}/{upload.totalRows}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(upload.createdAt).toLocaleDateString('ru-KZ')}
                          </p>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick help */}
            <Card className="chrona-surface">
              <CardHeader>
                <CardTitle className="text-base">Как это работает</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-[10px] shrink-0">1</Badge>
                    <p>Загрузите Excel или CSV</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-[10px] shrink-0">2</Badge>
                    <p>Выберите тип данных или доверьтесь подсказке по колонкам</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-[10px] shrink-0">3</Badge>
                    <p>Проверьте и скорректируйте маппинг колонок</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-[10px] shrink-0">4</Badge>
                    <p>Подтвердите загрузку — данные появятся в дашборде</p>
                  </div>
                </div>
                <div className="mt-3 p-2 bg-muted/30 rounded text-[10px] text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Примеры маппинга:</p>
                  <p>"Клиент" → клиент / контрагент</p>
                  <p>"Сумма" → сумма операции или счёта</p>
                  <p>"Источник" → канал маркетинга</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </AppLayout>
  );
}
