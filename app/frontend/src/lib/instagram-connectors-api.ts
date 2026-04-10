import { getAPIBaseURL } from './config';

export interface InstagramSource {
  id: string;
  companyId: string;
  platform: string;
  sourceLabel: string | null;
  accountExternalId: string | null;
  accountUsername: string | null;
  accountName: string | null;
  connectionState: string | null;
  lastSyncRequestedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSyncStatus: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstagramSourceSyncRun {
  id: string;
  companyId: string;
  connectorSourceId: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  requestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  rowCounts: {
    received: number;
    inserted: number;
    updated: number;
    rejected: number;
  };
  trustSummary: {
    exact: number;
    fallback: number;
    incomplete: number;
  };
  sourceProvenance: {
    sourceType: string | null;
    sourceName: string | null;
    sourceAccountRef: string | null;
    accountExternalId: string | null;
    platform: string | null;
  };
  errorMessage: string | null;
}

export interface InstagramSourceConnectionContract {
  state: 'draft' | 'configured' | 'auth_required' | 'active' | 'paused' | 'error';
  stateReason: string | null;
  stateChangedAt: string | null;
  credentialSchemaVersion: string | null;
  credentialPresence: boolean;
  credentialRef: string | null;
  credentialExpiresAt: string | null;
  lastContractValidatedAt: string | null;
  lastContractValidationStatus: 'unknown' | 'valid' | 'invalid';
  lastContractValidationMessage: string | null;
}

interface InstagramSourcesListResponse {
  ok: boolean;
  error?: string;
  sources?: InstagramSource[];
}

interface InstagramSourceRunsListResponse {
  ok: boolean;
  error?: string;
  total?: number;
  runs?: InstagramSourceSyncRun[];
}

interface InstagramSourceConnectionResponse {
  ok: boolean;
  error?: string;
  connection?: InstagramSourceConnectionContract | null;
}

interface ApiErrorResponse {
  ok?: boolean;
  error?: string;
  details?: unknown;
}

export class InstagramConnectorApiError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message);
    this.name = 'InstagramConnectorApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

async function parseApiError(response: Response, fallbackCode: string): Promise<never> {
  let payload: ApiErrorResponse | null = null;
  try {
    payload = (await response.json()) as ApiErrorResponse;
  } catch {
    payload = null;
  }
  throw new InstagramConnectorApiError(
    payload?.error || `Request failed: HTTP ${response.status}`,
    response.status,
    fallbackCode,
    payload?.details,
  );
}

export interface ManualInstagramSourceSyncRequest {
  companyId: string;
  rows: Array<Record<string, unknown>>;
}

export interface ManualInstagramSourceSyncResponse {
  ok: boolean;
  statusCode?: number;
  reused?: boolean;
  replayed?: boolean;
  replayIdentity?: {
    type?: string;
    key?: string;
  };
  job?: {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    requestedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    failedAt: string | null;
  };
  result?: {
    processed?: number;
    inserted?: number;
    updated?: number;
    trustSummary?: {
      exact?: number;
      fallback?: number;
      incomplete?: number;
    };
  };
}

export async function fetchInstagramSourcesFromApi(
  companyId: string,
  signal?: AbortSignal,
): Promise<InstagramSource[]> {
  const base = getAPIBaseURL() || '';
  const endpoint = `${base}/api/connectors/instagram/sources?companyId=${encodeURIComponent(companyId)}&limit=50`;
  const response = await fetch(endpoint, { signal });
  if (!response.ok) {
    await parseApiError(response, 'sources_list_failed');
  }

  const payload = (await response.json()) as InstagramSourcesListResponse;
  if (!payload.ok) {
    throw new InstagramConnectorApiError(
      payload.error || 'Failed to load Instagram sources',
      400,
      'sources_list_not_ok',
    );
  }

  return payload.sources || [];
}

export async function fetchInstagramSourceSyncRunsFromApi(
  companyId: string,
  sourceId: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<{ total: number; runs: InstagramSourceSyncRun[] }> {
  const base = getAPIBaseURL() || '';
  const limit = Math.max(1, Math.min(50, Number(options?.limit) || 5));
  const endpoint = `${base}/api/connectors/instagram/sources/${encodeURIComponent(sourceId)}/sync-runs?companyId=${encodeURIComponent(companyId)}&limit=${limit}`;
  const response = await fetch(endpoint, { signal: options?.signal });
  if (!response.ok) {
    await parseApiError(response, 'sync_runs_list_failed');
  }

  const payload = (await response.json()) as InstagramSourceRunsListResponse;
  if (!payload.ok) {
    throw new InstagramConnectorApiError(
      payload.error || 'Failed to load source sync history',
      400,
      'sync_runs_list_not_ok',
    );
  }

  return {
    total: Number(payload.total ?? 0),
    runs: payload.runs || [],
  };
}

export async function triggerInstagramSourceManualSyncFromApi(
  sourceId: string,
  payload: ManualInstagramSourceSyncRequest,
): Promise<ManualInstagramSourceSyncResponse> {
  const base = getAPIBaseURL() || '';
  const endpoint = `${base}/api/connectors/instagram/sources/${encodeURIComponent(sourceId)}/sync-runs?companyId=${encodeURIComponent(payload.companyId)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId: payload.companyId,
      rows: payload.rows,
      sourceType: 'instagram_source_manual',
      sourceName: 'marketing_data_manual_sync',
    }),
  });
  if (!response.ok) {
    await parseApiError(response, 'manual_sync_failed');
  }

  const body = (await response.json()) as ManualInstagramSourceSyncResponse & ApiErrorResponse;
  if (!body.ok) {
    throw new InstagramConnectorApiError(
      body.error || 'Manual sync failed',
      Number(body.statusCode) || 400,
      'manual_sync_not_ok',
      body.details,
    );
  }
  return body;
}

/** Full browser navigation — OAuth redirect must hit the backend origin. */
export function getInstagramOAuthStartUrl(companyId: string): string {
  const base = getAPIBaseURL() || '';
  return `${base}/api/connectors/instagram/oauth/start?companyId=${encodeURIComponent(companyId)}`;
}

export interface LivePullResponse {
  ok: boolean;
  statusCode?: number;
  error?: string;
  companyId?: string;
  sourceId?: string;
  message?: string;
  livePull?: {
    igUserId?: string;
    mediaReceived?: number;
    rowsMapped?: number;
    skipped?: string[];
    graphPaging?: boolean;
  };
  ingestion?: {
    processed?: number;
    inserted?: number;
    updated?: number;
    trustSummary?: { exact?: number; fallback?: number; incomplete?: number };
    reused?: boolean;
    replayed?: boolean;
    job?: { id?: string; status?: string };
  } | null;
}

export async function triggerInstagramLivePullFromApi(
  sourceId: string,
  companyId: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<LivePullResponse> {
  const base = getAPIBaseURL() || '';
  const endpoint = `${base}/api/connectors/instagram/sources/${encodeURIComponent(sourceId)}/live-pull?companyId=${encodeURIComponent(companyId)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: options?.limit ?? 25 }),
    signal: options?.signal,
  });

  const body = (await response.json()) as LivePullResponse & ApiErrorResponse;
  if (!response.ok || body.ok === false) {
    throw new InstagramConnectorApiError(
      body.error || `Live pull failed: HTTP ${response.status}`,
      response.status,
      'live_pull_failed',
      body.details ?? body,
    );
  }
  return body;
}

export async function fetchInstagramSourceConnectionContractFromApi(
  companyId: string,
  sourceId: string,
  signal?: AbortSignal,
): Promise<InstagramSourceConnectionContract | null> {
  const base = getAPIBaseURL() || '';
  const endpoint = `${base}/api/connectors/instagram/sources/${encodeURIComponent(sourceId)}/connection?companyId=${encodeURIComponent(companyId)}`;
  const response = await fetch(endpoint, { signal });
  if (!response.ok) {
    await parseApiError(response, 'connection_contract_failed');
  }

  const payload = (await response.json()) as InstagramSourceConnectionResponse;
  if (!payload.ok) {
    throw new InstagramConnectorApiError(
      payload.error || 'Failed to load source connection contract',
      400,
      'connection_contract_not_ok',
    );
  }
  return payload.connection ?? null;
}
