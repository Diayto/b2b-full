import { useCallback, useState } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { FileSpreadsheet } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { patchLatestMarketingData } from '@/lib/supabaseMetrics';
import {
  detectMarketingCsvKind,
  parseChannelsCsv,
  parseContentCsv,
} from '@/lib/marketingCsvParse';

async function matrixFromFile(file: File): Promise<{ headers: string[]; rows: unknown[][] }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        complete: (res) => {
          const data = res.data as unknown[][];
          const headers = (data[0] ?? []).map((c) => String(c ?? '').trim() || 'column');
          const rows = data.slice(1).filter((r) => Array.isArray(r) && r.some((c) => c !== '' && c != null));
          resolve({ headers, rows });
        },
        error: (e) => reject(e),
      });
    });
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
    const headers = (matrix[0] ?? []).map((c) => String(c ?? '').trim() || 'column');
    const rows = matrix.slice(1).filter((r) => Array.isArray(r) && r.some((c) => c !== '' && c != null));
    return { headers, rows };
  }
  throw new Error('unsupported');
}

type Props = { onSaved: () => void };

export default function MarketingSupplementUpload({ onSaved }: Props) {
  const [busy, setBusy] = useState(false);

  const onPick = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!isSupabaseConfigured()) {
        toast.error('Настройте Supabase');
        return;
      }
      setBusy(true);
      try {
        const { headers, rows } = await matrixFromFile(file);
        const kind = detectMarketingCsvKind(headers);
        if (kind === 'channels') {
          const channels = parseChannelsCsv(headers, rows);
          if (channels.length === 0) throw new Error('Не найдены строки каналов');
          await patchLatestMarketingData({ channels });
          toast.success(`Каналы: ${channels.length} строк`);
        } else if (kind === 'content') {
          const content = parseContentCsv(headers, rows);
          if (content.length === 0) throw new Error('Не найдены строки контента');
          await patchLatestMarketingData({ content });
          toast.success(`Контент: ${content.length} постов`);
        } else {
          toast.error('Не распознан формат. Нужны колонки канал+расход или пост+охват/лиды.');
          return;
        }
        onSaved();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Ошибка загрузки');
      } finally {
        setBusy(false);
      }
    },
    [onSaved],
  );

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          Разбивка для маркетинга
        </CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          CSV/Excel с каналами (источник, расход, лиды) или с постами (id, охват, лиды). Прикрепляется к текущему
          периоду из «Данные».
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3 pt-0">
        <Button type="button" variant="outline" size="sm" disabled={busy} asChild>
          <label className="cursor-pointer">
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(ev) => void onPick(ev)} />
            {busy ? 'Загрузка…' : 'Загрузить файл'}
          </label>
        </Button>
        <a
          href="/marketing-channels-template.csv"
          download
          className="text-xs text-primary hover:underline"
        >
          Шаблон каналов
        </a>
        <a href="/marketing-content-template.csv" download className="text-xs text-primary hover:underline">
          Шаблон контента
        </a>
      </CardContent>
    </Card>
  );
}
