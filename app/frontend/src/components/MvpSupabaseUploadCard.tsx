import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { CloudUpload } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import {
  insertConnectedSource,
  insertProcessedMetricsRow,
  maxYmd,
  minYmd,
  ymdDaysAgo,
  ymdToday,
} from '@/lib/supabaseMetrics';

export type MvpMetricField =
  | 'ignore'
  | 'date'
  | 'spend'
  | 'leads'
  | 'deals'
  | 'revenue'
  | 'cash_inflow'
  | 'cash_outflow';

const FIELD_OPTIONS: { value: MvpMetricField; label: string }[] = [
  { value: 'ignore', label: '— не использовать' },
  { value: 'date', label: 'Дата периода' },
  { value: 'spend', label: 'Расходы (spend)' },
  { value: 'leads', label: 'Лиды' },
  { value: 'deals', label: 'Сделки' },
  { value: 'revenue', label: 'Выручка' },
  { value: 'cash_inflow', label: 'Приток денег' },
  { value: 'cash_outflow', label: 'Отток денег' },
];

function guessField(header: string): MvpMetricField {
  const h = header.toLowerCase();
  if (/^date$|дата|period|месяц|month/i.test(h)) return 'date';
  if (/spend|расход|затрат|ads|реклам|бюджет|себестоим/i.test(h)) return 'spend';
  if (/lead|лид|консультац|заявк|обращен/i.test(h)) return 'leads';
  if (/deal|сделк|продаж|договор/i.test(h)) return 'deals';
  if (/revenue|выруч|доход|общая\s*стоим|fact|факт|оплат/i.test(h)) return 'revenue';
  if (/inflow|приток|поступлен|доплат/i.test(h)) return 'cash_inflow';
  if (/outflow|отток|расход\s*ден|cash\s*out|выплат|возврат/i.test(h)) return 'cash_outflow';
  return 'ignore';
}

function headerScore(header: string, field: MvpMetricField): number {
  const h = header.toLowerCase();
  if (field === 'ignore') return 0;
  if (field === 'date' && /^date$|дата|period|месяц|month/i.test(h)) return 1;
  if (field === 'spend' && /spend|расход|затрат|ads|реклам|бюджет|себестоим/i.test(h)) return 1;
  if (field === 'leads' && /lead|лид|консультац|заявк|обращен/i.test(h)) return 1;
  if (field === 'deals' && /deal|сделк|продаж|договор/i.test(h)) return 1;
  if (field === 'revenue' && /revenue|выруч|доход|общая\s*стоим|fact|факт/i.test(h)) return 1;
  if (field === 'cash_inflow' && /inflow|приток|поступлен|доплат/i.test(h)) return 1;
  if (field === 'cash_outflow' && /outflow|отток|расход\s*ден|cash\s*out|выплат|возврат/i.test(h)) return 1;
  return 0;
}

function valueScore(values: unknown[], field: MvpMetricField): number {
  if (field === 'ignore') return 0;
  const sample = values
    .slice(0, 80)
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter((v) => v.length > 0);
  if (sample.length === 0) return 0;

  const dateRatio =
    sample.filter((v) => toYmdCell(v) !== null).length / sample.length;
  const numericRatio =
    sample.filter((v) => {
      const n = toNumberCell(v);
      return Number.isFinite(n) && String(v).trim() !== '';
    }).length / sample.length;
  const integerRatio =
    sample.filter((v) => {
      const n = toNumberCell(v);
      return Number.isFinite(n) && Number.isInteger(n);
    }).length / sample.length;

  if (field === 'date') return dateRatio;
  if (field === 'leads' || field === 'deals') return integerRatio;
  if (field === 'spend' || field === 'revenue' || field === 'cash_inflow' || field === 'cash_outflow') {
    return numericRatio;
  }
  return 0;
}

function canAutoAssignByConfidence(
  field: MvpMetricField,
  headerConf: number,
  valueConf: number,
  blended: number,
  allowValueOnly: boolean,
): boolean {
  if (field === 'date') return allowValueOnly ? valueConf >= 0.8 : blended >= 0.55;
  // Financial fields are auto-mapped only when header meaning is explicit.
  if (field === 'spend' || field === 'revenue' || field === 'cash_inflow' || field === 'cash_outflow') {
    if (allowValueOnly) return valueConf >= 0.9;
    return headerConf >= 0.9 && blended >= 0.55;
  }
  if (field === 'leads' || field === 'deals') {
    if (allowValueOnly) return valueConf >= 0.9;
    return (headerConf >= 0.9 && blended >= 0.5) || (headerConf >= 0.5 && valueConf >= 0.9);
  }
  return false;
}

function isGenericHeader(header: string): boolean {
  const h = String(header ?? '').trim().toLowerCase();
  return !h || /^column(_?\d+)?$/.test(h) || /^col(_?\d+)?$/.test(h) || /^столбец(_?\d+)?$/.test(h);
}

function autoMapColumns(headers: string[], rows: unknown[][]): Record<number, MvpMetricField> {
  const numericFields: MvpMetricField[] = [
    'spend',
    'leads',
    'deals',
    'revenue',
    'cash_inflow',
    'cash_outflow',
  ];
  const candidateFields: MvpMetricField[] = ['date', ...numericFields];

  const colValues = headers.map((_, colIdx) => rows.map((r) => r[colIdx]));
  const genericHeadersCount = headers.filter(isGenericHeader).length;
  const allowValueOnly = headers.length > 0 && genericHeadersCount / headers.length >= 0.6;
  const pairs: Array<{ colIdx: number; field: MvpMetricField; score: number }> = [];

  for (let colIdx = 0; colIdx < headers.length; colIdx++) {
    const header = headers[colIdx] ?? '';
    for (const field of candidateFields) {
      const hScore = headerScore(header, field);
      const vScore = valueScore(colValues[colIdx], field);
      const score = hScore * 0.7 + vScore * 0.3;
      if (canAutoAssignByConfidence(field, hScore, vScore, score, allowValueOnly)) {
        pairs.push({ colIdx, field, score });
      }
    }
  }

  pairs.sort((a, b) => b.score - a.score);
  const mappedCols = new Set<number>();
  const mappedFields = new Set<MvpMetricField>();
  const result: Record<number, MvpMetricField> = {};
  const canRepeatField = (field: MvpMetricField) => field !== 'date';

  for (const pair of pairs) {
    if (mappedCols.has(pair.colIdx)) continue;
    if (!canRepeatField(pair.field) && mappedFields.has(pair.field)) continue;
    result[pair.colIdx] = pair.field;
    mappedCols.add(pair.colIdx);
    if (!canRepeatField(pair.field)) mappedFields.add(pair.field);
  }

  // Fallback for still-unmapped columns:
  // map only when confidence is strong enough; otherwise keep "ignore".
  for (let i = 0; i < headers.length; i++) {
    if (result[i]) continue;
    const header = headers[i] ?? '';
    const values = colValues[i] ?? [];
    let bestField: MvpMetricField = 'ignore';
    let bestScore = 0;
    let bestHeaderScore = 0;
    let bestValueScore = 0;
    for (const field of candidateFields) {
      if (!canRepeatField(field) && mappedFields.has(field)) continue;
      const hScore = headerScore(header, field);
      const vScore = valueScore(values, field);
      const score = hScore * 0.7 + vScore * 0.3;
      if (score > bestScore) {
        bestScore = score;
        bestField = field;
        bestHeaderScore = hScore;
        bestValueScore = vScore;
      }
    }
    if (canAutoAssignByConfidence(bestField, bestHeaderScore, bestValueScore, bestScore, allowValueOnly)) {
      result[i] = bestField;
      if (!canRepeatField(bestField)) mappedFields.add(bestField);
      continue;
    }
    const g = guessField(header);
    if (g !== 'ignore' && (canRepeatField(g) || !mappedFields.has(g))) {
      result[i] = g;
      if (!canRepeatField(g)) mappedFields.add(g);
      continue;
    }
    result[i] = 'ignore';
  }

  // If most headers are generic and mapping is too sparse,
  // use value-only heuristic in default KPI order so user gets usable prefill.
  const mappedNonIgnore = Object.values(result).filter((v) => v !== 'ignore').length;
  if (allowValueOnly && mappedNonIgnore <= 1) {
    const fallback: Record<number, MvpMetricField> = { ...result };
    const availableCols = headers.map((_, i) => i);
    const usedCols = new Set<number>();

    const dateCandidates = availableCols
      .map((i) => ({ i, s: valueScore(colValues[i] ?? [], 'date') }))
      .filter((x) => x.s >= 0.8)
      .sort((a, b) => b.s - a.s);
    if (dateCandidates.length > 0) {
      fallback[dateCandidates[0].i] = 'date';
      usedCols.add(dateCandidates[0].i);
    }

    const numericCols = availableCols
      .filter((i) => !usedCols.has(i))
      .map((i) => ({ i, s: valueScore(colValues[i] ?? [], 'spend') }))
      .filter((x) => x.s >= 0.9)
      .sort((a, b) => b.s - a.s);

    const kpiOrder: MvpMetricField[] = [
      'spend',
      'leads',
      'deals',
      'revenue',
      'cash_inflow',
      'cash_outflow',
    ];
    for (let idx = 0; idx < Math.min(kpiOrder.length, numericCols.length); idx++) {
      fallback[numericCols[idx].i] = kpiOrder[idx];
    }

    return fallback;
  }

  return result;
}

function toNumberCell(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).replace(/\s/g, '').replace(/,/g, '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toYmdCell(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + v * 86400000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function buildHeadersAndRows(matrix: unknown[][]): { headers: string[]; rows: unknown[][] } {
  if (!matrix.length) return { headers: [], rows: [] };

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

  const rawHeaders = matrix[bestHeaderIndex] ?? [];
  const headers = rawHeaders.map((c, idx) => {
    const text = String(c ?? '').trim();
    return text || `column_${idx + 1}`;
  });
  const rows = matrix
    .slice(bestHeaderIndex + 1)
    .filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''));

  return { headers, rows };
}

function matrixFromFile(file: File): Promise<{ headers: string[]; rows: unknown[][] }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return new Promise((resolve, reject) => {
    if (ext === 'csv') {
      Papa.parse(file, {
        complete: (res) => {
          const data = res.data as unknown[][];
          resolve(buildHeadersAndRows(data));
        },
        error: (e) => reject(e),
      });
      return;
    }
    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const wb = XLSX.read(reader.result, { type: 'array', cellDates: true });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
          resolve(buildHeadersAndRows(matrix));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsArrayBuffer(file);
      return;
    }
    reject(new Error('unsupported'));
  });
}

type Props = { companyId: string };

export function MvpSupabaseUploadCard({ companyId }: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [bodyRows, setBodyRows] = useState<unknown[][]>([]);
  const [colMap, setColMap] = useState<Record<number, MvpMetricField>>({});

  const reset = useCallback(() => {
    setFileName('');
    setHeaders([]);
    setBodyRows([]);
    setColMap({});
  }, []);

  const onPickFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!isSupabaseConfigured()) {
        toast.error('Настройте Supabase (VITE_SUPABASE_*)');
        return;
      }
      setBusy(true);
      try {
        const { headers: h, rows } = await matrixFromFile(file);
        if (h.length === 0) {
          toast.error('Пустой файл');
          return;
        }
        setFileName(file.name);
        setHeaders(h);
        setBodyRows(rows);
        const initial = autoMapColumns(h, rows);
        setColMap(initial);
        const mappedCount = Object.values(initial).filter((v) => v !== 'ignore').length;
        toast.success(`Файл разобран — автосопоставлено ${mappedCount}/${h.length} колонок`);
      } catch {
        toast.error('Не удалось прочитать файл');
        reset();
      } finally {
        setBusy(false);
        e.target.value = '';
      }
    },
    [reset],
  );

  const onSave = useCallback(async () => {
    if (!companyId || !isSupabaseConfigured()) {
      toast.error('Нет компании или Supabase');
      return;
    }
    const used = new Set(Object.values(colMap));
    const needsNumeric =
      used.has('spend') ||
      used.has('leads') ||
      used.has('deals') ||
      used.has('revenue') ||
      used.has('cash_inflow') ||
      used.has('cash_outflow');
    if (!needsNumeric) {
      toast.error('Укажите хотя бы одну числовую колонку (кроме даты)');
      return;
    }

    let sumSpend = 0;
    let sumLeads = 0;
    let sumDeals = 0;
    let sumRevenue = 0;
    let sumIn = 0;
    let sumOut = 0;
    const dates: string[] = [];

    for (const row of bodyRows) {
      headers.forEach((_, colIdx) => {
        const field = colMap[colIdx] ?? 'ignore';
        const cell = row[colIdx];
        if (field === 'date') {
          const y = toYmdCell(cell);
          if (y) dates.push(y);
          return;
        }
        if (field === 'ignore') return;
        const n = toNumberCell(cell);
        if (field === 'spend') sumSpend += n;
        if (field === 'leads') sumLeads += n;
        if (field === 'deals') sumDeals += n;
        if (field === 'revenue') sumRevenue += n;
        if (field === 'cash_inflow') sumIn += n;
        if (field === 'cash_outflow') sumOut += n;
      });
    }

    const periodStart = minYmd(dates) ?? ymdDaysAgo(30);
    const periodEnd = maxYmd(dates) ?? ymdToday();
    const netCash = sumIn - sumOut;

    setBusy(true);
    try {
      await insertConnectedSource({
        type: 'upload',
        status: 'active',
        meta: { fileName, columnMap: colMap, headers },
      });
      await insertProcessedMetricsRow({
        period_start: periodStart,
        period_end: periodEnd,
        spend: sumSpend,
        leads: sumLeads,
        deals: sumDeals,
        revenue: sumRevenue,
        cash_inflow: sumIn,
        cash_outflow: sumOut,
        net_cash: netCash,
        raw_data: {
          source: 'csv_xlsx_upload',
          fileName,
          rowCount: bodyRows.length,
        },
      });
      toast.success('Метрики сохранены');
      reset();
      navigate('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }, [bodyRows, colMap, companyId, fileName, headers, navigate, reset]);

  return (
    <Card className="border-primary/25 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <CloudUpload className="h-5 w-5 text-primary" />
          Свод для главного экрана
        </CardTitle>
        <CardDescription>
          Загрузите таблицу и сопоставьте колонки: расходы, лиды, сделки, выручка, приток и отток денег. Сохраняется в
          облако — главный экран строится из этой строки периода.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" disabled={busy} asChild>
            <label className="cursor-pointer">
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onPickFile} />
              Выбрать CSV / Excel
            </label>
          </Button>
          {fileName ? <span className="text-sm text-muted-foreground truncate max-w-[200px]">{fileName}</span> : null}
        </div>

        {headers.length > 0 && (
          <div className="space-y-3 rounded-lg border border-border/80 bg-card/80 p-4">
            <p className="text-sm font-medium text-foreground">Сопоставление колонок</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {headers.map((h, idx) => (
                <div key={`${h}-${idx}`} className="space-y-1">
                  <Label className="text-xs text-muted-foreground truncate block">{h || `Колонка ${idx + 1}`}</Label>
                  <Select
                    value={colMap[idx] ?? 'ignore'}
                    onValueChange={(v) => setColMap((prev) => ({ ...prev, [idx]: v as MvpMetricField }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <Button type="button" className="w-full sm:w-auto" disabled={busy} onClick={() => void onSave()}>
              {busy ? 'Сохранение…' : 'Сохранить и открыть дашборд'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
