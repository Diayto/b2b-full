// ============================================================
// BizPulse KZ — Smart Upload Center
// Auto-detect, auto-map, mapping confirmation UI
// ============================================================

import { useState, useCallback, useMemo } from 'react';
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
  FileText, Eye, ArrowRight, ArrowDown, Zap, Settings2,
} from 'lucide-react';
import {
  getSession,
  addTransactions,
  addCustomers,
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
} from '@/lib/store';
import { parseFile, parseFromRows } from '@/lib/parsers';
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
async function fileToRawRows(file: File): Promise<Record<string, unknown>[]> {
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
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }

  throw new Error(`Неподдерживаемый формат: .${ext}`);
}

type UploadStep = 'select' | 'mapping' | 'preview' | 'done';

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

  const uploads = getUploads(companyId);

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
  }, []);

  // Smart analyze: detectAndMap primary, smartMapColumns fallback
  const handleSmartAnalyze = useCallback(async () => {
    if (!selectedFile) return;
    setProcessing(true);
    try {
      const rows = await fileToRawRows(selectedFile);
      setRawRows(rows);

      if (rows.length === 0) {
        toast.error('Файл пустой');
        setProcessing(false);
        return;
      }

      const cols = Object.keys(rows[0]);
      setSourceColumns(cols);

      let detection: DetectionResult;
      const primary = detectAndMap(cols);
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

      setDetectionResult(detection);
      setEditableMappings([...detection.mappings]);
      setAutoDetectedType(detection.fileType);
      setStep('mapping');

      const confPct = Math.round(detection.confidence * 100);
      toast.success(`Определено как "${FILE_TYPE_CONFIG[detection.fileType].label}" (${detection.mappings.length} колонок · уверенность ${confPct}%)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка чтения файла');
    } finally {
      setProcessing(false);
    }
  }, [selectedFile]);

  const updateMapping = useCallback((sourceColumn: string, newTarget: string) => {
    setEditableMappings((prev) =>
      prev.map((m) =>
        m.sourceColumn === sourceColumn
          ? { ...m, targetField: newTarget, isUserOverride: true }
          : m
      )
    );
  }, []);

  const handleConfirmMapping = useCallback(async () => {
    if (!detectionResult || !autoDetectedType) return;
    setProcessing(true);
    try {
      const mappedRows = applyColumnMappings(rawRows, editableMappings);
      const parsed = parseFromRows(mappedRows, autoDetectedType);

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
      let parsed: Awaited<ReturnType<typeof parseFromRows>>;
      let resolvedFileType: FileType;

      if (step === 'preview' && parsedResult) {
        parsed = parsedResult;
        resolvedFileType = autoDetectedType ?? fileType as FileType;
      } else {
        resolvedFileType = fileType as FileType;
        if (resolvedFileType === 'auto') {
          toast.error('Укажите тип данных вручную или используйте «Анализировать» для автоопределения');
          setProcessing(false);
          return;
        }
        const fileParsed = await parseFile(selectedFile, resolvedFileType);
        parsed = fileParsed;
      }

      const successRows = parsed.rows;

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
          break;
        case 'marketing_spend':
          addMarketingSpend(companyId, successRows as ParsedMarketingSpendRow[]);
          break;
        case 'leads':
          addLeads(companyId, successRows as ParsedLeadRow[]);
          break;
        case 'deals':
          addDeals(companyId, successRows as ParsedDealRow[]);
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

      setResult({
        success: successRows.length,
        total: parsed.totalRows,
        errors: parsed.errors.length,
      });
      setErrors(parsed.errors);
      setWarnings(parsed.warnings ?? []);
      setStep('done');

      toast.success(`Загружено ${successRows.length} записей из ${parsed.totalRows}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setProcessing(false);
    }
  }, [selectedFile, fileType, companyId]);

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
  };

  if (!session) {
    navigate('/');
    return null;
  }

  // Available target fields for the detected type
  const targetFieldOptions = useMemo(() => {
    if (!autoDetectedType) return [];
    return FILE_TYPE_CONFIG[autoDetectedType]?.columns ?? [];
  }, [autoDetectedType]);

  return (
    <AppLayout>
      <div className="rct-page p-4 lg:p-6 space-y-8 max-w-[1400px] mx-auto">
        {/* Header */}
        <div>
          <h1 className="rct-page-title">Центр загрузок</h1>
          <p className="rct-body-micro mt-1">
            Загрузите любую таблицу — система сама определит тип данных и сопоставит колонки
          </p>
        </div>

        {/* Progress steps */}
        <div className="flex items-center gap-2 text-sm">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main area */}
          <div className="lg:col-span-2 space-y-6">

            {/* Step 1: File selection */}
            {step === 'select' && (
              <Card className="rct-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Upload className="h-5 w-5 text-primary" />
                    Загрузить файл
                  </CardTitle>
                  <CardDescription>Выберите режим и загрузите файл</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Mode: Auto vs Manual */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setFileType('auto')}
                      className={cn(
                        'p-4 rounded-lg border text-left transition-all',
                        fileType === 'auto'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:border-muted-foreground/30',
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">Умная загрузка</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Автоопределение типа и маппинг колонок</p>
                    </button>
                    <button
                      onClick={() => setFileType(fileType === 'auto' ? 'transactions' : fileType)}
                      className={cn(
                        'p-4 rounded-lg border text-left transition-all',
                        fileType !== 'auto'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
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
                                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
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
              <Card className="rct-card">
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
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/30 border-b">
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Колонка в файле</th>
                          <th className="text-center px-2 py-2.5 font-medium text-muted-foreground text-xs w-10">→</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Поле в системе</th>
                          <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Уверенность</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editableMappings.map((m) => (
                          <tr key={m.sourceColumn} className="border-b border-border/30 hover:bg-muted/10">
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
                    <div className="rct-card-inset p-3">
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
                      <div className="overflow-x-auto max-h-[200px] border rounded-lg">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-muted/30 sticky top-0">
                              {sourceColumns.map((col) => (
                                <th key={col} className="text-left px-3 py-1.5 font-medium text-muted-foreground whitespace-nowrap">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rawRows.slice(0, 5).map((row, idx) => (
                              <tr key={idx} className="border-b border-border/20">
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
              <Card className="rct-card">
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
                    <div className="overflow-x-auto max-h-[250px] border rounded-lg">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/30 sticky top-0">
                            {Object.keys(preview[0]).slice(0, 8).map(key => (
                              <th key={key} className="text-left px-3 py-1.5 font-medium text-muted-foreground whitespace-nowrap">{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.slice(0, 10).map((row, idx) => (
                            <tr key={idx} className="border-b border-border/20">
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
                    <div className="rct-card-inset p-3 border-l-[3px] border-l-rose-400/70">
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
                    <div className="rct-card-inset p-3 border-l-[3px] border-l-amber-400/70">
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
                    <Button variant="outline" onClick={() => setStep('mapping')}>Назад к маппингу</Button>
                    <Button onClick={handleUpload} disabled={processing} className="bg-primary hover:bg-primary/90">
                      {processing ? 'Загрузка...' : 'Загрузить данные'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: Result */}
            {step === 'done' && result && (
              <Card className="rct-card border-teal-200/50 dark:border-teal-800/30">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <CheckCircle2 className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                    <p className="text-lg font-semibold text-teal-700 dark:text-teal-300">Загрузка завершена</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-5">
                    <div className="rct-stat-box-slate">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Всего</div>
                      <div className="text-2xl font-bold text-foreground mt-2">{result.total}</div>
                    </div>
                    <div className="rct-stat-box-emerald">
                      <div className="text-xs font-medium text-teal-700 dark:text-teal-300 uppercase tracking-wide">Успешно</div>
                      <div className="text-2xl font-bold text-teal-800 dark:text-teal-200 mt-2">{result.success}</div>
                    </div>
                    <div className={result.errors > 0 ? 'rct-stat-box-amber' : 'rct-stat-box-slate'}>
                      <div className="text-xs font-medium uppercase tracking-wide">Ошибок</div>
                      <div className="text-2xl font-bold mt-2">{result.errors}</div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={resetForm}>Загрузить ещё</Button>
                    <Button onClick={() => navigate('/dashboard')} className="bg-primary hover:bg-primary/90">
                      К дашборду
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right sidebar: History */}
          <div className="space-y-6">
            <Card className="rct-card">
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
                        <div key={upload.id} className="border border-border/50 rounded-lg p-3">
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
            <Card className="rct-card">
              <CardHeader>
                <CardTitle className="text-base">Как это работает</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-[10px] shrink-0">1</Badge>
                    <p>Загрузите любой Excel/CSV файл</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-[10px] shrink-0">2</Badge>
                    <p>Система автоматически определит тип данных</p>
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
                  <p>"Client Name" → customer_name</p>
                  <p>"Amount" → revenue</p>
                  <p>"Source" → marketing_channel</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
