import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  getSession,
  getMarketingSpend,
  getUploads,
  getChannelCampaigns,
  getContentMetrics,
  getLeads,
  getDeals,
  getInvoices,
  getPayments,
} from '@/lib/store';
import { formatKZT } from '@/lib/metrics';
import { computeLinkageDiagnostics, computeSystemCompleteness } from '@/lib/analytics';
import {
  InstagramConnectorApiError,
  fetchInstagramSourceConnectionContractFromApi,
  fetchInstagramSourceSyncRunsFromApi,
  fetchInstagramSourcesFromApi,
  getInstagramOAuthStartUrl,
  triggerInstagramLivePullFromApi,
  triggerInstagramSourceManualSyncFromApi,
  type InstagramSourceConnectionContract,
  type InstagramSource,
  type InstagramSourceSyncRun,
} from '@/lib/instagram-connectors-api';
import { persistInstagramPipelineMetrics } from '@/lib/ingestBackendSummaries';
import {
  fetchActionItemsFromApi,
  fetchContentMetricsDiagnosticsFromApi,
  fetchContentMetricsFromApi,
  fetchPilotReadinessFromApi,
  fetchWeeklyActionReviewFromApi,
  generateActionItemsFromDiagnosticsApi,
  getContentMetricsReadMode,
  rebuildContentLeadLinkageApi,
  rebuildLeadDealLinkageApi,
  updateActionItemApi,
  OperatorActionError,
  type ActionItem,
  type ContentMetricsDiagnostics,
  type PilotReadinessSummary,
  type WeeklyActionReviewSummary,
} from '@/lib/content-metrics-api';

type SortKey = 'month' | 'amount';
type SortDirection = 'asc' | 'desc';
type ActionQueueFilter = 'all' | 'marketing' | 'lead_deal';
type ActionDraft = {
  owner: string;
  dueDate: string;
  status: ActionItem['status'];
  closureNote: string;
  closureEvidenceText: string;
};
type OperatorAction = 'generate_actions' | 'rebuild_content_lead' | 'rebuild_lead_deal';
type ManualSyncFeedback = {
  type: 'success' | 'error';
  message: string;
  details?: string[];
};
type ManualSyncValidationResult =
  | { ok: true; rows: Array<Record<string, unknown>> }
  | { ok: false; message: string };

const DEFAULT_MANUAL_SYNC_ROWS_SAMPLE = JSON.stringify(
  [
    {
      contentId: 'manual_sample_post_001',
      platform: 'instagram',
      publishedAt: '2026-03-20',
      impressions: 1200,
      reach: 900,
      likes: 80,
      comments: 6,
      saves: 4,
      shares: 2,
      profileVisits: 35,
      inboundMessages: 3,
      leadsGenerated: 1,
      dealsGenerated: 0,
      paidConversions: 0,
    },
  ],
  null,
  2,
);
const MAX_MANUAL_SYNC_ROWS = 200;
const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat('ru-KZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatUploadStatus(status: string): string {
  switch (status) {
    case 'completed':
      return 'Завершено';
    case 'processing':
      return 'В обработке';
    case 'pending':
      return 'В ожидании';
    case 'error':
      return 'Ошибка';
    default:
      return status;
  }
}

function getStatusClasses(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100/60 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-800/40';
    case 'processing':
      return 'bg-amber-100/60 dark:bg-amber-900/25 text-amber-700 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800/40';
    case 'pending':
      return 'bg-muted text-muted-foreground border border-border/60';
    case 'error':
      return 'bg-rose-100/60 dark:bg-rose-900/25 text-rose-700 dark:text-rose-300 border border-rose-300/60 dark:border-rose-800/40';
    default:
      return 'bg-muted text-muted-foreground border border-border/60';
  }
}

function fileTypeLabel(type: string): string {
  switch (type) {
    case 'content_metrics':
      return 'Контент / органика';
    case 'channels_campaigns':
      return 'Источники / каналы';
    case 'marketing_spend':
      return 'Расходы';
    case 'leads':
      return 'Лиды';
    case 'deals':
      return 'Сделки';
    default:
      return type;
  }
}

function formatGateLabel(gate: string): string {
  return gate
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatObservedPreview(observed: Record<string, unknown> | null | undefined): string {
  if (!observed) return 'n/a';
  const entries = Object.entries(observed).slice(0, 3);
  if (entries.length === 0) return 'n/a';
  return entries
    .map(([key, value]) => {
      if (typeof value === 'object' && value !== null) return `${key}=[...]`;
      return `${key}=${String(value)}`;
    })
    .join(', ');
}

function toOperatorUiMessage(error: unknown, fallback: string): { message: string; cooldownUntil: string | null } {
  if (error instanceof OperatorActionError) {
    const prefix = error.code ? `[${error.code}] ` : '';
    return {
      message: `${prefix}${error.message}`,
      cooldownUntil: error.cooldownUntil ?? null,
    };
  }
  if (error instanceof Error && error.message) {
    return { message: error.message, cooldownUntil: null };
  }
  return { message: fallback, cooldownUntil: null };
}

function toConnectorUiMessage(error: unknown, fallback: string): string {
  if (error instanceof InstagramConnectorApiError) {
    const prefix = error.code ? `[${error.code}] ` : '';
    return `${prefix}${error.message}`;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatIgOAuthReason(reason: string | null): string {
  if (!reason) return 'Instagram connection did not complete.';
  const map: Record<string, string> = {
    oauth_denied: 'OAuth was cancelled or denied.',
    state_invalid: 'Invalid OAuth state; try Connect again.',
    state_expired: 'OAuth session expired; try Connect again.',
    callback_invalid: 'Missing OAuth parameters; try Connect again.',
    token_exchange_failed: 'Meta token exchange failed (check app credentials).',
    no_instagram_business: 'No Instagram Business account linked to this Facebook login.',
    graph_error: 'Meta Graph API error while resolving the account.',
    upsert_failed: 'Could not save the connected source.',
    token_persist_failed: 'Could not store credentials server-side.',
    disabled: 'Instagram live OAuth is disabled on the server.',
    config: 'Server OAuth configuration is incomplete.',
  };
  return map[reason] ?? `Connection issue (${reason}).`;
}

function toConnectorDetailLines(details: unknown): string[] {
  if (!details) return [];
  if (typeof details === 'string') return [details.slice(0, 220)];

  if (typeof details === 'object' && details !== null) {
    const fieldErrors = (details as { fieldErrors?: unknown }).fieldErrors;
    if (fieldErrors && typeof fieldErrors === 'object') {
      const lines = Object.entries(fieldErrors as Record<string, unknown>)
        .map(([field, value]) => {
          if (Array.isArray(value) && value.length > 0) {
            return `${field}: ${String(value[0])}`;
          }
          return null;
        })
        .filter(Boolean)
        .slice(0, 3) as string[];
      if (lines.length > 0) return lines;
    }
  }

  try {
    return [JSON.stringify(details).slice(0, 220)];
  } catch {
    return [];
  }
}

function validateManualSyncPayload(input: string): ManualSyncValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { ok: false, message: 'Payload must be valid JSON.' };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, message: 'Payload must be a JSON array of rows.' };
  }
  if (parsed.length === 0) {
    return { ok: false, message: 'Payload must include at least one row.' };
  }
  if (parsed.length > MAX_MANUAL_SYNC_ROWS) {
    return {
      ok: false,
      message: `Payload has ${parsed.length} rows; max allowed is ${MAX_MANUAL_SYNC_ROWS}.`,
    };
  }

  for (let i = 0; i < parsed.length; i += 1) {
    const row = parsed[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return { ok: false, message: `Row ${i + 1} must be an object.` };
    }

    const contentId = typeof (row as Record<string, unknown>).contentId === 'string'
      ? ((row as Record<string, unknown>).contentId as string).trim()
      : '';
    const platform = typeof (row as Record<string, unknown>).platform === 'string'
      ? ((row as Record<string, unknown>).platform as string).trim()
      : '';
    const publishedAt = typeof (row as Record<string, unknown>).publishedAt === 'string'
      ? ((row as Record<string, unknown>).publishedAt as string).trim()
      : '';

    const missing: string[] = [];
    if (!contentId) missing.push('contentId');
    if (!platform) missing.push('platform');
    if (!publishedAt) missing.push('publishedAt');
    if (missing.length > 0) {
      return { ok: false, message: `Row ${i + 1} missing required fields: ${missing.join(', ')}.` };
    }
    if (!YMD_REGEX.test(publishedAt)) {
      return { ok: false, message: `Row ${i + 1} has invalid publishedAt; expected YYYY-MM-DD.` };
    }
  }

  return { ok: true, rows: parsed as Array<Record<string, unknown>> };
}

export default function MarketingData() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const session = getSession();

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('month');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [apiContentMetrics, setApiContentMetrics] = useState<ReturnType<typeof getContentMetrics>>([]);
  const [apiDiagnostics, setApiDiagnostics] = useState<ContentMetricsDiagnostics | null>(null);
  const [contentMetricsSource, setContentMetricsSource] = useState<'local' | 'api' | 'api_fallback'>('local');
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [actionDrafts, setActionDrafts] = useState<Record<string, ActionDraft>>({});
  const [actionsBusy, setActionsBusy] = useState(false);
  const [actionQueueFilter, setActionQueueFilter] = useState<ActionQueueFilter>('all');
  const [weeklyReview, setWeeklyReview] = useState<{ weekStart: string; weekEnd: string; summary: WeeklyActionReviewSummary } | null>(null);
  const [pilotReadiness, setPilotReadiness] = useState<PilotReadinessSummary | null>(null);
  const [pilotReadinessLoading, setPilotReadinessLoading] = useState(false);
  const [pilotReadinessError, setPilotReadinessError] = useState<string | null>(null);
  const [instagramSources, setInstagramSources] = useState<InstagramSource[]>([]);
  const [instagramSourcesLoading, setInstagramSourcesLoading] = useState(false);
  const [instagramSourcesError, setInstagramSourcesError] = useState<string | null>(null);
  const [selectedInstagramSourceId, setSelectedInstagramSourceId] = useState('');
  const [selectedInstagramSourceRuns, setSelectedInstagramSourceRuns] = useState<InstagramSourceSyncRun[]>([]);
  const [selectedInstagramSourceRunsTotal, setSelectedInstagramSourceRunsTotal] = useState(0);
  const [instagramSourceRunsLoading, setInstagramSourceRunsLoading] = useState(false);
  const [instagramSourceRunsError, setInstagramSourceRunsError] = useState<string | null>(null);
  const [selectedInstagramSourceConnection, setSelectedInstagramSourceConnection] = useState<InstagramSourceConnectionContract | null>(null);
  const [instagramSourceRunsRefreshTick, setInstagramSourceRunsRefreshTick] = useState(0);
  const [instagramCatalogRefreshTick, setInstagramCatalogRefreshTick] = useState(0);
  const [oauthRouteFeedback, setOauthRouteFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );
  const [livePullBusy, setLivePullBusy] = useState(false);
  const [livePullFeedback, setLivePullFeedback] = useState<ManualSyncFeedback | null>(null);
  const [manualSyncRowsInput, setManualSyncRowsInput] = useState(DEFAULT_MANUAL_SYNC_ROWS_SAMPLE);
  const [manualSyncBusy, setManualSyncBusy] = useState(false);
  const [manualSyncFeedback, setManualSyncFeedback] = useState<ManualSyncFeedback | null>(null);
  const [operatorActionBusy, setOperatorActionBusy] = useState<OperatorAction | null>(null);
  const [operatorFeedback, setOperatorFeedback] = useState<{
    type: 'success' | 'error';
    action: OperatorAction;
    message: string;
    cooldownUntil?: string | null;
  } | null>(null);

  const companyId = session?.companyId || '';
  const marketingRows = getMarketingSpend(companyId);
  const channelCampaigns = getChannelCampaigns(companyId);
  const localContentMetrics = getContentMetrics(companyId);
  const leads = getLeads(companyId);
  const deals = getDeals(companyId);
  const invoices = getInvoices(companyId);
  const payments = getPayments(companyId);

  useEffect(() => {
    if (!companyId) return;

    const mode = getContentMetricsReadMode();
    if (mode !== 'api') {
      setApiContentMetrics([]);
      setApiDiagnostics(null);
      setContentMetricsSource('local');
      setInstagramSources([]);
      setInstagramSourcesLoading(false);
      setInstagramSourcesError(null);
      setSelectedInstagramSourceId('');
      setSelectedInstagramSourceRuns([]);
      setSelectedInstagramSourceRunsTotal(0);
      setInstagramSourceRunsLoading(false);
      setInstagramSourceRunsError(null);
      setSelectedInstagramSourceConnection(null);
      setInstagramSourceRunsRefreshTick(0);
      setInstagramCatalogRefreshTick(0);
      setOauthRouteFeedback(null);
      setLivePullFeedback(null);
      setManualSyncBusy(false);
      setManualSyncFeedback(null);
      setActionItems([]);
      setActionDrafts({});
      setWeeklyReview(null);
      setPilotReadiness(null);
      setPilotReadinessError(null);
      setPilotReadinessLoading(false);
      setOperatorFeedback(null);
      return;
    }

    const controller = new AbortController();
    let active = true;

    const load = async () => {
      setPilotReadinessLoading(true);
      setPilotReadinessError(null);
      try {
        const [rows, diagnostics, actions, review] = await Promise.all([
          fetchContentMetricsFromApi(companyId, controller.signal),
          fetchContentMetricsDiagnosticsFromApi(companyId, controller.signal),
          fetchActionItemsFromApi(companyId, controller.signal),
          fetchWeeklyActionReviewFromApi(companyId, controller.signal),
        ]);
        if (!active) return;
        setApiContentMetrics(rows);
        setApiDiagnostics(diagnostics);
        setActionItems(actions);
        setWeeklyReview(review);
        try {
          const readiness = await fetchPilotReadinessFromApi(companyId, controller.signal);
          if (!active) return;
          setPilotReadiness(readiness);
          setPilotReadinessError(null);
        } catch {
          if (!active) return;
          setPilotReadiness(null);
          setPilotReadinessError('Pilot readiness unavailable');
        }
        setActionDrafts(actions.reduce<Record<string, ActionDraft>>((acc, item) => {
          acc[item.id] = {
            owner: item.owner || '',
            dueDate: item.dueDate || '',
            status: item.status,
            closureNote: item.closureNote || '',
            closureEvidenceText:
              typeof item.closureEvidence === 'string'
                ? item.closureEvidence
                : item.closureEvidence
                  ? JSON.stringify(item.closureEvidence)
                  : '',
          };
          return acc;
        }, {}));
        setContentMetricsSource('api');
      } catch {
        if (!active) return;
        setApiContentMetrics([]);
        setApiDiagnostics(null);
        setActionItems([]);
        setActionDrafts({});
        setWeeklyReview(null);
        setPilotReadiness(null);
        setPilotReadinessError('Pilot readiness unavailable');
        setContentMetricsSource('api_fallback');
      } finally {
        if (active) setPilotReadinessLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [companyId]);

  useEffect(() => {
    const ig = searchParams.get('ig_oauth');
    if (ig === null) return;

    const reason = searchParams.get('reason');
    const sourceId = searchParams.get('sourceId');

    if (ig === '1') {
      setOauthRouteFeedback({
        type: 'success',
        message: sourceId ? `Instagram connected. Source: ${sourceId}` : 'Instagram connected.',
      });
      setInstagramCatalogRefreshTick((t) => t + 1);
      queueMicrotask(() => {
        const cid = getSession()?.companyId ?? '';
        if (cid) {
          void persistInstagramPipelineMetrics(cid).catch((err) => {
            console.warn('[Chrona] persistInstagramPipelineMetrics after OAuth', err);
          });
        }
      });
    } else {
      setOauthRouteFeedback({
        type: 'error',
        message: formatIgOAuthReason(reason),
      });
    }

    const next = new URLSearchParams(searchParams);
    next.delete('ig_oauth');
    next.delete('reason');
    next.delete('sourceId');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!companyId || contentMetricsSource !== 'api') {
      setInstagramSources([]);
      setInstagramSourcesLoading(false);
      setInstagramSourcesError(null);
      setSelectedInstagramSourceId('');
      return;
    }

    const controller = new AbortController();
    let active = true;
    setInstagramSourcesLoading(true);
    setInstagramSourcesError(null);

    fetchInstagramSourcesFromApi(companyId, controller.signal)
      .then((sources) => {
        if (!active) return;
        setInstagramSources(sources);
        setSelectedInstagramSourceId((prev) => {
          if (prev && sources.some((source) => source.id === prev)) return prev;
          return sources[0]?.id || '';
        });
      })
      .catch((error) => {
        if (!active) return;
        setInstagramSources([]);
        setSelectedInstagramSourceId('');
        setInstagramSourcesError(toConnectorUiMessage(error, 'Instagram sources unavailable.'));
      })
      .finally(() => {
        if (active) setInstagramSourcesLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [companyId, contentMetricsSource, instagramCatalogRefreshTick]);

  useEffect(() => {
    if (!companyId || contentMetricsSource !== 'api' || !selectedInstagramSourceId) {
      setSelectedInstagramSourceRuns([]);
      setSelectedInstagramSourceRunsTotal(0);
      setInstagramSourceRunsLoading(false);
      setInstagramSourceRunsError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setInstagramSourceRunsLoading(true);
    setInstagramSourceRunsError(null);

    fetchInstagramSourceSyncRunsFromApi(companyId, selectedInstagramSourceId, {
      limit: 5,
      signal: controller.signal,
    })
      .then((result) => {
        if (!active) return;
        setSelectedInstagramSourceRuns(result.runs);
        setSelectedInstagramSourceRunsTotal(result.total);
      })
      .catch((error) => {
        if (!active) return;
        setSelectedInstagramSourceRuns([]);
        setSelectedInstagramSourceRunsTotal(0);
        setInstagramSourceRunsError(toConnectorUiMessage(error, 'Source sync history unavailable.'));
      })
      .finally(() => {
        if (active) setInstagramSourceRunsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [companyId, contentMetricsSource, selectedInstagramSourceId, instagramSourceRunsRefreshTick]);

  useEffect(() => {
    if (!companyId || contentMetricsSource !== 'api' || !selectedInstagramSourceId) {
      setSelectedInstagramSourceConnection(null);
      return;
    }

    const controller = new AbortController();
    let active = true;

    fetchInstagramSourceConnectionContractFromApi(companyId, selectedInstagramSourceId, controller.signal)
      .then((connection) => {
        if (!active) return;
        setSelectedInstagramSourceConnection(connection);
      })
      .catch(() => {
        if (!active) return;
        setSelectedInstagramSourceConnection(null);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [companyId, contentMetricsSource, selectedInstagramSourceId, instagramCatalogRefreshTick]);

  useEffect(() => {
    setManualSyncFeedback(null);
    setLivePullFeedback(null);
  }, [selectedInstagramSourceId, contentMetricsSource]);

  const reloadAfterLivePull = async () => {
    if (!companyId || contentMetricsSource !== 'api') return;
    try {
      const [rows, diagnostics] = await Promise.all([
        fetchContentMetricsFromApi(companyId),
        fetchContentMetricsDiagnosticsFromApi(companyId),
      ]);
      setApiContentMetrics(rows);
      setApiDiagnostics(diagnostics);
      await reloadPilotReadiness();
    } catch {
      await reloadDiagnosticsAndReadiness();
    } finally {
      setInstagramSourceRunsRefreshTick((p) => p + 1);
      setInstagramCatalogRefreshTick((p) => p + 1);
    }
  };

  const reloadActions = async () => {
    if (!companyId) return;
    const [actions, review] = await Promise.all([
      fetchActionItemsFromApi(companyId),
      fetchWeeklyActionReviewFromApi(companyId),
    ]);
    setActionItems(actions);
    setWeeklyReview(review);
    setActionDrafts(actions.reduce<Record<string, ActionDraft>>((acc, item) => {
      acc[item.id] = {
        owner: item.owner || '',
        dueDate: item.dueDate || '',
        status: item.status,
        closureNote: item.closureNote || '',
        closureEvidenceText:
          typeof item.closureEvidence === 'string'
            ? item.closureEvidence
            : item.closureEvidence
              ? JSON.stringify(item.closureEvidence)
              : '',
      };
      return acc;
    }, {}));
  };

  const reloadPilotReadiness = async () => {
    if (!companyId) return;
    setPilotReadinessLoading(true);
    try {
      const readiness = await fetchPilotReadinessFromApi(companyId);
      setPilotReadiness(readiness);
      setPilotReadinessError(null);
    } catch {
      setPilotReadiness(null);
      setPilotReadinessError('Pilot readiness unavailable');
    } finally {
      setPilotReadinessLoading(false);
    }
  };

  const reloadDiagnosticsAndReadiness = async () => {
    if (!companyId) return;
    const [diagnostics] = await Promise.all([
      fetchContentMetricsDiagnosticsFromApi(companyId),
      reloadPilotReadiness(),
    ]);
    setApiDiagnostics(diagnostics);
  };

  const handleConnectInstagram = () => {
    if (!companyId || contentMetricsSource !== 'api') return;
    window.location.assign(getInstagramOAuthStartUrl(companyId));
  };

  const handleLivePull = async () => {
    if (!companyId || contentMetricsSource !== 'api' || !selectedInstagramSourceId || livePullBusy) return;
    setLivePullBusy(true);
    setLivePullFeedback(null);
    try {
      const result = await triggerInstagramLivePullFromApi(selectedInstagramSourceId, companyId, { limit: 25 });
      if (result.ingestion === null && result.message) {
        setLivePullFeedback({
          type: 'success',
          message: result.message,
        });
      } else {
        const ing = result.ingestion;
        setLivePullFeedback({
          type: 'success',
          message: 'Live pull completed.',
          details: [
            result.livePull
              ? `Graph: media ${result.livePull.mediaReceived ?? 0}, rows ${result.livePull.rowsMapped ?? 0}`
              : null,
            ing
              ? `Job ${ing.job?.id ?? 'n/a'} (${ing.job?.status ?? 'n/a'}) · processed ${ing.processed ?? 0} · I/U ${ing.inserted ?? 0}/${ing.updated ?? 0}`
              : null,
            ing?.trustSummary
              ? `Trust E/F/I: ${ing.trustSummary.exact ?? 0}/${ing.trustSummary.fallback ?? 0}/${ing.trustSummary.incomplete ?? 0}`
              : null,
          ].filter(Boolean) as string[],
        });
      }
      await reloadAfterLivePull();
      try {
        await persistInstagramPipelineMetrics(companyId);
      } catch (persistErr) {
        console.warn('[Chrona] persistInstagramPipelineMetrics after live pull', persistErr);
      }
    } catch (error) {
      const detailLines =
        error instanceof InstagramConnectorApiError ? toConnectorDetailLines(error.details) : [];
      setLivePullFeedback({
        type: 'error',
        message: toConnectorUiMessage(error, 'Live pull failed.'),
        details: detailLines.length > 0 ? detailLines : undefined,
      });
    } finally {
      setLivePullBusy(false);
    }
  };

  const handleTriggerManualInstagramSync = async () => {
    if (!companyId || contentMetricsSource !== 'api' || !selectedInstagramSourceId || manualSyncBusy) return;

    const validation = validateManualSyncPayload(manualSyncRowsInput);
    if (!validation.ok) {
      setManualSyncFeedback({
        type: 'error',
        message: validation.message,
      });
      return;
    }
    const parsedRows = validation.rows;

    setManualSyncBusy(true);
    setManualSyncFeedback(null);
    try {
      const result = await triggerInstagramSourceManualSyncFromApi(selectedInstagramSourceId, {
        companyId,
        rows: parsedRows,
      });
      setManualSyncFeedback({
        type: 'success',
        message: 'Manual sync submitted.',
        details: [
          `Job: ${result.job?.id || 'n/a'} (${result.job?.status || 'accepted'})`,
          `Replay: ${result.replayed ? 'yes' : 'no'}${result.reused ? ' / reused' : ''}`,
          result.result
            ? `Processed/Inserted/Updated: ${result.result.processed ?? 'n/a'}/${result.result.inserted ?? 'n/a'}/${result.result.updated ?? 'n/a'}`
            : null,
          result.result?.trustSummary
            ? `Trust E/F/I: ${result.result.trustSummary.exact ?? 0}/${result.result.trustSummary.fallback ?? 0}/${result.result.trustSummary.incomplete ?? 0}`
            : null,
        ].filter(Boolean) as string[],
      });
      setInstagramSourceRunsRefreshTick((prev) => prev + 1);
      await reloadDiagnosticsAndReadiness();
      try {
        await persistInstagramPipelineMetrics(companyId);
      } catch (persistErr) {
        console.warn('[Chrona] persistInstagramPipelineMetrics after manual sync', persistErr);
      }
    } catch (error) {
      const detailLines =
        error instanceof InstagramConnectorApiError
          ? toConnectorDetailLines(error.details)
          : [];
      setManualSyncFeedback({
        type: 'error',
        message: toConnectorUiMessage(error, 'Manual sync failed.'),
        details: detailLines.length > 0 ? detailLines : undefined,
      });
    } finally {
      setManualSyncBusy(false);
    }
  };

  const handleResetManualSyncPayload = () => {
    if (manualSyncBusy) return;
    setManualSyncRowsInput(DEFAULT_MANUAL_SYNC_ROWS_SAMPLE);
    setManualSyncFeedback(null);
  };

  const handleGenerateActions = async () => {
    if (!companyId) return;
    setActionsBusy(true);
    setOperatorActionBusy('generate_actions');
    setOperatorFeedback(null);
    try {
      await generateActionItemsFromDiagnosticsApi(companyId);
      await reloadActions();
      await reloadPilotReadiness();
      setOperatorFeedback({
        type: 'success',
        action: 'generate_actions',
        message: 'Actions regenerated from diagnostics.',
        cooldownUntil: null,
      });
    } catch (error) {
      const ui = toOperatorUiMessage(error, 'Failed to regenerate actions.');
      setOperatorFeedback({
        type: 'error',
        action: 'generate_actions',
        message: ui.message,
        cooldownUntil: ui.cooldownUntil,
      });
      await reloadPilotReadiness();
    } finally {
      setOperatorActionBusy(null);
      setActionsBusy(false);
    }
  };

  const handleRebuildContentLead = async () => {
    if (!companyId || contentMetricsSource !== 'api') return;
    setOperatorActionBusy('rebuild_content_lead');
    setOperatorFeedback(null);
    try {
      await rebuildContentLeadLinkageApi(companyId);
      await reloadDiagnosticsAndReadiness();
      setOperatorFeedback({
        type: 'success',
        action: 'rebuild_content_lead',
        message: 'Content\u2192Lead linkage rebuild completed.',
        cooldownUntil: null,
      });
    } catch (error) {
      const ui = toOperatorUiMessage(error, 'Failed to rebuild Content\u2192Lead linkage.');
      setOperatorFeedback({
        type: 'error',
        action: 'rebuild_content_lead',
        message: ui.message,
        cooldownUntil: ui.cooldownUntil,
      });
      await reloadPilotReadiness();
    } finally {
      setOperatorActionBusy(null);
    }
  };

  const handleRebuildLeadDeal = async () => {
    if (!companyId || contentMetricsSource !== 'api') return;
    setOperatorActionBusy('rebuild_lead_deal');
    setOperatorFeedback(null);
    try {
      await rebuildLeadDealLinkageApi(companyId);
      await reloadDiagnosticsAndReadiness();
      setOperatorFeedback({
        type: 'success',
        action: 'rebuild_lead_deal',
        message: 'Lead\u2192Deal linkage rebuild completed.',
        cooldownUntil: null,
      });
    } catch (error) {
      const ui = toOperatorUiMessage(error, 'Failed to rebuild Lead\u2192Deal linkage.');
      setOperatorFeedback({
        type: 'error',
        action: 'rebuild_lead_deal',
        message: ui.message,
        cooldownUntil: ui.cooldownUntil,
      });
      await reloadPilotReadiness();
    } finally {
      setOperatorActionBusy(null);
    }
  };

  const handleUpdateAction = async (actionId: string) => {
    const draft = actionDrafts[actionId];
    if (!draft || !companyId) return;
    setActionsBusy(true);
    try {
      await updateActionItemApi(actionId, companyId, {
        owner: draft.owner.trim() || undefined,
        dueDate: draft.dueDate || undefined,
        status: draft.status,
        closureNote: draft.closureNote.trim() || undefined,
        closureEvidence: draft.closureEvidenceText.trim() || undefined,
      });
      await reloadActions();
    } finally {
      setActionsBusy(false);
    }
  };

  const contentMetrics = contentMetricsSource === 'api' ? apiContentMetrics : localContentMetrics;

  const marketingUploads = getUploads(companyId)
    .filter((upload) => ['marketing_spend', 'channels_campaigns', 'content_metrics', 'leads', 'deals'].includes(upload.fileType))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const rows = marketingRows.filter((row) => {
      if (!normalizedSearch) return true;
      return row.month.toLowerCase().includes(normalizedSearch);
    });

    rows.sort((a, b) => {
      if (sortKey === 'month') {
        const compare = a.month.localeCompare(b.month);
        return sortDirection === 'asc' ? compare : -compare;
      }

      const compare = a.amount - b.amount;
      return sortDirection === 'asc' ? compare : -compare;
    });

    return rows;
  }, [marketingRows, search, sortKey, sortDirection]);

  const totalSpend = marketingRows.reduce((sum, row) => sum + row.amount, 0);
  const latestMonth = marketingRows.length
    ? [...marketingRows].sort((a, b) => b.month.localeCompare(a.month))[0].month
    : null;

  const averageSpend = marketingRows.length > 0 ? totalSpend / marketingRows.length : 0;

  const completeness = useMemo(
    () =>
      computeSystemCompleteness({
        leads,
        deals,
        invoices,
        payments,
        marketingSpend: marketingRows,
        channelCampaigns,
        contentMetrics,
      }),
    [leads, deals, invoices, payments, marketingRows, channelCampaigns, contentMetrics],
  );

  const linkageDiagnostics = useMemo(
    () =>
      computeLinkageDiagnostics({
        leads,
        deals,
        invoices,
        payments,
      }),
    [leads, deals, invoices, payments],
  );

  const hasAnyData =
    marketingRows.length > 0 ||
    marketingUploads.length > 0 ||
    channelCampaigns.length > 0 ||
    contentMetrics.length > 0 ||
    leads.length > 0 ||
    deals.length > 0;

  const latestUpload = marketingUploads[0];
  const uploadsByType = useMemo(() => {
    const m = new Map<string, number>();
    for (const up of marketingUploads) m.set(up.fileType, (m.get(up.fileType) ?? 0) + 1);
    return m;
  }, [marketingUploads]);

  const filteredActionItems = useMemo(() => {
    if (actionQueueFilter === 'all') return actionItems;
    if (actionQueueFilter === 'lead_deal') {
      return actionItems.filter((item) => item.diagnostic.type === 'lead_deal_linkage');
    }
    return actionItems.filter((item) => item.diagnostic.type !== 'lead_deal_linkage');
  }, [actionItems, actionQueueFilter]);

  const operatorControlsByAction = useMemo(() => {
    const map = new Map<string, NonNullable<PilotReadinessSummary['operatorControls']>['actions'][number]>();
    for (const item of pilotReadiness?.operatorControls?.actions ?? []) {
      map.set(item.actionType, item);
    }
    return map;
  }, [pilotReadiness]);

  const generateActionsControl = operatorControlsByAction.get('generate_actions');
  const rebuildContentLeadControl = operatorControlsByAction.get('rebuild_content_lead');
  const rebuildLeadDealControl = operatorControlsByAction.get('rebuild_lead_deal');
  const consistencyWarnings = pilotReadiness?.operatorControls?.consistencyChecks?.warnings || [];
  const instagramSourceSummary = apiDiagnostics?.instagramSourceSummary ?? null;
  const latestInstagramSync = instagramSourceSummary?.latestSourceBoundSyncRun ?? null;
  const latestInstagramSyncAt =
    latestInstagramSync?.completedAt
    ?? latestInstagramSync?.failedAt
    ?? latestInstagramSync?.startedAt
    ?? latestInstagramSync?.requestedAt
    ?? null;
  const primaryInstagramSource = instagramSourceSummary?.sources?.[0] ?? null;
  const selectedInstagramSource =
    instagramSources.find((source) => source.id === selectedInstagramSourceId) ?? null;
  const selectedInstagramSourceFromDiagnostics =
    instagramSourceSummary?.sources?.find((source) => source.sourceId === selectedInstagramSourceId) ?? null;
  const latestSelectedSourceRun = selectedInstagramSourceRuns[0] ?? null;
  const latestSelectedSourceRunStatus =
    latestSelectedSourceRun?.status
    ?? selectedInstagramSourceFromDiagnostics?.latestSyncRun?.status
    ?? selectedInstagramSource?.lastSyncStatus
    ?? null;
  const latestSelectedSourceRunAt =
    latestSelectedSourceRun?.completedAt
    ?? latestSelectedSourceRun?.failedAt
    ?? latestSelectedSourceRun?.startedAt
    ?? latestSelectedSourceRun?.requestedAt
    ?? selectedInstagramSourceFromDiagnostics?.latestSyncRun?.completedAt
    ?? selectedInstagramSourceFromDiagnostics?.latestSyncRun?.failedAt
    ?? selectedInstagramSourceFromDiagnostics?.latestSyncRun?.startedAt
    ?? selectedInstagramSourceFromDiagnostics?.latestSyncRun?.requestedAt
    ?? selectedInstagramSource?.lastSyncCompletedAt
    ?? selectedInstagramSource?.lastSyncRequestedAt
    ?? null;

  const canLivePull =
    contentMetricsSource === 'api' &&
    Boolean(selectedInstagramSourceId) &&
    !livePullBusy &&
    selectedInstagramSource?.connectionState === 'active' &&
    selectedInstagramSourceConnection?.credentialPresence === true &&
    selectedInstagramSourceConnection?.credentialRef === 'oauth_token:v1';

  return (
    <div className="chrona-page">
      <div className="chrona-tier-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="rct-page-title">Marketing Data</h2>
            <p className="rct-body-micro text-muted-foreground mt-1">
              Центр контроля маркетинг-данных: что загружено, что отсутствует и насколько данные пригодны для аналитики.
            </p>
          </div>
          <span className="chrona-topbar-chip">Data Control</span>
        </div>
      </div>

      {!hasAnyData && (
        <Card className="chrona-surface border-dashed">
          <CardHeader>
            <CardTitle>Нет данных</CardTitle>
            <CardDescription>
              Загрузите маркетинговые файлы: контент/органика, источники/каналы и расходы.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground mb-6 max-w-md">
              Пока нет маркетингового набора данных. Начните с контента/органики, затем добавьте источники и расходы.
            </p>
            <Button onClick={() => navigate('/uploads')}>
              Перейти в Загрузки
            </Button>
          </CardContent>
        </Card>
      )}

      {hasAnyData && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            <Card className="chrona-surface">
              <CardHeader className="pb-3">
                <CardDescription>Контент / органика</CardDescription>
                <CardTitle className="text-2xl text-foreground">{contentMetrics.length}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Органика / Instagram / TikTok</p>
              </CardHeader>
            </Card>

            <Card className="chrona-surface">
              <CardHeader className="pb-3">
                <CardDescription>Источники / каналы</CardDescription>
                <CardTitle className="text-2xl text-foreground">{channelCampaigns.length}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Связь источников и кампаний</p>
              </CardHeader>
            </Card>

            <Card className="chrona-surface">
              <CardHeader className="pb-3">
                <CardDescription>Расходы</CardDescription>
                <CardTitle className="text-2xl text-foreground">
                  {marketingRows.length}
                </CardTitle>
                {latestMonth ? (
                  <p className="text-xs text-muted-foreground mt-1">Последний месяц: {latestMonth}</p>
                ) : null}
              </CardHeader>
            </Card>

            <Card className="chrona-surface">
              <CardHeader className="pb-3">
                <CardDescription>Доверие к маркетинг-данным</CardDescription>
                <CardTitle className="text-2xl text-foreground">{completeness.overall}%</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {completeness.overall >= 80 ? 'Exact (точно)' : completeness.overall >= 50 ? 'Fallback (по неполным связям)' : 'Incomplete (неполно)'}
                </p>
              </CardHeader>
            </Card>
          </div>
      )}

          <Card className="chrona-hero">
            <CardHeader>
              <CardTitle>Готовность маркетинг-аналитики</CardTitle>
              <CardDescription>
                Быстрый ответ: достаточно ли данных для отчётов и overview.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  Органика: {contentMetrics.length > 0 ? 'загружена' : 'отсутствует'}
                </Badge>
                <Badge variant="outline">
                  Каналы: {channelCampaigns.length > 0 ? 'загружены' : 'отсутствуют'}
                </Badge>
                <Badge variant="outline">
                  Расход: {marketingRows.length > 0 ? 'загружен' : 'отсутствует'}
                </Badge>
                <Badge variant="outline">
                  CRM связка: {leads.length > 0 && deals.length > 0 ? 'частично есть' : 'ограничена'}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  Content Source: {contentMetricsSource === 'api' ? 'API' : contentMetricsSource === 'api_fallback' ? 'Local fallback' : 'Local'}
                </Badge>
                {apiDiagnostics && (
                  <>
                    <Badge variant="outline">
                      API trust avg: {apiDiagnostics.avgCompletenessScore.toFixed(1)}%
                    </Badge>
                    <Badge variant="outline">
                      Exact/Fallback/Incomplete: {apiDiagnostics.confidenceBreakdown.exact}/{apiDiagnostics.confidenceBreakdown.fallback}/{apiDiagnostics.confidenceBreakdown.incomplete}
                    </Badge>
                  </>
                )}
              </div>

              {apiDiagnostics && apiDiagnostics.topDiagnosticFlags.length > 0 && (
                <div className="space-y-1">
                  {apiDiagnostics.topDiagnosticFlags.slice(0, 3).map((flag) => (
                    <p key={flag.flag} className="text-xs text-muted-foreground">
                      - API diagnostic: {flag.flag} ({flag.count})
                    </p>
                  ))}
                </div>
              )}

              {apiDiagnostics && apiDiagnostics.leadLinkageBridge && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    Lead linkage coverage: {apiDiagnostics.leadLinkageBridge.linkageCoveragePercent.toFixed(1)}%
                  </Badge>
                  <Badge variant="outline">
                    Linked/Unlinked leads: {apiDiagnostics.leadLinkageBridge.linkedLeads}/{apiDiagnostics.leadLinkageBridge.unlinkedLeads}
                  </Badge>
                  <Badge variant="outline">
                    Match methods (key/window): {apiDiagnostics.leadLinkageBridge.methodBreakdown.explicit_lead_link_key}/{apiDiagnostics.leadLinkageBridge.methodBreakdown.channel_date_window}
                  </Badge>
                </div>
              )}

              {apiDiagnostics && apiDiagnostics.freshness && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    Last ingest: {apiDiagnostics.freshness.lastIngestedAt ? formatDateTime(apiDiagnostics.freshness.lastIngestedAt) : 'n/a'}
                  </Badge>
                  <Badge variant="outline">
                    Days since ingest: {apiDiagnostics.freshness.daysSinceLastIngest ?? 'n/a'}
                  </Badge>
                  <Badge variant="outline">
                    Latest content date: {apiDiagnostics.freshness.latestPublishedAt ?? 'n/a'}
                  </Badge>
                </div>
              )}

              {apiDiagnostics && apiDiagnostics.ingestionHealth && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    Jobs C/F/R/P: {apiDiagnostics.ingestionHealth.completedJobs}/{apiDiagnostics.ingestionHealth.failedJobs}/{apiDiagnostics.ingestionHealth.runningJobs}/{apiDiagnostics.ingestionHealth.pendingJobs}
                  </Badge>
                  {apiDiagnostics.ingestionHealth.latestJob && (
                    <Badge variant="outline">
                      Latest job: {apiDiagnostics.ingestionHealth.latestJob.status}
                      {apiDiagnostics.ingestionHealth.latestJob.source?.sourceFileName ? ` · ${apiDiagnostics.ingestionHealth.latestJob.source.sourceFileName}` : ''}
                    </Badge>
                  )}
                </div>
              )}

              {instagramSourceSummary && (
                <div className="rounded-md border border-border/70 p-3 space-y-2">
                  <p className="text-xs font-medium text-foreground">Instagram source visibility</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      Source data: {instagramSourceSummary.hasInstagramSourceData ? 'yes' : 'no'}
                    </Badge>
                    <Badge variant="outline">
                      Source rows: {instagramSourceSummary.totalInstagramSourceRows}
                    </Badge>
                    {latestInstagramSync && (
                      <Badge variant="outline">
                        Latest source sync: {latestInstagramSync.status}
                        {latestInstagramSyncAt ? ` · ${formatDateTime(latestInstagramSyncAt)}` : ''}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {primaryInstagramSource && (
                      <>
                        <Badge variant="outline">
                          Source: {primaryInstagramSource.sourceDisplayName || primaryInstagramSource.sourceId}
                        </Badge>
                        {primaryInstagramSource.accountExternalId && (
                          <Badge variant="outline">
                            Account ref: {primaryInstagramSource.accountExternalId}
                          </Badge>
                        )}
                      </>
                    )}
                    {instagramSourceSummary.sourceIdentityBreakdown && (
                      <Badge variant="outline">
                        Identity rows I/F/O: {instagramSourceSummary.sourceIdentityBreakdown.instagramSource}/{instagramSourceSummary.sourceIdentityBreakdown.fileUpload}/{instagramSourceSummary.sourceIdentityBreakdown.other}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-md border border-border/70 p-3 space-y-2">
                <p className="text-xs font-medium text-foreground">Instagram Source Operations</p>
                {contentMetricsSource !== 'api' ? (
                  <p className="text-xs text-muted-foreground">
                    Available in API mode only.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {companyId ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleConnectInstagram()}
                          disabled={instagramSourcesLoading}
                        >
                          Connect Instagram
                        </Button>
                        {oauthRouteFeedback && (
                          <p
                            className={`text-xs ${
                              oauthRouteFeedback.type === 'success'
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : 'text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {oauthRouteFeedback.message}
                          </p>
                        )}
                      </div>
                    ) : null}
                    {instagramSourcesLoading ? (
                      <p className="text-xs text-muted-foreground">
                        Loading sources...
                      </p>
                    ) : instagramSourcesError ? (
                      <p className="text-xs text-rose-700 dark:text-rose-300">
                        {instagramSourcesError}
                      </p>
                    ) : instagramSources.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No Instagram sources found for this company.
                      </p>
                    ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Source:</span>
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        value={selectedInstagramSourceId}
                        onChange={(e) => setSelectedInstagramSourceId(e.target.value)}
                      >
                        {instagramSources.map((source) => (
                          <option key={source.id} value={source.id}>
                            {source.sourceLabel || source.accountName || source.accountUsername || source.accountExternalId || source.id}
                          </option>
                        ))}
                      </select>
                      {selectedInstagramSource?.connectionState && (
                        <Badge variant="outline">
                          State: {selectedInstagramSource.connectionState}
                        </Badge>
                      )}
                      {selectedInstagramSource?.accountExternalId && (
                        <Badge variant="outline">
                          Account: {selectedInstagramSource.accountExternalId}
                        </Badge>
                      )}
                    </div>

                    {selectedInstagramSourceConnection && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-foreground">Connection Contract</p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">
                            State: {selectedInstagramSourceConnection.state}
                          </Badge>
                          <Badge variant="outline">
                            Credential: {selectedInstagramSourceConnection.credentialPresence ? 'present' : 'missing'}
                          </Badge>
                          <Badge variant="outline">
                            Expires: {selectedInstagramSourceConnection.credentialExpiresAt ? formatDateTime(selectedInstagramSourceConnection.credentialExpiresAt) : 'n/a'}
                          </Badge>
                          <Badge variant="outline">
                            Validation: {selectedInstagramSourceConnection.lastContractValidationStatus || 'unknown'}
                          </Badge>
                        </div>
                        {(selectedInstagramSourceConnection.stateReason
                          || selectedInstagramSourceConnection.lastContractValidatedAt
                          || selectedInstagramSourceConnection.lastContractValidationMessage) && (
                          <p className="text-[11px] text-muted-foreground">
                            {selectedInstagramSourceConnection.stateReason
                              ? `Reason: ${selectedInstagramSourceConnection.stateReason}. `
                              : ''}
                            {selectedInstagramSourceConnection.lastContractValidatedAt
                              ? `Validated: ${formatDateTime(selectedInstagramSourceConnection.lastContractValidatedAt)}. `
                              : ''}
                            {selectedInstagramSourceConnection.lastContractValidationMessage
                              ? `Message: ${selectedInstagramSourceConnection.lastContractValidationMessage}`
                              : ''}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Manual sync payload (JSON rows array):
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Required per row: contentId, platform, publishedAt (YYYY-MM-DD). Max rows: {MAX_MANUAL_SYNC_ROWS}.
                      </p>
                      <Textarea
                        value={manualSyncRowsInput}
                        onChange={(e) => setManualSyncRowsInput(e.target.value)}
                        className="min-h-[84px] text-xs font-mono"
                        disabled={manualSyncBusy}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleTriggerManualInstagramSync()}
                          disabled={!selectedInstagramSourceId || manualSyncBusy || instagramSourcesLoading}
                        >
                          {manualSyncBusy ? 'Running sync...' : 'Run manual sync'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleResetManualSyncPayload}
                          disabled={manualSyncBusy}
                        >
                          Reset sample payload
                        </Button>
                        {manualSyncFeedback && (
                          <div
                            className={`text-xs space-y-1 ${
                              manualSyncFeedback.type === 'success'
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : 'text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            <p>{manualSyncFeedback.message}</p>
                            {manualSyncFeedback.details?.map((line, idx) => (
                              <p key={`${line}-${idx}`} className="text-[11px]">
                                {line}
                              </p>
                            ))}
                          </div>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void handleLivePull()}
                          disabled={!canLivePull || livePullBusy}
                          title={
                            canLivePull
                              ? 'Fetch recent media from Meta into content metrics'
                              : 'Requires active source with OAuth credentials (oauth_token:v1)'
                          }
                        >
                          {livePullBusy ? 'Pulling...' : 'Pull live data'}
                        </Button>
                        {livePullFeedback && (
                          <div
                            className={`text-xs space-y-1 ${
                              livePullFeedback.type === 'success'
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : 'text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            <p>{livePullFeedback.message}</p>
                            {livePullFeedback.details?.map((line, idx) => (
                              <p key={`live-${line}-${idx}`} className="text-[11px]">
                                {line}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        Latest sync: {latestSelectedSourceRunStatus || 'n/a'}
                        {latestSelectedSourceRunAt ? ` · ${formatDateTime(latestSelectedSourceRunAt)}` : ''}
                      </Badge>
                      <Badge variant="outline">
                        Recent runs: {selectedInstagramSourceRuns.length}/{selectedInstagramSourceRunsTotal}
                      </Badge>
                      {latestSelectedSourceRun && (
                        <Badge variant="outline">
                          Rows R/I/U/X: {latestSelectedSourceRun.rowCounts.received}/{latestSelectedSourceRun.rowCounts.inserted}/{latestSelectedSourceRun.rowCounts.updated}/{latestSelectedSourceRun.rowCounts.rejected}
                        </Badge>
                      )}
                    </div>

                    {instagramSourceRunsLoading ? (
                      <p className="text-xs text-muted-foreground">
                        Loading sync history...
                      </p>
                    ) : instagramSourceRunsError ? (
                      <p className="text-xs text-rose-700 dark:text-rose-300">
                        {instagramSourceRunsError}
                      </p>
                    ) : selectedInstagramSourceRuns.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No sync runs for this source yet.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {selectedInstagramSourceRuns.slice(0, 5).map((run) => (
                          <p key={run.id} className="text-xs text-muted-foreground">
                            {run.status} · {run.requestedAt ? formatDateTime(run.requestedAt) : 'n/a'} · R/I/U/X {run.rowCounts.received}/{run.rowCounts.inserted}/{run.rowCounts.updated}/{run.rowCounts.rejected}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                    )}
                  </div>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                {contentMetrics.length > 0 && marketingRows.length === 0
                  ? 'Органика доступна, но метрики затрат (ROI и стоимость привлечения) будут ограничены без данных по расходам.'
                  : contentMetrics.length === 0 && marketingRows.length > 0
                    ? 'Расход есть, но без контент-данных не виден вклад публикаций и органики.'
                    : contentMetrics.length > 0 && marketingRows.length > 0
                      ? 'Есть и органика, и расходы — отчёты будут наиболее полными.'
                      : 'Загрузите хотя бы один ключевой слой (контент/органика или расходы), чтобы начать анализ.'}
              </p>
            </CardContent>
          </Card>

      {hasAnyData && (
        <>
          <Card className="chrona-surface">
            <CardHeader className="pb-3">
              <CardTitle>Pilot Readiness</CardTitle>
              <CardDescription>
                Compact operator check: current readiness gates and manual controls.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    !pilotReadiness
                      ? ''
                      : pilotReadiness.overallStatus === 'green'
                        ? 'border-emerald-400/70 text-emerald-700'
                        : pilotReadiness.overallStatus === 'yellow'
                          ? 'border-amber-400/70 text-amber-700'
                          : 'border-rose-400/70 text-rose-700'
                  }
                >
                  Overall: {pilotReadiness?.overallStatus ?? (pilotReadinessLoading ? 'loading' : 'n/a')}
                </Badge>
                <Badge variant="outline">
                  Evaluated: {pilotReadiness?.evaluatedAt ? formatDateTime(pilotReadiness.evaluatedAt) : 'n/a'}
                </Badge>
                {pilotReadiness && (
                  <Badge variant="outline">
                    Gates G/Y/R: {pilotReadiness.gateCounts.green}/{pilotReadiness.gateCounts.yellow}/{pilotReadiness.gateCounts.red}
                  </Badge>
                )}
                <Badge variant="outline">
                  Mode: {contentMetricsSource === 'api' ? 'API' : 'Local'}
                </Badge>
              </div>

              {consistencyWarnings.length > 0 && (
                <div className="space-y-1">
                  {consistencyWarnings.slice(0, 3).map((warning) => (
                    <p key={warning.check} className="text-[11px] text-amber-700 dark:text-amber-300">
                      Warning: {warning.message}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleGenerateActions()}
                  disabled={
                    contentMetricsSource !== 'api'
                    || operatorActionBusy !== null
                    || Boolean(generateActionsControl?.isCoolingDown)
                  }
                >
                  {operatorActionBusy === 'generate_actions' ? 'Regenerating...' : 'Regenerate Actions'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleRebuildContentLead()}
                  disabled={
                    contentMetricsSource !== 'api'
                    || operatorActionBusy !== null
                    || Boolean(rebuildContentLeadControl?.isCoolingDown)
                  }
                >
                  {operatorActionBusy === 'rebuild_content_lead' ? 'Rebuilding...' : 'Rebuild Content\u2192Lead'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleRebuildLeadDeal()}
                  disabled={
                    contentMetricsSource !== 'api'
                    || operatorActionBusy !== null
                    || Boolean(rebuildLeadDealControl?.isCoolingDown)
                  }
                >
                  {operatorActionBusy === 'rebuild_lead_deal' ? 'Rebuilding...' : 'Rebuild Lead\u2192Deal'}
                </Button>
              </div>

              <div className="space-y-1">
                {generateActionsControl?.lastRun && (
                  <p className="text-[11px] text-muted-foreground">
                    Regenerate Actions: {generateActionsControl.lastRun.status} at {formatDateTime(generateActionsControl.lastRun.startedAt)}
                    {generateActionsControl.lastRun.errorCode ? ` [${generateActionsControl.lastRun.errorCode}]` : ''}
                    {generateActionsControl.isCoolingDown && generateActionsControl.cooldownUntil ? ` � cooldown until ${formatDateTime(generateActionsControl.cooldownUntil)}` : ''}
                  </p>
                )}
                {rebuildContentLeadControl?.lastRun && (
                  <p className="text-[11px] text-muted-foreground">
                    Rebuild Content\u2192Lead: {rebuildContentLeadControl.lastRun.status} at {formatDateTime(rebuildContentLeadControl.lastRun.startedAt)}
                    {rebuildContentLeadControl.lastRun.errorCode ? ` [${rebuildContentLeadControl.lastRun.errorCode}]` : ''}
                    {rebuildContentLeadControl.isCoolingDown && rebuildContentLeadControl.cooldownUntil ? ` � cooldown until ${formatDateTime(rebuildContentLeadControl.cooldownUntil)}` : ''}
                  </p>
                )}
                {rebuildLeadDealControl?.lastRun && (
                  <p className="text-[11px] text-muted-foreground">
                    Rebuild Lead\u2192Deal: {rebuildLeadDealControl.lastRun.status} at {formatDateTime(rebuildLeadDealControl.lastRun.startedAt)}
                    {rebuildLeadDealControl.lastRun.errorCode ? ` [${rebuildLeadDealControl.lastRun.errorCode}]` : ''}
                    {rebuildLeadDealControl.isCoolingDown && rebuildLeadDealControl.cooldownUntil ? ` � cooldown until ${formatDateTime(rebuildLeadDealControl.cooldownUntil)}` : ''}
                  </p>
                )}
              </div>

              {operatorFeedback && (
                <p
                  className={`text-xs ${
                    operatorFeedback.type === 'success'
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {operatorFeedback.message}{operatorFeedback.cooldownUntil ? ` Cooldown until ${formatDateTime(operatorFeedback.cooldownUntil)}.` : ''}
                </p>
              )}
              {pilotReadinessError && (
                <p className="text-xs text-rose-700 dark:text-rose-300">
                  {pilotReadinessError}
                </p>
              )}

              {pilotReadiness ? (
                <div className="space-y-2">
                  {pilotReadiness.gates.map((gate) => (
                    <div key={gate.gate} className="rounded-md border border-border/60 p-2 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{formatGateLabel(gate.gate)}</span>
                        <Badge
                          variant="outline"
                          className={
                            gate.status === 'green'
                              ? 'border-emerald-400/70 text-emerald-700'
                              : gate.status === 'yellow'
                                ? 'border-amber-400/70 text-amber-700'
                                : 'border-rose-400/70 text-rose-700'
                          }
                        >
                          {gate.status}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Observed: {formatObservedPreview(gate.observed)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Rule G/Y/R: {gate.rule.green} | {gate.rule.yellow} | {gate.rule.red}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{gate.reason}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {contentMetricsSource === 'api'
                    ? 'Pilot readiness is loading or unavailable.'
                    : 'Switch to API mode to view pilot readiness and run controls.'}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="chrona-surface">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Action Queue</CardTitle>
                <CardDescription>
                  Rule-based owner workflow from current marketing diagnostics.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={() => void handleGenerateActions()}
                disabled={actionsBusy || operatorActionBusy !== null || contentMetricsSource !== 'api'}
              >
                Generate From Diagnostics
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={actionQueueFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setActionQueueFilter('all')}
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={actionQueueFilter === 'marketing' ? 'default' : 'outline'}
                  onClick={() => setActionQueueFilter('marketing')}
                >
                  Marketing
                </Button>
                <Button
                  size="sm"
                  variant={actionQueueFilter === 'lead_deal' ? 'default' : 'outline'}
                  onClick={() => setActionQueueFilter('lead_deal')}
                >
                  Lead→Deal
                </Button>
              </div>

              {contentMetricsSource === 'api' && weeklyReview ? (
                <div className="rounded-md border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground">
                    Weekly review: {weeklyReview.weekStart} - {weeklyReview.weekEnd}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline">Created: {weeklyReview.summary.createdThisWeek}</Badge>
                    <Badge variant="outline">Done: {weeklyReview.summary.completedThisWeek}</Badge>
                    <Badge variant="outline">Overdue open: {weeklyReview.summary.overdueOpen}</Badge>
                    <Badge variant="outline">Stale open: {weeklyReview.summary.staleOpen}</Badge>
                    <Badge variant="outline">Escalated open: {weeklyReview.summary.escalatedOpen}</Badge>
                  </div>
                </div>
              ) : null}

              {contentMetricsSource !== 'api' ? (
                <p className="text-sm text-muted-foreground">
                  API mode is required to load diagnostics-based actions.
                </p>
              ) : filteredActionItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No actions for this filter. Generate suggestions from current diagnostics.
                </p>
              ) : (
                filteredActionItems.slice(0, 8).map((item) => {
                  const draft = actionDrafts[item.id] ?? {
                    owner: item.owner || '',
                    dueDate: item.dueDate || '',
                    status: item.status,
                    closureNote: item.closureNote || '',
                    closureEvidenceText:
                      typeof item.closureEvidence === 'string'
                        ? item.closureEvidence
                        : item.closureEvidence
                          ? JSON.stringify(item.closureEvidence)
                          : '',
                  };
                  return (
                    <div key={item.id} className="rounded-md border border-border/60 p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{draft.status}</Badge>
                        <Badge variant="outline">
                          {item.diagnostic.type === 'lead_deal_linkage' ? 'Lead→Deal' : 'Marketing'}
                        </Badge>
                        {item.signals?.isOverdue ? (
                          <Badge variant="destructive">Overdue ({item.signals.daysOverdue}d)</Badge>
                        ) : null}
                        {!item.signals?.isOverdue && item.signals?.isEscalated ? (
                          <Badge variant="destructive">Escalated</Badge>
                        ) : null}
                        {item.signals?.isStale ? (
                          <Badge variant="outline">Stale ({item.signals.daysSinceUpdate}d)</Badge>
                        ) : null}
                        <span className="text-sm font-medium text-foreground">{item.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.description}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Trace: {item.diagnostic.type} / {item.diagnostic.sourceBlock} / {item.diagnostic.key}
                      </p>
                      <div className="grid gap-2 md:grid-cols-3">
                        <Input
                          value={draft.owner}
                          placeholder="Owner"
                          onChange={(e) =>
                            setActionDrafts((prev) => ({
                              ...prev,
                              [item.id]: { ...draft, owner: e.target.value },
                            }))
                          }
                        />
                        <Input
                          type="date"
                          value={draft.dueDate}
                          onChange={(e) =>
                            setActionDrafts((prev) => ({
                              ...prev,
                              [item.id]: { ...draft, dueDate: e.target.value },
                            }))
                          }
                        />
                        <select
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                          value={draft.status}
                          onChange={(e) =>
                            setActionDrafts((prev) => ({
                              ...prev,
                              [item.id]: { ...draft, status: e.target.value as ActionItem['status'] },
                            }))
                          }
                        >
                          <option value="open">open</option>
                          <option value="in_progress">in_progress</option>
                          <option value="done">done</option>
                        </select>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <Textarea
                          value={draft.closureNote}
                          placeholder="Closure note (required when setting done)"
                          onChange={(e) =>
                            setActionDrafts((prev) => ({
                              ...prev,
                              [item.id]: { ...draft, closureNote: e.target.value },
                            }))
                          }
                        />
                        <Textarea
                          value={draft.closureEvidenceText}
                          placeholder="Closure evidence (optional: links/refs/text)"
                          onChange={(e) =>
                            setActionDrafts((prev) => ({
                              ...prev,
                              [item.id]: { ...draft, closureEvidenceText: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleUpdateAction(item.id)}
                          disabled={actionsBusy}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="chrona-surface border-l-[3px] border-l-amber-400/70">
            <CardHeader>
              <CardTitle>Диагностика связей до денег</CardTitle>
              <CardDescription>
                Где рвётся цепочка атрибуции оплаты: оплата → счет → сделка → лид → источник.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  Полная связка оплат: {linkageDiagnostics.fullyLinkedPayments}/{linkageDiagnostics.totalPayments}
                </Badge>
                <Badge variant="outline">
                  Покрытие: {linkageDiagnostics.linkageCoveragePercent}%
                </Badge>
              </div>

              {linkageDiagnostics.topBreakReasons.length > 0 ? (
                <div className="space-y-2">
                  {linkageDiagnostics.topBreakReasons.map((r) => (
                    <div key={r.label} className="flex items-center justify-between chrona-muted-surface">
                      <span className="text-sm text-muted-foreground">{r.label}</span>
                      <Badge variant="outline" className="text-xs">{r.count}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Разрывов связей по оплатам не обнаружено.</p>
              )}

              <div className="space-y-1">
                {linkageDiagnostics.actions.slice(0, 3).map((a, idx) => (
                  <p key={idx} className="text-xs text-muted-foreground">- {a}</p>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="chrona-surface">
            <CardHeader>
              <CardTitle>История загрузок</CardTitle>
              <CardDescription>
                Последние импорты маркетинговых файлов
              </CardDescription>
            </CardHeader>
            <CardContent>
              {marketingUploads.length === 0 ? (
                <div className="h-40 flex items-center justify-center bg-muted/30 rounded-md border border-border/60">
                  <p className="text-muted-foreground">Маркетинговые загрузки пока отсутствуют</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {Array.from(uploadsByType.entries()).map(([type, count]) => (
                      <Badge key={type} variant="secondary" className="text-xs">
                        {fileTypeLabel(type)}: {count}
                      </Badge>
                    ))}
                  </div>

                  {latestUpload && (
                    <p className="text-xs text-muted-foreground">
                      Последняя загрузка: {latestUpload.originalFileName} · {formatDateTime(latestUpload.createdAt)}
                    </p>
                  )}

                  <div className="chrona-table">
                  <table className="text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Тип</th>
                        <th className="px-4 py-3 font-medium">Файл</th>
                        <th className="px-4 py-3 font-medium">Статус</th>
                        <th className="px-4 py-3 font-medium">Строк</th>
                        <th className="px-4 py-3 font-medium">Успешно</th>
                        <th className="px-4 py-3 font-medium">Ошибки</th>
                        <th className="px-4 py-3 font-medium">Загружен</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketingUploads.map((upload) => (
                        <tr key={upload.id}>
                          <td className="px-4 py-3 text-muted-foreground">{fileTypeLabel(upload.fileType)}</td>
                          <td className="px-4 py-3 text-foreground font-medium">{upload.originalFileName}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClasses(upload.status)}`}
                            >
                              {formatUploadStatus(upload.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{upload.totalRows}</td>
                          <td className="px-4 py-3 text-muted-foreground">{upload.successRows}</td>
                          <td className="px-4 py-3 text-muted-foreground">{upload.errorRows}</td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDateTime(upload.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="chrona-surface">
            <CardHeader>
              <CardTitle>Базовые записи расходов</CardTitle>
              <CardDescription>
                Источник для метрик затрат и сравнения периодов.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                <div className="flex-1">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск по месяцу, например 2026-03"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="month">Сортировка: месяц</option>
                    <option value="amount">Сортировка: сумма</option>
                  </select>

                  <select
                    value={sortDirection}
                    onChange={(e) => setSortDirection(e.target.value as SortDirection)}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="desc">По убыванию</option>
                    <option value="asc">По возрастанию</option>
                  </select>
                </div>
              </div>

              {filteredRows.length === 0 ? (
                <div className="h-56 flex items-center justify-center bg-muted/30 rounded-md border border-border/60">
                  <p className="text-muted-foreground">
                    По текущему фильтру записи не найдены
                  </p>
                </div>
              ) : (
                <div className="chrona-table">
                  <table className="text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Месяц</th>
                        <th className="px-4 py-3 font-medium">Сумма</th>
                        <th className="px-4 py-3 font-medium">Upload ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-3 text-foreground font-medium">{row.month}</td>
                          <td className="px-4 py-3 text-muted-foreground">{formatKZT(row.amount)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{row.uploadId || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-muted-foreground">
                <span>Показано записей: {filteredRows.length}</span>
                <span>Всего в хранилище: {marketingRows.length}</span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}




