import { useEffect, useState } from 'react';
import { Instagram } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getContentMetricsReadMode } from '@/lib/content-metrics-api';
import {
  fetchInstagramSourcesFromApi,
  getInstagramOAuthStartUrl,
  triggerInstagramLivePullFromApi,
  InstagramConnectorApiError,
  type InstagramSource,
} from '@/lib/instagram-connectors-api';
import { persistInstagramPipelineMetrics } from '@/lib/ingestBackendSummaries';

function toUserMessage(err: unknown): string {
  if (err instanceof InstagramConnectorApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Не удалось выполнить запрос';
}

type Props = { companyId: string };

export default function InstagramQuickConnectPopover({ companyId }: Props) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<InstagramSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState('');

  const apiMode = getContentMetricsReadMode() === 'api';

  useEffect(() => {
    if (!open || !companyId || !apiMode) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchInstagramSourcesFromApi(companyId, ac.signal)
      .then((list) => {
        setSources(list);
        setSelectedSourceId((prev) => {
          if (prev && list.some((s) => s.id === prev)) return prev;
          return list[0]?.id ?? '';
        });
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setError(toUserMessage(e));
        setSources([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [open, companyId, apiMode]);

  const handleConnect = () => {
    if (!companyId || !apiMode) return;
    window.location.assign(getInstagramOAuthStartUrl(companyId));
  };

  const handleLivePull = async () => {
    if (!companyId || !apiMode || !selectedSourceId || syncBusy) return;
    setSyncBusy(true);
    try {
      await triggerInstagramLivePullFromApi(selectedSourceId, companyId, { limit: 25 });
      toast.success('Контент подтянут');
      try {
        await persistInstagramPipelineMetrics(companyId);
      } catch {
        // не блокируем UX
      }
      setOpen(false);
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="default">
          Подключение и синхронизация
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Instagram className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            Instagram
          </div>
          {!companyId ? (
            <p className="text-xs text-muted-foreground">Войдите в аккаунт, чтобы подключить источник.</p>
          ) : !apiMode ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Включите режим API:{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">VITE_CONTENT_METRICS_READ_MODE=api</code> или{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">localStorage bp_content_metrics_read_mode=api</code>
              , затем обновите страницу.
            </p>
          ) : (
            <>
              <Button type="button" className="w-full" size="sm" onClick={handleConnect}>
                Подключить через Meta
              </Button>
              {loading ? (
                <p className="text-xs text-muted-foreground">Загрузка источников…</p>
              ) : error ? (
                <p className="text-xs text-destructive">{error}</p>
              ) : sources.length === 0 ? (
                <p className="text-xs text-muted-foreground">После OAuth аккаунт появится здесь.</p>
              ) : (
                <div className="space-y-2">
                  {sources.length > 1 ? (
                    <Select value={selectedSourceId} onValueChange={setSelectedSourceId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Источник" />
                      </SelectTrigger>
                      <SelectContent>
                        {sources.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.accountUsername ? `@${s.accountUsername}` : s.sourceLabel || s.id.slice(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="truncate text-xs text-muted-foreground">
                      {sources[0]?.accountUsername
                        ? `@${sources[0].accountUsername}`
                        : sources[0]?.sourceLabel || 'Источник подключён'}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    size="sm"
                    disabled={!selectedSourceId || syncBusy}
                    onClick={() => void handleLivePull()}
                  >
                    {syncBusy ? 'Синхронизация…' : 'Подтянуть посты'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
