import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import {
  isFullTestPackTable,
  parseFullTestPackTable,
  readSpreadsheetMatrix,
} from '@/lib/chronaFullTestPack';

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
  if (/^block$|блок|тип|section/i.test(h)) return 'ignore';
  if (/^date$|дата|period|месяц|month/i.test(h)) return 'date';
  if (/spend|расход|затрат|ads|реклам/i.test(h)) return 'spend';
  if (/lead|лид/i.test(h)) return 'leads';
  if (/deal|сделк/i.test(h)) return 'deals';
  if (/revenue|выруч|доход|paid|оплат/i.test(h)) return 'revenue';
  if (/inflow|приток|поступлен/i.test(h)) return 'cash_inflow';
  if (/outflow|отток|расход\s*ден|cash\s*out/i.test(h)) return 'cash_outflow';
  return 'ignore';
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

type Props = { companyId: string };

export function MvpSupabaseUploadCard({ companyId }: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [bodyRows, setBodyRows] = useState<unknown[][]>([]);
  const [colMap, setColMap] = useState<Record<number, MvpMetricField>>({});
  const [isBlockTable, setIsBlockTable] = useState(false);

  const blockPreview = useMemo(() => {
    if (!isBlockTable || headers.length === 0 || bodyRows.length === 0) return null;
    try {
      return parseFullTestPackTable(headers, bodyRows);
    } catch {
      return null;
    }
  }, [isBlockTable, headers, bodyRows]);

  const reset = useCallback(() => {
    setFileName('');
    setSheetName('');
    setHeaders([]);
    setBodyRows([]);
    setColMap({});
    setIsBlockTable(false);
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
        const { headers: h, rows, sheetName: sn } = await readSpreadsheetMatrix(file);
        if (h.length === 0) {
          toast.error('Пустой файл');
          return;
        }
        setFileName(file.name);
        setSheetName(sn);
        setHeaders(h);
        setBodyRows(rows);

        if (isFullTestPackTable(h)) {
          setIsBlockTable(true);
          setColMap({});
          toast.success('Таблица с колонкой block — свод, каналы и контент загрузятся вместе');
          return;
        }

        setIsBlockTable(false);
        const initial: Record<number, MvpMetricField> = {};
        h.forEach((header, i) => {
          initial[i] = guessField(header);
        });
        setColMap(initial);
        toast.success('Файл разобран — проверьте соответствие колонок');
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

  const saveBlockTable = useCallback(async () => {
    if (!companyId || !isSupabaseConfigured() || !blockPreview) {
      toast.error('Не удалось разобрать таблицу');
      return;
    }
    setBusy(true);
    try {
      await insertConnectedSource({
        type: 'upload',
        status: 'active',
        meta: { fileName, sheetName, kind: 'block_table' },
      });
      await insertProcessedMetricsRow({
        period_start: blockPreview.periodStart,
        period_end: blockPreview.periodEnd,
        spend: blockPreview.spend,
        leads: blockPreview.leads,
        deals: blockPreview.deals,
        revenue: blockPreview.revenue,
        cash_inflow: blockPreview.cashInflow,
        cash_outflow: blockPreview.cashOutflow,
        net_cash: blockPreview.netCash,
        raw_data: {
          source: 'block_table_upload',
          fileName,
          periodRowCount: blockPreview.periodRowCount,
          marketing: {
            channels: blockPreview.channels,
            content: blockPreview.content,
            updatedAt: new Date().toISOString(),
          },
        },
      });
      toast.success(
        `Сохранено: свод (${blockPreview.periodRowCount} строк), каналов ${blockPreview.channels.length}, контента ${blockPreview.content.length}`,
      );
      reset();
      navigate('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }, [blockPreview, companyId, fileName, navigate, reset, sheetName]);

  const onSaveSimple = useCallback(async () => {
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
          Загрузка таблицы
        </CardTitle>
        <CardDescription>
          CSV или Excel. Простой свод (date, spend, leads…) или таблица с колонкой{' '}
          <span className="font-mono text-xs">block</span> (значения: свод, канал, контент) — тогда главный экран,
          маркетинг и разбор заполняются из одного файла.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" disabled={busy} asChild>
            <label className="cursor-pointer">
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onPickFile} />
              Выбрать файл
            </label>
          </Button>
          {fileName ? <span className="text-sm text-muted-foreground truncate max-w-[240px]">{fileName}</span> : null}
        </div>

        {isBlockTable && blockPreview ? (
          <div className="space-y-3 rounded-lg border border-border/80 bg-card/80 p-4">
            <p className="text-sm font-medium text-foreground">Сводная таблица (block)</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>
                Период: {blockPreview.periodStart} — {blockPreview.periodEnd}
              </li>
              <li>
                Свод: {blockPreview.periodRowCount} строк · {blockPreview.leads} лидов · {blockPreview.deals} сделок
              </li>
              <li>
                Маркетинг: {blockPreview.channels.length} каналов · {blockPreview.content.length} постов
              </li>
            </ul>
            <Button type="button" className="w-full sm:w-auto" disabled={busy} onClick={() => void saveBlockTable()}>
              {busy ? 'Сохранение…' : 'Сохранить и открыть дашборд'}
            </Button>
          </div>
        ) : null}

        {!isBlockTable && headers.length > 0 ? (
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
            <Button type="button" className="w-full sm:w-auto" disabled={busy} onClick={() => void onSaveSimple()}>
              {busy ? 'Сохранение…' : 'Сохранить и открыть дашборд'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
