// ============================================================
// BizPulse KZ — Upload Center Page
// ============================================================

import { useState, useCallback } from 'react';
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
  FileText, Eye, ArrowRight,
} from 'lucide-react';
import {
  getSession, addTransactions, addCustomers, addInvoices,
  addMarketingSpend, addUpload, getUploads,
} from '@/lib/store';
import { parseFile, parseFileAuto } from '@/lib/parsers';
import type { FileType, ValidationError, ParsedTransactionRow, ParsedCustomerRow, ParsedInvoiceRow, ParsedMarketingSpendRow } from '@/lib/types';

const EMPTY_URL = 'https://mgx-backend-cdn.metadl.com/generate/images/977836/2026-02-19/564e0562-0b93-4cbb-9ae9-7398783510cc.png';

const FILE_TYPE_CONFIG: Record<FileType | 'auto', { label: string; description: string; columns: string[] }> = {
  auto: {
    label: 'Автоопределение',
    description: 'Система сама определит структуру файла',
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
    description: 'Счета для расчёта дебиторки и LTV',
    columns: ['invoiceDate', 'customerExternalId', 'amount', 'status', 'paidDate'],
  },
  marketing_spend: {
    label: 'Маркетинг расходы',
    description: 'Расходы на маркетинг для расчёта CAC',
    columns: ['month', 'amount'],
  },
};

export default function UploadsPage() {
  const navigate = useNavigate();
  const session = getSession();
  const companyId = session?.companyId || '';

  const [fileType, setFileType] = useState<FileType | 'auto'>('auto');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [result, setResult] = useState<{ success: number; total: number; errors: number } | null>(null);
  const [autoDetectedType, setAutoDetectedType] = useState<FileType | null>(null);

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
    setResult(null);
    setAutoDetectedType(null);
  }, []);

  const handlePreview = useCallback(async () => {
    if (!selectedFile) return;
    setProcessing(true);
    try {
      const parsed = fileType === 'auto'
        ? await parseFileAuto(selectedFile)
        : await parseFile(selectedFile, fileType);

      if ('detectedFileType' in parsed) {
        setAutoDetectedType(parsed.detectedFileType);
      }
      setPreview(parsed.preview);
      setErrors(parsed.errors);
      toast.success(`Распознано ${parsed.totalRows} строк, ошибок: ${parsed.errors.length}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка парсинга файла');
    } finally {
      setProcessing(false);
    }
  }, [selectedFile, fileType]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !companyId) return;
    setProcessing(true);
    try {
      const parsed = fileType === 'auto'
        ? await parseFileAuto(selectedFile)
        : await parseFile(selectedFile, fileType);
      const successRows = parsed.rows;
      const resolvedFileType = 'detectedFileType' in parsed ? parsed.detectedFileType : fileType;

      if ('detectedFileType' in parsed) {
        setAutoDetectedType(parsed.detectedFileType);
      }

      // Save to store based on file type
      switch (resolvedFileType) {
        case 'transactions':
          addTransactions(companyId, successRows as ParsedTransactionRow[]);
          break;
        case 'customers':
          addCustomers(companyId, (successRows as ParsedCustomerRow[]).map(c => ({
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
      }

      // Save upload record
      addUpload(companyId, {
        fileType: resolvedFileType,
        originalFileName: selectedFile.name,
        status: 'completed',
        totalRows: parsed.totalRows,
        successRows: successRows.length,
        errorRows: parsed.errors.length,
        errors: parsed.errors,
      });

      setResult({
        success: successRows.length,
        total: parsed.totalRows,
        errors: parsed.errors.length,
      });
      setErrors(parsed.errors);

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
  };

  if (!session) {
    navigate('/');
    return null;
  }

  return (
    <AppLayout>
      <div className="p-4 lg:p-6 space-y-6 max-w-[1200px] mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Центр загрузок</h1>
          <p className="text-sm text-slate-500 mt-1">
            Загружайте Excel/CSV файлы с данными компании
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="h-5 w-5 text-[#1E3A5F]" />
                  Загрузить файл
                </CardTitle>
                <CardDescription>Выберите тип данных и загрузите файл</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* File Type Selection */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Тип данных</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(Object.keys(FILE_TYPE_CONFIG) as (FileType | 'auto')[]).map(ft => {
                      const config = FILE_TYPE_CONFIG[ft];
                      const isSelected = fileType === ft;
                      return (
                        <button
                          key={ft}
                          onClick={() => { setFileType(ft); resetForm(); }}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            isSelected
                              ? 'border-[#1E3A5F] bg-[#1E3A5F]/5 ring-1 ring-[#1E3A5F]'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <p className={`text-sm font-medium ${isSelected ? 'text-[#1E3A5F]' : 'text-slate-700'}`}>
                            {config.label}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{config.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Expected Columns */}
                <div className="bg-slate-50 rounded-lg p-3">
                  {fileType === 'auto' ? (
                    <>
                      <p className="text-xs font-medium text-slate-500 mb-1">Режим автоопределения включен</p>
                      <p className="text-xs text-slate-500">
                        Система определит тип данных и сопоставит колонки автоматически.
                      </p>
                      {autoDetectedType && (
                        <Badge variant="secondary" className="mt-2">
                          Определено как: {FILE_TYPE_CONFIG[autoDetectedType].label}
                        </Badge>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-medium text-slate-500 mb-2">Ожидаемые колонки:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {FILE_TYPE_CONFIG[fileType].columns.map(col => (
                          <Badge key={col} variant="secondary" className="text-xs font-mono">
                            {col}
                          </Badge>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* File Input */}
                <div>
                  <label
                    htmlFor="file-input"
                    className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-[#1E3A5F] hover:bg-[#1E3A5F]/5 transition-all"
                  >
                    {selectedFile ? (
                      <div className="text-center">
                        <FileSpreadsheet className="h-10 w-10 text-[#1E3A5F] mx-auto mb-2" />
                        <p className="text-sm font-medium text-slate-900">{selectedFile.name}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <Upload className="h-10 w-10 text-slate-400 mx-auto mb-2" />
                        <p className="text-sm text-slate-600">Нажмите для выбора файла</p>
                        <p className="text-xs text-slate-400 mt-1">.xlsx, .xls, .csv</p>
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
                {selectedFile && !result && (
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={handlePreview}
                      disabled={processing}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Предпросмотр
                    </Button>
                    <Button
                      onClick={handleUpload}
                      disabled={processing}
                      className="bg-[#1E3A5F] hover:bg-[#1E3A5F]/90"
                    >
                      {processing ? 'Обработка...' : 'Загрузить'}
                    </Button>
                  </div>
                )}

                {/* Processing */}
                {processing && (
                  <div className="space-y-2">
                    <Progress value={66} className="h-2" />
                    <p className="text-xs text-slate-500">Обработка файла...</p>
                  </div>
                )}

                {/* Result */}
                {result && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <p className="text-sm font-semibold text-emerald-800">Загрузка завершена</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-lg font-bold text-slate-900">{result.total}</p>
                        <p className="text-xs text-slate-500">Всего строк</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-emerald-600">{result.success}</p>
                        <p className="text-xs text-slate-500">Успешно</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-red-600">{result.errors}</p>
                        <p className="text-xs text-slate-500">Ошибок</p>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <Button variant="outline" size="sm" onClick={resetForm}>
                        Загрузить ещё
                      </Button>
                      <Button
                        size="sm"
                        className="bg-[#1E3A5F] hover:bg-[#1E3A5F]/90"
                        onClick={() => navigate('/dashboard')}
                      >
                        К дашборду
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Preview Table */}
            {preview && preview.length > 0 && (
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Предпросмотр (первые 20 строк)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          {Object.keys(preview[0]).map(key => (
                            <th key={key} className="text-left px-3 py-2 font-medium text-slate-500">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, idx) => (
                          <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                            {Object.values(row).map((val, vIdx) => (
                              <td key={vIdx} className="px-3 py-2 text-slate-600 truncate max-w-[150px]">
                                {val === null || val === undefined ? '—' : String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Validation Errors */}
            {errors.length > 0 && (
              <Card className="border-red-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base text-red-700 flex items-center gap-2">
                    <XCircle className="h-5 w-5" />
                    Ошибки валидации ({errors.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {errors.slice(0, 50).map((err, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        <span className="text-slate-600">
                          <span className="font-medium">Строка {err.row}</span>, поле{' '}
                          <span className="font-mono text-xs bg-slate-100 px-1 rounded">{err.field}</span>:{' '}
                          {err.message}
                        </span>
                      </div>
                    ))}
                    {errors.length > 50 && (
                      <p className="text-xs text-slate-400 mt-2">
                        ...и ещё {errors.length - 50} ошибок
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Upload History */}
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">История загрузок</CardTitle>
              </CardHeader>
              <CardContent>
                {uploads.length === 0 ? (
                  <div className="text-center py-8">
                    <img src={EMPTY_URL} alt="" className="h-20 w-20 mx-auto mb-3 opacity-70" />
                    <p className="text-sm text-slate-500">Нет загрузок</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {uploads
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .slice(0, 10)
                      .map(upload => (
                        <div key={upload.id} className="border border-slate-100 rounded-lg p-3">
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-slate-400" />
                              <span className="text-sm font-medium text-slate-700 truncate max-w-[150px]">
                                {upload.originalFileName}
                              </span>
                            </div>
                            <Badge
                              variant="outline"
                              className={
                                upload.status === 'completed'
                                  ? 'text-emerald-600 border-emerald-300'
                                  : 'text-red-600 border-red-300'
                              }
                            >
                              {upload.status === 'completed' ? 'OK' : 'Ошибка'}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-400">
                            {FILE_TYPE_CONFIG[upload.fileType]?.label} · {upload.successRows}/{upload.totalRows} строк
                          </p>
                          <p className="text-xs text-slate-400">
                            {new Date(upload.createdAt).toLocaleDateString('ru-KZ')}
                          </p>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Template Info */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">📋 Шаблоны файлов</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-slate-500 space-y-2">
                  <p className="font-medium text-slate-700">transactions.xlsx:</p>
                  <p className="font-mono bg-slate-50 p-2 rounded">
                    date | amount | direction | category | counterparty | description
                  </p>
                  <p className="font-medium text-slate-700 mt-3">customers.xlsx:</p>
                  <p className="font-mono bg-slate-50 p-2 rounded">
                    customerExternalId | name | segment | startDate
                  </p>
                  <p className="font-medium text-slate-700 mt-3">invoices.xlsx:</p>
                  <p className="font-mono bg-slate-50 p-2 rounded">
                    invoiceDate | customerExternalId | amount | status | paidDate
                  </p>
                  <p className="font-medium text-slate-700 mt-3">marketing_spend.xlsx:</p>
                  <p className="font-mono bg-slate-50 p-2 rounded">
                    month | amount
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
