import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

const ENTITY_TYPE = 'content_metrics';
const JOB_STATUSES = {
  pending: 'pending',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
};

const jobRequestSchema = z.object({
  companyId: z.string().min(1),
  rows: z.array(z.any()).min(1).max(5000),
  sourceType: z.string().optional(),
  sourceName: z.string().optional(),
  sourceAccountRef: z.string().optional(),
  parserVersion: z.string().optional(),
  normalizationVersion: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

function normalizeText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeConnectorSourceContext(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const id = normalizeText(raw.id);
  const companyId = normalizeText(raw.companyId);
  const platform = normalizeText(raw.platform) ?? 'instagram';
  const accountExternalId = normalizeText(raw.accountExternalId);
  if (!id || !companyId || !accountExternalId) return null;

  return {
    id,
    companyId,
    platform,
    accountExternalId,
    accountUsername: normalizeText(raw.accountUsername),
    accountName: normalizeText(raw.accountName),
    sourceLabel: normalizeText(raw.sourceLabel),
    connectionState: normalizeText(raw.connectionState),
  };
}

function enrichRowsWithConnectorContext(rows, connectorSource) {
  if (!connectorSource) return rows;

  return rows.map((row) => ({
    ...row,
    sourceIdentityType: 'instagram_source',
    sourceConnectorId: connectorSource.id,
    sourceAccountExternalId: connectorSource.accountExternalId,
  }));
}

function collectSources(rows, fallbackParserVersion, fallbackNormalizationVersion, connectorSource) {
  const byKey = new Map();

  for (const row of rows) {
    const sourceUploadId = normalizeText(row?.sourceUploadId);
    const sourceFileName = normalizeText(row?.sourceFileName);
    const sourceFileHash = normalizeText(row?.sourceFileHash);
    const parserVersion = normalizeText(row?.parserVersion) ?? fallbackParserVersion ?? null;
    const normalizationVersion = normalizeText(row?.normalizationVersion) ?? fallbackNormalizationVersion ?? null;
    const publishedAt = normalizeText(row?.publishedAt);
    const sourceConnectorId = normalizeText(row?.sourceConnectorId) ?? connectorSource?.id ?? null;
    const sourceAccountExternalId =
      normalizeText(row?.sourceAccountExternalId) ?? connectorSource?.accountExternalId ?? null;
    const sourcePlatform = normalizeText(row?.platform) ?? connectorSource?.platform ?? null;
    const sourceSnapshotJson = sourceConnectorId
      ? JSON.stringify({
        connectorSourceId: sourceConnectorId,
        platform: sourcePlatform,
        accountExternalId: sourceAccountExternalId,
      })
      : null;

    const key = [
      sourceUploadId ?? '',
      sourceFileName ?? '',
      sourceFileHash ?? '',
      parserVersion ?? '',
      normalizationVersion ?? '',
      sourceConnectorId ?? '',
      sourceAccountExternalId ?? '',
      sourcePlatform ?? '',
    ].join('|');
    const existing = byKey.get(key) ?? {
      sourceUploadId,
      sourceFileName,
      sourceFileHash,
      parserVersion,
      normalizationVersion,
      sourceConnectorId,
      sourceAccountExternalId,
      sourcePlatform,
      sourceSnapshotJson,
      sourceDataFrom: null,
      sourceDataTo: null,
    };

    if (publishedAt) {
      if (!existing.sourceDataFrom || publishedAt < existing.sourceDataFrom) existing.sourceDataFrom = publishedAt;
      if (!existing.sourceDataTo || publishedAt > existing.sourceDataTo) existing.sourceDataTo = publishedAt;
    }

    byKey.set(key, existing);
  }

  return Array.from(byKey.values());
}

function hashString(input) {
  return createHash('sha256').update(input).digest('hex');
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value ?? '');
  } catch {
    return fallback;
  }
}

function buildSourceSignature(sources) {
  const normalized = [...sources]
    .map((source) => ({
      sourceUploadId: source.sourceUploadId ?? null,
      sourceFileName: source.sourceFileName ?? null,
      sourceFileHash: source.sourceFileHash ?? null,
      parserVersion: source.parserVersion ?? null,
      normalizationVersion: source.normalizationVersion ?? null,
      sourceConnectorId: source.sourceConnectorId ?? null,
      sourceAccountExternalId: source.sourceAccountExternalId ?? null,
      sourcePlatform: source.sourcePlatform ?? null,
      sourceDataFrom: source.sourceDataFrom ?? null,
      sourceDataTo: source.sourceDataTo ?? null,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  return hashString(JSON.stringify(normalized));
}

function buildRequestHash(payload) {
  const normalized = {
    companyId: payload.companyId,
    sourceType: normalizeText(payload.sourceType),
    sourceName: normalizeText(payload.sourceName),
    sourceAccountRef: normalizeText(payload.sourceAccountRef),
    connectorSourceId: normalizeText(payload.connectorSourceId),
    parserVersion: normalizeText(payload.parserVersion),
    normalizationVersion: normalizeText(payload.normalizationVersion),
    rows: payload.rows.map((row) => ({
      contentId: row.contentId ?? null,
      platform: row.platform ?? null,
      publishedAt: row.publishedAt ?? null,
      sourceUploadId: row.sourceUploadId ?? null,
      sourceFileName: row.sourceFileName ?? null,
      sourceFileHash: row.sourceFileHash ?? null,
      sourceIdentityType: row.sourceIdentityType ?? null,
      sourceConnectorId: row.sourceConnectorId ?? null,
      sourceAccountExternalId: row.sourceAccountExternalId ?? null,
      leadLinkKey: row.leadLinkKey ?? null,
      reach: Number(row.reach ?? 0),
      impressions: Number(row.impressions ?? 0),
      leadsGenerated: Number(row.leadsGenerated ?? 0),
      paidConversions: Number(row.paidConversions ?? 0),
    })),
  };

  return hashString(JSON.stringify(normalized));
}

function mapJobRow(jobRow, statsRow, sourceRows) {
  return {
    id: jobRow.id,
    companyId: jobRow.company_id,
    entityType: jobRow.entity_type,
    sourceType: jobRow.source_type,
    sourceName: jobRow.source_name,
    sourceAccountRef: jobRow.source_account_ref,
    connectorSourceId: jobRow.connector_source_id,
    status: jobRow.status,
    requestId: jobRow.request_id,
    idempotencyKey: jobRow.idempotency_key,
    errorMessage: jobRow.error_message,
    requestedAt: jobRow.requested_at,
    startedAt: jobRow.started_at,
    completedAt: jobRow.completed_at,
    failedAt: jobRow.failed_at,
    createdAt: jobRow.created_at,
    updatedAt: jobRow.updated_at,
    stats: {
      rowsReceived: Number(statsRow?.rows_received ?? 0),
      rowsInserted: Number(statsRow?.rows_inserted ?? 0),
      rowsUpdated: Number(statsRow?.rows_updated ?? 0),
      rowsRejected: Number(statsRow?.rows_rejected ?? 0),
      exactCount: Number(statsRow?.exact_count ?? 0),
      fallbackCount: Number(statsRow?.fallback_count ?? 0),
      incompleteCount: Number(statsRow?.incomplete_count ?? 0),
    },
    sources: sourceRows.map((row) => ({
      sourceUploadId: row.source_upload_id,
      sourceFileName: row.source_file_name,
      sourceFileHash: row.source_file_hash,
      sourceConnectorId: row.source_connector_id,
      sourceAccountExternalId: row.source_account_external_id,
      sourcePlatform: row.source_platform,
      sourceSnapshot: parseJson(row.source_snapshot_json, null),
      sourceDataFrom: row.source_data_from,
      sourceDataTo: row.source_data_to,
      parserVersion: row.parser_version,
      normalizationVersion: row.normalization_version,
    })),
  };
}

function mapSyncRunView(job) {
  const firstSource = Array.isArray(job.sources) && job.sources.length > 0 ? job.sources[0] : null;
  return {
    id: job.id,
    companyId: job.companyId,
    connectorSourceId: job.connectorSourceId,
    status: job.status,
    requestedAt: job.requestedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    failedAt: job.failedAt,
    rowCounts: {
      received: job.stats.rowsReceived,
      inserted: job.stats.rowsInserted,
      updated: job.stats.rowsUpdated,
      rejected: job.stats.rowsRejected,
    },
    trustSummary: {
      exact: job.stats.exactCount,
      fallback: job.stats.fallbackCount,
      incomplete: job.stats.incompleteCount,
    },
    sourceProvenance: {
      sourceType: job.sourceType,
      sourceName: job.sourceName,
      sourceAccountRef: job.sourceAccountRef,
      accountExternalId: firstSource?.sourceAccountExternalId ?? null,
      platform: firstSource?.sourcePlatform ?? null,
    },
    errorMessage: job.errorMessage,
  };
}

export class ContentMetricsIngestionService {
  constructor({ db, contentMetricsService }) {
    this.db = db;
    this.contentMetricsService = contentMetricsService;
  }

  ingestWithJob(
    rawPayload,
    {
      requestId,
      idempotencyKey: headerIdempotencyKey,
      connectorSource: rawConnectorSource,
    } = {},
  ) {
    const parsed = jobRequestSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Invalid payload',
        details: parsed.error.flatten(),
      };
    }

    const connectorSource = normalizeConnectorSourceContext(rawConnectorSource);
    const payload = {
      ...parsed.data,
      connectorSourceId: connectorSource?.id ?? null,
      rows: enrichRowsWithConnectorContext(parsed.data.rows, connectorSource),
    };
    const companyId = payload.companyId;
    if (connectorSource && connectorSource.companyId !== companyId) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Connector source companyId does not match payload companyId',
      };
    }

    const sourceType = normalizeText(payload.sourceType) ?? (connectorSource ? 'instagram_source_manual' : 'file_upload');
    const sourceName = normalizeText(payload.sourceName)
      ?? connectorSource?.sourceLabel
      ?? connectorSource?.accountUsername
      ?? connectorSource?.accountExternalId
      ?? null;
    const sourceAccountRef = normalizeText(payload.sourceAccountRef) ?? connectorSource?.accountExternalId ?? null;
    const parserVersion = normalizeText(payload.parserVersion);
    const normalizationVersion = normalizeText(payload.normalizationVersion);
    const sources = collectSources(payload.rows, parserVersion, normalizationVersion, connectorSource);
    const explicitIdempotencyKey = normalizeText(headerIdempotencyKey) ?? normalizeText(payload.idempotencyKey);
    const sourceSignature = buildSourceSignature(sources);
    const requestHash = buildRequestHash(payload);
    const identity = explicitIdempotencyKey
      ? {
        type: 'explicit_key',
        key: `explicit:${explicitIdempotencyKey}`,
        jobIdempotencyKey: explicitIdempotencyKey,
      }
      : {
        type: 'source_signature',
        key: `source:${sourceSignature}`,
        jobIdempotencyKey: null,
      };

    const replay = this.#findReplayByIdentity({
      companyId,
      identityKey: identity.key,
    });
    if (replay?.job) {
      this.#touchReplaySeen(replay.log.id, requestHash);
      return {
        ok: true,
        statusCode: replay.job.status === JOB_STATUSES.completed ? 200 : 202,
        reused: true,
        replayed: true,
        replayIdentity: {
          type: identity.type,
          key: identity.key,
        },
        job: replay.job,
        result: this.#buildResultFromJob(replay.job),
      };
    }
    if (identity.jobIdempotencyKey) {
      const legacyJob = this.#findJobByJobIdempotency({
        companyId,
        idempotencyKey: identity.jobIdempotencyKey,
      });
      if (legacyJob) {
        return {
          ok: true,
          statusCode: legacyJob.status === JOB_STATUSES.completed ? 200 : 202,
          reused: true,
          replayed: true,
          replayIdentity: {
            type: identity.type,
            key: identity.key,
          },
          job: legacyJob,
          result: this.#buildResultFromJob(legacyJob),
        };
      }
    }

    const now = new Date().toISOString();
    const jobId = randomUUID();

    const createJobStmt = this.db.prepare(`
      INSERT INTO ingestion_jobs (
        id, company_id, entity_type, source_type, source_name, source_account_ref, status,
        connector_source_id, request_id, idempotency_key, requested_at, created_at, updated_at
      ) VALUES (
        @id, @company_id, @entity_type, @source_type, @source_name, @source_account_ref, @status,
        @connector_source_id, @request_id, @idempotency_key, @requested_at, @created_at, @updated_at
      )
    `);
    const createIdempotencyLogStmt = this.db.prepare(`
      INSERT INTO ingestion_idempotency_log (
        id, company_id, entity_type, identity_type, identity_key, request_hash, source_signature, job_id,
        first_seen_at, last_seen_at, replay_count, created_at, updated_at
      ) VALUES (
        @id, @company_id, @entity_type, @identity_type, @identity_key, @request_hash, @source_signature, @job_id,
        @first_seen_at, @last_seen_at, @replay_count, @created_at, @updated_at
      )
    `);

    const updateStatusStmt = this.db.prepare(`
      UPDATE ingestion_jobs
      SET
        status = @status,
        started_at = COALESCE(@started_at, started_at),
        completed_at = COALESCE(@completed_at, completed_at),
        failed_at = COALESCE(@failed_at, failed_at),
        error_message = @error_message,
        updated_at = @updated_at
      WHERE id = @id
    `);

    const upsertStatsStmt = this.db.prepare(`
      INSERT INTO ingestion_job_stats (
        job_id, rows_received, rows_inserted, rows_updated, rows_rejected,
        exact_count, fallback_count, incomplete_count, created_at, updated_at
      ) VALUES (
        @job_id, @rows_received, @rows_inserted, @rows_updated, @rows_rejected,
        @exact_count, @fallback_count, @incomplete_count, @created_at, @updated_at
      )
      ON CONFLICT(job_id) DO UPDATE SET
        rows_received = excluded.rows_received,
        rows_inserted = excluded.rows_inserted,
        rows_updated = excluded.rows_updated,
        rows_rejected = excluded.rows_rejected,
        exact_count = excluded.exact_count,
        fallback_count = excluded.fallback_count,
        incomplete_count = excluded.incomplete_count,
        updated_at = excluded.updated_at
    `);

    const clearSourcesStmt = this.db.prepare('DELETE FROM ingestion_job_sources WHERE job_id = ?');
    const insertSourceStmt = this.db.prepare(`
      INSERT INTO ingestion_job_sources (
        id, job_id, source_upload_id, source_file_name, source_file_hash,
        source_connector_id, source_account_external_id, source_platform, source_snapshot_json,
        source_data_from, source_data_to, parser_version, normalization_version, created_at, updated_at
      ) VALUES (
        @id, @job_id, @source_upload_id, @source_file_name, @source_file_hash,
        @source_connector_id, @source_account_external_id, @source_platform, @source_snapshot_json,
        @source_data_from, @source_data_to, @parser_version, @normalization_version, @created_at, @updated_at
      )
    `);

    try {
      this.db.exec('BEGIN');
      createJobStmt.run({
        id: jobId,
        company_id: companyId,
        entity_type: ENTITY_TYPE,
        source_type: sourceType,
        source_name: sourceName,
        source_account_ref: sourceAccountRef,
        status: JOB_STATUSES.pending,
        connector_source_id: connectorSource?.id ?? null,
        request_id: normalizeText(requestId),
        idempotency_key: identity.jobIdempotencyKey,
        requested_at: now,
        created_at: now,
        updated_at: now,
      });
      createIdempotencyLogStmt.run({
        id: randomUUID(),
        company_id: companyId,
        entity_type: ENTITY_TYPE,
        identity_type: identity.type,
        identity_key: identity.key,
        request_hash: requestHash,
        source_signature: sourceSignature,
        job_id: jobId,
        first_seen_at: now,
        last_seen_at: now,
        replay_count: 0,
        created_at: now,
        updated_at: now,
      });
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      const existingReplay = this.#findReplayByIdentity({
        companyId,
        identityKey: identity.key,
      });
      if (existingReplay?.job) {
        this.#touchReplaySeen(existingReplay.log.id, requestHash);
        return {
          ok: true,
          statusCode: existingReplay.job.status === JOB_STATUSES.completed ? 200 : 202,
          reused: true,
          replayed: true,
          replayIdentity: {
            type: identity.type,
            key: identity.key,
          },
          job: existingReplay.job,
          result: this.#buildResultFromJob(existingReplay.job),
        };
      }
      if (identity.jobIdempotencyKey) {
        const legacyJob = this.#findJobByJobIdempotency({
          companyId,
          idempotencyKey: identity.jobIdempotencyKey,
        });
        if (legacyJob) {
          return {
            ok: true,
            statusCode: legacyJob.status === JOB_STATUSES.completed ? 200 : 202,
            reused: true,
            replayed: true,
            replayIdentity: {
              type: identity.type,
              key: identity.key,
            },
            job: legacyJob,
            result: this.#buildResultFromJob(legacyJob),
          };
        }
      }
      throw error;
    }

    try {
      updateStatusStmt.run({
        id: jobId,
        status: JOB_STATUSES.running,
        started_at: now,
        completed_at: null,
        failed_at: null,
        error_message: null,
        updated_at: now,
      });

      const ingestionResult = this.contentMetricsService.ingest(payload);

      if (!ingestionResult.ok) {
        const failedAt = new Date().toISOString();
        updateStatusStmt.run({
          id: jobId,
          status: JOB_STATUSES.failed,
          started_at: null,
          completed_at: null,
          failed_at: failedAt,
          error_message: ingestionResult.error ?? 'Ingestion failed',
          updated_at: failedAt,
        });

        return {
          ...ingestionResult,
          job: this.getJob({ companyId, jobId }).job,
        };
      }

      const completedAt = new Date().toISOString();
      this.db.exec('BEGIN');
      try {
        upsertStatsStmt.run({
          job_id: jobId,
          rows_received: payload.rows.length,
          rows_inserted: Number(ingestionResult.inserted ?? 0),
          rows_updated: Number(ingestionResult.updated ?? 0),
          rows_rejected: 0,
          exact_count: Number(ingestionResult.trustSummary?.exact ?? 0),
          fallback_count: Number(ingestionResult.trustSummary?.fallback ?? 0),
          incomplete_count: Number(ingestionResult.trustSummary?.incomplete ?? 0),
          created_at: completedAt,
          updated_at: completedAt,
        });

        clearSourcesStmt.run(jobId);
        for (const source of sources) {
          insertSourceStmt.run({
            id: randomUUID(),
            job_id: jobId,
            source_upload_id: source.sourceUploadId,
            source_file_name: source.sourceFileName,
            source_file_hash: source.sourceFileHash,
            source_connector_id: source.sourceConnectorId,
            source_account_external_id: source.sourceAccountExternalId,
            source_platform: source.sourcePlatform,
            source_snapshot_json: source.sourceSnapshotJson,
            source_data_from: source.sourceDataFrom,
            source_data_to: source.sourceDataTo,
            parser_version: source.parserVersion,
            normalization_version: source.normalizationVersion,
            created_at: completedAt,
            updated_at: completedAt,
          });
        }

        updateStatusStmt.run({
          id: jobId,
          status: JOB_STATUSES.completed,
          started_at: null,
          completed_at: completedAt,
          failed_at: null,
          error_message: null,
          updated_at: completedAt,
        });

        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }

      const job = this.getJob({ companyId, jobId }).job;
      return {
        ...ingestionResult,
        reused: false,
        replayIdentity: {
          type: identity.type,
          key: identity.key,
        },
        job,
      };
    } catch (error) {
      const failedAt = new Date().toISOString();
      updateStatusStmt.run({
        id: jobId,
        status: JOB_STATUSES.failed,
        started_at: null,
        completed_at: null,
        failed_at: failedAt,
        error_message: error?.message ?? 'Unhandled ingestion error',
        updated_at: failedAt,
      });
      throw error;
    }
  }

  listJobs(params) {
    const companyId = String(params.companyId || '').trim();
    if (!companyId) {
      return { ok: false, statusCode: 400, error: 'Missing companyId' };
    }

    const status = normalizeText(params.status);
    const limit = Math.min(200, Math.max(1, Number(params.limit) || 50));
    const offset = Math.max(0, Number(params.offset) || 0);

    const clauses = ['company_id = ?', 'entity_type = ?'];
    const values = [companyId, ENTITY_TYPE];
    if (status) {
      clauses.push('status = ?');
      values.push(status);
    }

    const whereSql = `WHERE ${clauses.join(' AND ')}`;
    const rows = this.db.prepare(`
      SELECT *
      FROM ingestion_jobs
      ${whereSql}
      ORDER BY requested_at DESC
      LIMIT ? OFFSET ?
    `).all(...values, limit, offset);

    const total = this.db.prepare(`
      SELECT COUNT(*) AS total
      FROM ingestion_jobs
      ${whereSql}
    `).get(...values);

    const jobs = rows.map((jobRow) => this.#loadJobDetailsByRow(jobRow));
    return {
      ok: true,
      statusCode: 200,
      companyId,
      filters: { status, limit, offset },
      total: Number(total?.total ?? 0),
      jobs,
    };
  }

  listJobsByConnectorSource(params) {
    const companyId = String(params.companyId || '').trim();
    const connectorSourceId = String(params.connectorSourceId || '').trim();
    if (!companyId) {
      return { ok: false, statusCode: 400, error: 'Missing companyId' };
    }
    if (!connectorSourceId) {
      return { ok: false, statusCode: 400, error: 'Missing connectorSourceId' };
    }

    const status = normalizeText(params.status);
    const limit = Math.min(200, Math.max(1, Number(params.limit) || 50));
    const offset = Math.max(0, Number(params.offset) || 0);

    const clauses = ['company_id = ?', 'entity_type = ?', 'connector_source_id = ?'];
    const values = [companyId, ENTITY_TYPE, connectorSourceId];
    if (status) {
      clauses.push('status = ?');
      values.push(status);
    }

    const whereSql = `WHERE ${clauses.join(' AND ')}`;
    const rows = this.db.prepare(`
      SELECT *
      FROM ingestion_jobs
      ${whereSql}
      ORDER BY requested_at DESC
      LIMIT ? OFFSET ?
    `).all(...values, limit, offset);

    const total = this.db.prepare(`
      SELECT COUNT(*) AS total
      FROM ingestion_jobs
      ${whereSql}
    `).get(...values);

    const runs = rows
      .map((jobRow) => this.#loadJobDetailsByRow(jobRow))
      .map((job) => mapSyncRunView(job));

    return {
      ok: true,
      statusCode: 200,
      companyId,
      connectorSourceId,
      filters: { status, limit, offset },
      total: Number(total?.total ?? 0),
      runs,
    };
  }

  getJob(params) {
    const companyId = String(params.companyId || '').trim();
    const jobId = String(params.jobId || '').trim();
    if (!companyId) {
      return { ok: false, statusCode: 400, error: 'Missing companyId' };
    }
    if (!jobId) {
      return { ok: false, statusCode: 400, error: 'Missing jobId' };
    }

    const jobRow = this.db.prepare(`
      SELECT *
      FROM ingestion_jobs
      WHERE id = ? AND company_id = ? AND entity_type = ?
      LIMIT 1
    `).get(jobId, companyId, ENTITY_TYPE);

    if (!jobRow) {
      return { ok: false, statusCode: 404, error: 'Job not found' };
    }

    return {
      ok: true,
      statusCode: 200,
      job: this.#loadJobDetailsByRow(jobRow),
    };
  }

  getJobByConnectorSource(params) {
    const companyId = String(params.companyId || '').trim();
    const connectorSourceId = String(params.connectorSourceId || '').trim();
    const jobId = String(params.jobId || '').trim();
    if (!companyId) {
      return { ok: false, statusCode: 400, error: 'Missing companyId' };
    }
    if (!connectorSourceId) {
      return { ok: false, statusCode: 400, error: 'Missing connectorSourceId' };
    }
    if (!jobId) {
      return { ok: false, statusCode: 400, error: 'Missing jobId' };
    }

    const jobRow = this.db.prepare(`
      SELECT *
      FROM ingestion_jobs
      WHERE id = ? AND company_id = ? AND entity_type = ? AND connector_source_id = ?
      LIMIT 1
    `).get(jobId, companyId, ENTITY_TYPE, connectorSourceId);

    if (!jobRow) {
      return { ok: false, statusCode: 404, error: 'Sync run not found' };
    }

    const job = this.#loadJobDetailsByRow(jobRow);
    return {
      ok: true,
      statusCode: 200,
      run: mapSyncRunView(job),
    };
  }

  #findReplayByIdentity({ companyId, identityKey }) {
    const logRow = this.db.prepare(`
      SELECT *
      FROM ingestion_idempotency_log
      WHERE company_id = ? AND entity_type = ? AND identity_key = ?
      LIMIT 1
    `).get(companyId, ENTITY_TYPE, identityKey);
    if (!logRow) return null;

    const jobRow = this.db.prepare(`
      SELECT *
      FROM ingestion_jobs
      WHERE id = ? AND company_id = ? AND entity_type = ?
      LIMIT 1
    `).get(logRow.job_id, companyId, ENTITY_TYPE);

    return {
      log: logRow,
      job: jobRow ? this.#loadJobDetailsByRow(jobRow) : null,
    };
  }

  #findJobByJobIdempotency({ companyId, idempotencyKey }) {
    const jobRow = this.db.prepare(`
      SELECT *
      FROM ingestion_jobs
      WHERE company_id = ? AND entity_type = ? AND idempotency_key = ?
      LIMIT 1
    `).get(companyId, ENTITY_TYPE, idempotencyKey);
    if (!jobRow) return null;
    return this.#loadJobDetailsByRow(jobRow);
  }

  #touchReplaySeen(logId, latestRequestHash) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE ingestion_idempotency_log
      SET
        request_hash = ?,
        replay_count = replay_count + 1,
        last_seen_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(latestRequestHash, now, now, logId);
  }

  #loadJobDetailsByRow(jobRow) {
    const statsRow = this.db.prepare(`
      SELECT *
      FROM ingestion_job_stats
      WHERE job_id = ?
      LIMIT 1
    `).get(jobRow.id);

    const sourceRows = this.db.prepare(`
      SELECT *
      FROM ingestion_job_sources
      WHERE job_id = ?
      ORDER BY created_at ASC
    `).all(jobRow.id);

    return mapJobRow(jobRow, statsRow, sourceRows);
  }

  #buildResultFromJob(job) {
    return {
      ok: job.status === JOB_STATUSES.completed,
      statusCode: job.status === JOB_STATUSES.completed ? 200 : 202,
      companyId: job.companyId,
      processed: job.stats.rowsReceived,
      inserted: job.stats.rowsInserted,
      updated: job.stats.rowsUpdated,
      trustSummary: {
        exact: job.stats.exactCount,
        fallback: job.stats.fallbackCount,
        incomplete: job.stats.incompleteCount,
      },
      rows: [],
    };
  }
}
