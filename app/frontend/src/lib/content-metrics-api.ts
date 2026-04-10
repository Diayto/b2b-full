import { getAPIBaseURL } from './config';
import type { ContentMetric } from './analytics/domain';

export type ContentMetricsReadMode = 'api' | 'local';
export type ActionItemStatus = 'open' | 'in_progress' | 'done';

export interface ActionItem {
  id: string;
  companyId: string;
  title: string;
  description?: string;
  status: ActionItemStatus;
  owner?: string;
  dueDate?: string;
  diagnostic: {
    type: string;
    key: string;
    sourceBlock: string;
    evidence: Record<string, unknown>;
  };
  relatedEntity?: { type?: string; id?: string } | null;
  suggestedByRule?: string;
  closureNote?: string | null;
  closureEvidence?: unknown;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  reviewedAt?: string | null;
  signals?: {
    isOverdue: boolean;
    daysOverdue: number;
    isStale: boolean;
    daysSinceUpdate: number;
    isEscalated: boolean;
  };
}

export interface WeeklyActionReviewSummary {
  createdThisWeek: number;
  completedThisWeek: number;
  openCount: number;
  inProgressCount: number;
  doneCount: number;
  overdueOpen: number;
  staleOpen: number;
  escalatedOpen: number;
  byDiagnosticType: Array<{ diagnosticType: string; count: number }>;
  topDiagnosticReasons: Array<{ reason: string; count: number }>;
}

export interface PilotReadinessGate {
  gate: string;
  observed: Record<string, unknown> | null;
  rule: {
    green: string;
    yellow: string;
    red: string;
  };
  status: 'green' | 'yellow' | 'red';
  reason: string;
}

export interface PilotReadinessSummary {
  companyId: string;
  evaluatedAt: string;
  overallStatus: 'green' | 'yellow' | 'red';
  gateCounts: {
    green: number;
    yellow: number;
    red: number;
  };
  gates: PilotReadinessGate[];
  operatorControls?: {
    evaluatedAt: string;
    actions: Array<{
      actionType: 'generate_actions' | 'rebuild_content_lead' | 'rebuild_lead_deal';
      label: string;
      cooldownSeconds: number;
      isCoolingDown: boolean;
      cooldownUntil: string | null;
      lastRun: {
        id: string;
        actionType: string;
        status: 'running' | 'completed' | 'failed' | 'blocked_cooldown';
        startedAt: string;
        completedAt: string | null;
        cooldownUntil: string | null;
        errorCode: string | null;
        errorMessage: string | null;
        resultSummary: Record<string, unknown> | null;
      } | null;
    }>;
    consistencyChecks?: {
      parameters: {
        staleRunningMinutes: number;
        lookbackHours: number;
        evaluatedAt: string;
      };
      staleRunning: {
        count: number;
        byAction: Array<{ actionType: string; count: number }>;
      };
      cooldownConsistency: {
        inconsistentRows: number;
      };
      recentFailureConcentration: {
        failedCount: number;
        completedCount: number;
        blockedCooldownCount: number;
        attempts: number;
        failureRatePercent: number;
        windowStart: string;
        windowEnd: string;
      };
      warnings: Array<{
        check: string;
        severity: 'warning';
        message: string;
      }>;
    };
  };
}

export interface OperatorErrorPayload {
  code: string;
  message: string;
  details?: unknown;
  actionType?: string | null;
  cooldownUntil?: string | null;
  lastRun?: unknown;
}

export interface ContentMetricsDiagnostics {
  totalRows: number;
  avgCompletenessScore: number;
  confidenceBreakdown: {
    exact: number;
    fallback: number;
    incomplete: number;
  };
  linkageBreakdown: {
    unlinked: number;
    partiallyLinked: number;
    linked: number;
  };
  topDiagnosticFlags: Array<{ flag: string; count: number }>;
  leadLinkageBridge?: {
    totalLeads: number;
    linkedLeads: number;
    unlinkedLeads: number;
    linkageCoveragePercent: number;
    methodBreakdown: {
      explicit_lead_link_key: number;
      channel_date_window: number;
    };
    confidenceBreakdown: {
      exact: number;
      fallback: number;
      incomplete: number;
    };
    topUnlinkedReasons: Array<{ reason: string; count: number }>;
  } | null;
  freshness?: {
    lastIngestedAt: string | null;
    daysSinceLastIngest: number | null;
    latestPublishedAt: string | null;
    daysSinceLatestPublishedContent: number | null;
  } | null;
  ingestionHealth?: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    runningJobs: number;
    pendingJobs: number;
    lastCompletedAt: string | null;
    lastFailedAt: string | null;
    latestJob: {
      id: string;
      status: 'pending' | 'running' | 'completed' | 'failed';
      requestedAt: string;
      sourceType: string | null;
      sourceName: string | null;
      sourceAccountRef: string | null;
      source: {
        sourceUploadId: string | null;
        sourceFileName: string | null;
        sourceFileHash: string | null;
        sourceDataFrom: string | null;
        sourceDataTo: string | null;
        parserVersion: string | null;
        normalizationVersion: string | null;
      } | null;
    } | null;
  } | null;
  instagramSourceSummary?: {
    hasInstagramSourceData: boolean;
    totalInstagramSourceRows: number;
    sourceIdentityBreakdown?: {
      instagramSource: number;
      fileUpload: number;
      other: number;
    } | null;
    latestSourceBoundSyncRun?: {
      sourceId?: string | null;
      jobId: string;
      status: 'pending' | 'running' | 'completed' | 'failed';
      requestedAt: string | null;
      startedAt: string | null;
      completedAt: string | null;
      failedAt: string | null;
    } | null;
    sources?: Array<{
      sourceId: string;
      connectorSourceId?: string | null;
      sourceDisplayName: string | null;
      accountExternalId: string | null;
      rowCount: number;
      lastIngestedAt: string | null;
      latestPublishedAt: string | null;
      latestSyncRun?: {
        jobId: string;
        status: 'pending' | 'running' | 'completed' | 'failed';
        requestedAt: string | null;
        startedAt: string | null;
        completedAt: string | null;
        failedAt: string | null;
      } | null;
    }>;
  } | null;
}

interface ApiContentMetricRow {
  id: string;
  companyId: string;
  platform: ContentMetric['platform'];
  contentId: string;
  contentTitle?: string;
  publishedAt: string;
  impressions: number;
  reach: number;
  profileVisits: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  inboundMessages: number;
  leadsGenerated: number;
  dealsGenerated: number;
  paidConversions: number;
  channelCampaignExternalId?: string;
  sourceUploadId?: string;
}

interface ContentMetricsListResponse {
  ok: boolean;
  rows: ApiContentMetricRow[];
}

interface ActionItemsListResponse {
  ok: boolean;
  items: ActionItem[];
}

interface ActionItemUpdateResponse {
  ok: boolean;
  item: ActionItem;
}

interface WeeklyReviewResponse {
  ok: boolean;
  weekStart: string;
  weekEnd: string;
  summary: WeeklyActionReviewSummary;
}

interface PilotReadinessResponse {
  ok: boolean;
  companyId: string;
  evaluatedAt: string;
  overallStatus: 'green' | 'yellow' | 'red';
  gateCounts: {
    green: number;
    yellow: number;
    red: number;
  };
  gates: PilotReadinessGate[];
  operatorControls?: PilotReadinessSummary['operatorControls'];
}

interface OperatorErrorResponse {
  ok?: boolean;
  error?: string;
  operatorError?: OperatorErrorPayload;
}

export class OperatorActionError extends Error {
  code: string;
  statusCode: number;
  cooldownUntil: string | null;
  actionType: string | null;

  constructor({
    code,
    message,
    statusCode,
    cooldownUntil,
    actionType,
  }: {
    code: string;
    message: string;
    statusCode: number;
    cooldownUntil?: string | null;
    actionType?: string | null;
  }) {
    super(message);
    this.name = 'OperatorActionError';
    this.code = code;
    this.statusCode = statusCode;
    this.cooldownUntil = cooldownUntil ?? null;
    this.actionType = actionType ?? null;
  }
}

async function throwOperatorError(response: Response, fallbackMessage: string): Promise<never> {
  let payload: OperatorErrorResponse | null = null;
  try {
    payload = (await response.json()) as OperatorErrorResponse;
  } catch {
    payload = null;
  }
  const operatorError = payload?.operatorError;
  throw new OperatorActionError({
    code: operatorError?.code || 'request_failed',
    message: operatorError?.message || payload?.error || fallbackMessage,
    statusCode: response.status,
    cooldownUntil: operatorError?.cooldownUntil ?? null,
    actionType: operatorError?.actionType ?? null,
  });
}

interface ContentMetricsDiagnosticsResponse {
  ok: boolean;
  summary: {
    totalRows: number;
    avgCompletenessScore: number;
    confidenceBreakdown: {
      exact: number;
      fallback: number;
      incomplete: number;
    };
    linkageBreakdown: {
      unlinked: number;
      partiallyLinked: number;
      linked: number;
    };
  };
  topDiagnosticFlags: Array<{ flag: string; count: number }>;
  leadLinkageBridge?: ContentMetricsDiagnostics['leadLinkageBridge'];
  freshness?: ContentMetricsDiagnostics['freshness'];
  ingestionHealth?: ContentMetricsDiagnostics['ingestionHealth'];
  instagramSourceSummary?: ContentMetricsDiagnostics['instagramSourceSummary'];
}

export function getContentMetricsReadMode(): ContentMetricsReadMode {
  const envMode = String(import.meta.env.VITE_CONTENT_METRICS_READ_MODE || '').toLowerCase();
  if (envMode === 'api') return 'api';

  try {
    const localMode = String(localStorage.getItem('bp_content_metrics_read_mode') || '').toLowerCase();
    if (localMode === 'api') return 'api';
  } catch {
    // ignore localStorage access issues
  }

  return 'local';
}

function mapApiRowToContentMetric(row: ApiContentMetricRow): ContentMetric {
  return {
    id: row.id,
    companyId: row.companyId,
    platform: row.platform,
    contentId: row.contentId,
    contentTitle: row.contentTitle,
    publishedAt: row.publishedAt,
    impressions: row.impressions,
    reach: row.reach,
    profileVisits: row.profileVisits,
    likes: row.likes,
    comments: row.comments,
    saves: row.saves,
    shares: row.shares,
    inboundMessages: row.inboundMessages,
    leadsGenerated: row.leadsGenerated,
    dealsGenerated: row.dealsGenerated,
    paidConversions: row.paidConversions,
    channelCampaignExternalId: row.channelCampaignExternalId,
    uploadId: row.sourceUploadId,
  };
}

export async function fetchContentMetricsFromApi(
  companyId: string,
  signal?: AbortSignal,
): Promise<ContentMetric[]> {
  const base = getAPIBaseURL();
  const endpoint = `${base}/api/content-metrics?companyId=${encodeURIComponent(companyId)}&limit=1000`;
  const response = await fetch(endpoint, { signal });
  if (!response.ok) {
    throw new Error(`API content-metrics request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ContentMetricsListResponse;
  if (!payload.ok) {
    throw new Error('API content-metrics response not ok');
  }

  return (payload.rows || []).map(mapApiRowToContentMetric);
}

export async function fetchContentMetricsDiagnosticsFromApi(
  companyId: string,
  signal?: AbortSignal,
): Promise<ContentMetricsDiagnostics> {
  const base = getAPIBaseURL();
  const endpoint = `${base}/api/content-metrics/diagnostics?companyId=${encodeURIComponent(companyId)}`;
  const response = await fetch(endpoint, { signal });
  if (!response.ok) {
    throw new Error(`API content-metrics diagnostics request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ContentMetricsDiagnosticsResponse;
  if (!payload.ok) {
    throw new Error('API content-metrics diagnostics response not ok');
  }

  return {
    totalRows: payload.summary.totalRows,
    avgCompletenessScore: payload.summary.avgCompletenessScore,
    confidenceBreakdown: payload.summary.confidenceBreakdown,
    linkageBreakdown: payload.summary.linkageBreakdown,
    topDiagnosticFlags: payload.topDiagnosticFlags || [],
    leadLinkageBridge: payload.leadLinkageBridge ?? null,
    freshness: payload.freshness ?? null,
    ingestionHealth: payload.ingestionHealth ?? null,
    instagramSourceSummary: payload.instagramSourceSummary ?? null,
  };
}

export async function fetchActionItemsFromApi(
  companyId: string,
  signal?: AbortSignal,
): Promise<ActionItem[]> {
  const base = getAPIBaseURL();
  const endpoint = `${base}/api/actions?companyId=${encodeURIComponent(companyId)}&limit=50`;
  const response = await fetch(endpoint, { signal });
  if (!response.ok) {
    throw new Error(`API actions request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ActionItemsListResponse;
  if (!payload.ok) {
    throw new Error('API actions response not ok');
  }
  return payload.items || [];
}

export async function generateActionItemsFromDiagnosticsApi(companyId: string): Promise<void> {
  const base = getAPIBaseURL();
  const endpoint = `${base}/api/actions/from-diagnostics`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId }),
  });
  if (!response.ok) {
    await throwOperatorError(response, 'Failed to regenerate actions.');
  }

  const payload = (await response.json()) as { ok: boolean; operatorError?: OperatorErrorPayload };
  if (!payload.ok) {
    throw new OperatorActionError({
      code: payload.operatorError?.code || 'operation_failed',
      message: payload.operatorError?.message || 'Failed to regenerate actions.',
      statusCode: 400,
      cooldownUntil: payload.operatorError?.cooldownUntil ?? null,
      actionType: payload.operatorError?.actionType ?? null,
    });
  }
}

export async function updateActionItemApi(
  actionId: string,
  companyId: string,
  patch: { status?: ActionItemStatus; owner?: string; dueDate?: string; closureNote?: string; closureEvidence?: unknown },
): Promise<ActionItem> {
  const base = getAPIBaseURL();
  const endpoint = `${base}/api/actions/${encodeURIComponent(actionId)}?companyId=${encodeURIComponent(companyId)}`;
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw new Error(`API actions update request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ActionItemUpdateResponse;
  if (!payload.ok) {
    throw new Error('API actions update response not ok');
  }
  return payload.item;
}

export async function fetchWeeklyActionReviewFromApi(
  companyId: string,
  signal?: AbortSignal,
): Promise<{ weekStart: string; weekEnd: string; summary: WeeklyActionReviewSummary }> {
  const base = getAPIBaseURL();
  const endpoint = `${base}/api/actions/weekly-review?companyId=${encodeURIComponent(companyId)}`;
  const response = await fetch(endpoint, { signal });
  if (!response.ok) {
    throw new Error(`API weekly review request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as WeeklyReviewResponse;
  if (!payload.ok) {
    throw new Error('API weekly review response not ok');
  }
  return {
    weekStart: payload.weekStart,
    weekEnd: payload.weekEnd,
    summary: payload.summary,
  };
}

export async function fetchPilotReadinessFromApi(
  companyId: string,
  signal?: AbortSignal,
): Promise<PilotReadinessSummary> {
  const base = getAPIBaseURL();
  const endpoint = `${base}/api/system/pilot-readiness?companyId=${encodeURIComponent(companyId)}`;
  const response = await fetch(endpoint, { signal });
  if (!response.ok) {
    throw new Error(`API pilot-readiness request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as PilotReadinessResponse;
  if (!payload.ok) {
    throw new Error('API pilot-readiness response not ok');
  }

  return {
    companyId: payload.companyId,
    evaluatedAt: payload.evaluatedAt,
    overallStatus: payload.overallStatus,
    gateCounts: payload.gateCounts,
    gates: payload.gates || [],
    operatorControls: payload.operatorControls ?? { evaluatedAt: payload.evaluatedAt, actions: [] },
  };
}

export async function rebuildContentLeadLinkageApi(companyId: string): Promise<void> {
  const base = getAPIBaseURL();
  const endpoint = `${base}/api/content-metrics/linkage/leads/rebuild`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId }),
  });
  if (!response.ok) {
    await throwOperatorError(response, 'Failed to rebuild Content->Lead linkage.');
  }

  const payload = (await response.json()) as { ok: boolean; operatorError?: OperatorErrorPayload };
  if (!payload.ok) {
    throw new OperatorActionError({
      code: payload.operatorError?.code || 'operation_failed',
      message: payload.operatorError?.message || 'Failed to rebuild Content->Lead linkage.',
      statusCode: 400,
      cooldownUntil: payload.operatorError?.cooldownUntil ?? null,
      actionType: payload.operatorError?.actionType ?? null,
    });
  }
}

export async function rebuildLeadDealLinkageApi(companyId: string): Promise<void> {
  const base = getAPIBaseURL();
  const endpoint = `${base}/api/linkage/leads-deals/rebuild`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId }),
  });
  if (!response.ok) {
    await throwOperatorError(response, 'Failed to rebuild Lead->Deal linkage.');
  }

  const payload = (await response.json()) as { ok: boolean; operatorError?: OperatorErrorPayload };
  if (!payload.ok) {
    throw new OperatorActionError({
      code: payload.operatorError?.code || 'operation_failed',
      message: payload.operatorError?.message || 'Failed to rebuild Lead->Deal linkage.',
      statusCode: 400,
      cooldownUntil: payload.operatorError?.cooldownUntil ?? null,
      actionType: payload.operatorError?.actionType ?? null,
    });
  }
}
