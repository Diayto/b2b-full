import { decryptAccessTokenJson } from './token-crypto.js';

function graphOrigin(graphVersion) {
  const v = String(graphVersion || 'v21.0').replace(/^\//, '');
  return `https://graph.facebook.com/${v}`;
}

function toPublishedYmd(timestamp) {
  if (!timestamp) return null;
  const d = new Date(String(timestamp));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function clampLimit(raw, fallback, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

function mapMediaToRows(mediaList) {
  const rows = [];
  const skipped = [];
  for (const m of mediaList) {
    const id = m?.id != null ? String(m.id).trim() : '';
    if (!id) {
      skipped.push('missing_id');
      continue;
    }
    const publishedAt = toPublishedYmd(m.timestamp);
    if (!publishedAt) {
      skipped.push(`missing_timestamp:${id}`);
      continue;
    }
    const caption = typeof m.caption === 'string' ? m.caption.trim() : '';
    const likes = Number.isFinite(Number(m.like_count)) ? Math.max(0, Math.floor(Number(m.like_count))) : 0;
    const comments = Number.isFinite(Number(m.comments_count))
      ? Math.max(0, Math.floor(Number(m.comments_count)))
      : 0;

    rows.push({
      contentId: `ig_media_${id}`,
      platform: 'instagram',
      contentType: typeof m.media_type === 'string' ? m.media_type : undefined,
      contentTitle: caption.length > 0 ? caption.slice(0, 500) : undefined,
      publishedAt,
      likes,
      comments,
      parserVersion: 'meta_graph_ig_media_v1',
      normalizationVersion: 'ymd_from_timestamp_v1',
    });
  }
  return { rows, skipped };
}

export class InstagramLivePullService {
  constructor({ env, db, instagramSourcesService, contentMetricsIngestionService }) {
    this.env = env;
    this.db = db;
    this.instagramSourcesService = instagramSourcesService;
    this.contentMetricsIngestionService = contentMetricsIngestionService;
  }

  loadDecryptedAccessToken(instagramSourceId) {
    const row = this.db.prepare(`
      SELECT enc_payload
      FROM instagram_source_oauth_tokens
      WHERE instagram_source_id = ?
      LIMIT 1
    `).get(instagramSourceId);

    if (!row?.enc_payload) {
      return { ok: false, error: 'oauth_token_missing' };
    }

    try {
      const payload = decryptAccessTokenJson({
        keyHex: this.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY,
        encPayload: row.enc_payload,
      });
      const accessToken = payload?.accessToken;
      if (typeof accessToken !== 'string' || !accessToken.trim()) {
        return { ok: false, error: 'oauth_token_invalid' };
      }
      return { ok: true, accessToken: accessToken.trim() };
    } catch {
      return { ok: false, error: 'oauth_token_decrypt_failed' };
    }
  }

  async fetchIgMediaPage({ igUserId, accessToken, limit }) {
    const base = graphOrigin(this.env.META_GRAPH_VERSION);
    const u = new URL(`${base}/${encodeURIComponent(igUserId)}/media`);
    u.searchParams.set(
      'fields',
      'id,caption,media_type,permalink,timestamp,like_count,comments_count',
    );
    u.searchParams.set('limit', String(limit));
    u.searchParams.set('access_token', accessToken);

    const res = await fetch(u.toString(), { method: 'GET' });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const msg = data?.error?.message || data?.error?.error_user_msg || text || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.statusCode = res.status;
      err.graphError = data?.error;
      throw err;
    }
    return data;
  }

  /**
   * POST /api/connectors/instagram/sources/:sourceId/live-pull
   */
  async execute({
    companyId,
    sourceId,
    requestId,
    idempotencyKey,
    limit: limitRaw,
  }) {
    const companyIdNorm = String(companyId || '').trim();
    const sourceIdNorm = String(sourceId || '').trim();
    if (!companyIdNorm || !sourceIdNorm) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Missing companyId or sourceId',
      };
    }

    if (!this.env.INSTAGRAM_LIVE_OAUTH_ENABLED) {
      return {
        ok: false,
        statusCode: 503,
        error: 'Instagram live features are disabled',
        feature: 'instagram_live_pull',
      };
    }

    if (!this.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY) {
      return {
        ok: false,
        statusCode: 503,
        error: 'INSTAGRAM_TOKEN_ENCRYPTION_KEY is not configured',
        feature: 'instagram_live_pull',
      };
    }

    const sourceResult = this.instagramSourcesService.getById({
      companyId: companyIdNorm,
      sourceId: sourceIdNorm,
    });
    if (!sourceResult.ok) {
      return sourceResult;
    }

    const source = sourceResult.source;
    if (source.connectionState !== 'active') {
      return {
        ok: false,
        statusCode: 409,
        error: 'Source must be in active state for live pull',
        details: { connectionState: source.connectionState },
      };
    }
    if (!source.credentialPresence || source.credentialRef !== 'oauth_token:v1') {
      return {
        ok: false,
        statusCode: 409,
        error: 'Source has no OAuth credentials; complete Instagram OAuth first',
        details: { credentialPresence: source.credentialPresence, credentialRef: source.credentialRef },
      };
    }

    const tokenLoad = this.loadDecryptedAccessToken(source.id);
    if (!tokenLoad.ok) {
      return {
        ok: false,
        statusCode: 409,
        error: 'Could not load OAuth token for this source',
        details: { code: tokenLoad.error },
      };
    }

    const igUserId = String(source.accountExternalId || '').trim();
    if (!igUserId) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Source is missing accountExternalId (IG user id)',
      };
    }

    const limit = clampLimit(limitRaw, 25, 50);

    let graphData;
    try {
      graphData = await this.fetchIgMediaPage({
        igUserId,
        accessToken: tokenLoad.accessToken,
        limit,
      });
    } catch (e) {
      return {
        ok: false,
        statusCode: e.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 502,
        error: e.message || 'Graph API request failed',
        details: e.graphError ? { graph: e.graphError } : undefined,
      };
    }

    const mediaList = Array.isArray(graphData?.data) ? graphData.data : [];
    const { rows, skipped } = mapMediaToRows(mediaList);

    if (rows.length === 0) {
      return {
        ok: true,
        statusCode: 200,
        companyId: companyIdNorm,
        sourceId: source.id,
        livePull: {
          igUserId,
          mediaReceived: mediaList.length,
          rowsMapped: 0,
          skipped,
          graphPaging: graphData?.paging ? Boolean(graphData.paging.next) : false,
        },
        ingestion: null,
        message: mediaList.length === 0
          ? 'No media returned from Graph API for this account'
          : 'No rows could be mapped (check timestamps)',
      };
    }

    const payload = {
      companyId: companyIdNorm,
      rows,
      sourceType: 'instagram_source_live_pull',
      parserVersion: 'meta_graph_ig_media_v1',
      normalizationVersion: 'ymd_from_timestamp_v1',
    };

    const ingestionResult = this.contentMetricsIngestionService.ingestWithJob(payload, {
      requestId,
      idempotencyKey,
      connectorSource: {
        id: source.id,
        companyId: source.companyId,
        platform: source.platform,
        accountExternalId: source.accountExternalId,
        accountUsername: source.accountUsername,
        accountName: source.accountName,
        sourceLabel: source.sourceLabel,
        connectionState: source.connectionState,
      },
    });

    if (!ingestionResult.ok) {
      return {
        ...ingestionResult,
        companyId: companyIdNorm,
        sourceId: source.id,
        livePull: {
          igUserId,
          mediaReceived: mediaList.length,
          rowsMapped: rows.length,
          skipped,
        },
      };
    }

    const stats =
      ingestionResult.result && typeof ingestionResult.result === 'object'
        ? ingestionResult.result
        : ingestionResult;

    const job = ingestionResult.job;
    const compactJob = job
      ? {
        id: job.id,
        status: job.status,
        connectorSourceId: job.connectorSourceId,
        sourceType: job.sourceType,
        stats: job.stats,
        requestedAt: job.requestedAt,
        completedAt: job.completedAt,
        failedAt: job.failedAt,
        errorMessage: job.errorMessage,
      }
      : null;

    return {
      ok: true,
      statusCode: ingestionResult.statusCode ?? stats.statusCode ?? 200,
      companyId: companyIdNorm,
      sourceId: source.id,
      livePull: {
        igUserId,
        mediaReceived: mediaList.length,
        rowsMapped: rows.length,
        skipped,
        graphPaging: graphData?.paging ? Boolean(graphData.paging.next) : false,
      },
      ingestion: {
        processed: stats.processed,
        inserted: stats.inserted,
        updated: stats.updated,
        trustSummary: stats.trustSummary ?? ingestionResult.trustSummary,
        reused: Boolean(ingestionResult.reused),
        replayed: Boolean(ingestionResult.replayed),
        job: compactJob,
      },
    };
  }
}
