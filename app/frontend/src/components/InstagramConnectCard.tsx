import { useCallback, useEffect, useState } from 'react';
import { Instagram, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAPIBaseURL, isBackendApiConfigured } from '@/lib/config';
import { formatIgOAuthReason } from '@/lib/instagram-oauth-messages';
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

type Props = {
  companyId: string;
  oauthFeedback?: { type: 'success' | 'error'; message: string } | null;
  onSynced?: () => void;
};

export default function InstagramConnectCard({ companyId, oauthFeedback, onSynced }: Props) {
  const apiAvailable = isBackendApiConfigured();
  const [sources, setSources] = useState<InstagramSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadSources = useCallback(() => {
    if (!companyId || !apiAvailable) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchInstagramSourcesFromApi(companyId, ac.signal)
      .then(setSources)
      .catch((e) => {
        if (!ac.signal.aborted) setError(toUserMessage(e));
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [companyId, apiAvailable]);

  useEffect(() => reloadSources(), [reloadSources]);

  useEffect(() => {
    if (oauthFeedback?.type === 'success') reloadSources();
  }, [oauthFeedback, reloadSources]);

  const connected = sources.length > 0;
  const primary = sources[0];

  const handleConnect = () => {
    if (!companyId || !apiAvailable) return;
    window.location.assign(getInstagramOAuthStartUrl(companyId));
  };

  const handleSync = async () => {
    const sourceId = primary?.id;
    if (!companyId || !apiAvailable || !sourceId || syncBusy) return;
    setSyncBusy(true);
    try {
      await triggerInstagramLivePullFromApi(sourceId, companyId, { limit: 25 });
      await persistInstagramPipelineMetrics(companyId);
      toast.success('Instagram обновлён — метрики на главном экране');
      onSynced?.();
      reloadSources();
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <Card className="chrona-surface border-border/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Instagram className="h-5 w-5 text-primary shrink-0" aria-hidden />
          Instagram
        </CardTitle>
        <CardDescription className="text-sm">
          Подключите бизнес-аккаунт и подтяните контент в тот же снимок периода, что и таблица.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {oauthFeedback ? (
          <p
            className={
              oauthFeedback.type === 'success'
                ? 'text-xs text-emerald-700 dark:text-emerald-400'
                : 'text-xs text-destructive'
            }
          >
            {oauthFeedback.message}
          </p>
        ) : null}

        {!apiAvailable ? (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              На Vercel задайте <span className="font-mono">VITE_API_BASE_URL</span> — HTTPS-адрес вашего Node-бэкенда с
              Meta (OAuth), затем Redeploy.
            </p>
            <p>
              Локально: запустите <span className="font-mono">npm run dev</span> в <span className="font-mono">app/backend</span>{' '}
              и фронт — прокси <span className="font-mono">/api</span> подхватится сам.
            </p>
          </div>
        ) : !companyId ? (
          <p className="text-xs text-muted-foreground">Войдите в аккаунт.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {!connected ? (
              <Button type="button" size="sm" onClick={handleConnect} disabled={loading}>
                Подключить через Meta
              </Button>
            ) : (
              <>
                <span className="text-sm text-foreground font-medium truncate max-w-[220px]">
                  {primary.accountUsername ? `@${primary.accountUsername}` : primary.sourceLabel ?? 'Подключено'}
                </span>
                <Button type="button" size="sm" variant="secondary" disabled={syncBusy} onClick={() => void handleSync()}>
                  <RefreshCw className={syncBusy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                  {syncBusy ? 'Синхронизация…' : 'Обновить'}
                </Button>
              </>
            )}
          </div>
        )}

        {loading ? <p className="text-xs text-muted-foreground">Проверка подключения…</p> : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
