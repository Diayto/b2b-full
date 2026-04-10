import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

const rowSchema = z.object({
  contentId: z.string().min(1),
  platform: z.string().min(1).default('instagram'),
  contentTitle: z.string().optional(),
  contentType: z.string().optional(),
  themeTag: z.string().optional(),
  ctaType: z.string().optional(),
  publishedAt: z.string().regex(ymdRegex),
  channelCampaignExternalId: z.string().optional(),
  reach: z.number().int().nonnegative().optional(),
  impressions: z.number().int().nonnegative().optional(),
  likes: z.number().int().nonnegative().optional(),
  comments: z.number().int().nonnegative().optional(),
  saves: z.number().int().nonnegative().optional(),
  shares: z.number().int().nonnegative().optional(),
  profileVisits: z.number().int().nonnegative().optional(),
  inboundMessages: z.number().int().nonnegative().optional(),
  leadsGenerated: z.number().int().nonnegative().optional(),
  dealsGenerated: z.number().int().nonnegative().optional(),
  paidConversions: z.number().int().nonnegative().optional(),
  sourceUploadId: z.string().optional(),
  sourceFileName: z.string().optional(),
  sourceIdentityType: z.enum(['file_upload', 'instagram_source']).optional(),
  sourceConnectorId: z.string().optional(),
  sourceAccountExternalId: z.string().optional(),
  completenessScore: z.number().int().min(0).max(100).optional(),
  confidenceLevel: z.enum(['exact', 'fallback', 'incomplete']).optional(),
  linkageStatus: z.enum(['unlinked', 'partially_linked', 'linked']).optional(),
  diagnosticFlags: z.array(z.string()).optional(),
  normalizationVersion: z.string().optional(),
  leadLinkKey: z.string().optional(),
  attributionWindowDays: z.number().int().positive().max(365).optional(),
});

const ingestionSchema = z.object({
  companyId: z.string().min(1),
  rows: z.array(rowSchema).min(1).max(5000),
});

function toNumberOrZero(value) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function uniqueFlags(flags) {
  return Array.from(new Set(flags));
}

function deriveTrust(row) {
  const flags = [];
  if (!row.contentId) flags.push('missing_content_id');
  if (!row.publishedAt) flags.push('missing_published_at');
  if (!row.platform) flags.push('missing_platform');
  if (!row.channelCampaignExternalId) flags.push('missing_channel_campaign_external_id');
  if (!row.leadLinkKey) flags.push('missing_lead_link_key');
  if (row.reach === 0 && row.impressions === 0) flags.push('missing_top_of_funnel_signals');
  if (row.leadsGenerated === 0) flags.push('missing_lead_relevance_signal');
  if (row.paidConversions === 0) flags.push('missing_paid_influence_signal');

  const autoScore = Math.max(0, Math.min(100, 100 - flags.length * 12));
  const completenessScore = row.completenessScore ?? autoScore;

  let confidenceLevel = row.confidenceLevel;
  if (!confidenceLevel) {
    if (completenessScore >= 80) confidenceLevel = 'exact';
    else if (completenessScore >= 50) confidenceLevel = 'fallback';
    else confidenceLevel = 'incomplete';
  }

  return {
    completenessScore,
    confidenceLevel,
    linkageStatus: row.linkageStatus ?? 'unlinked',
    diagnosticFlags: uniqueFlags([...(row.diagnosticFlags ?? []), ...flags]),
  };
}

function mapDbRow(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    contentId: row.content_id,
    platform: row.platform,
    contentTitle: row.content_title,
    contentType: row.content_type,
    themeTag: row.theme_tag,
    ctaType: row.cta_type,
    publishedAt: row.published_at,
    channelCampaignExternalId: row.channel_campaign_external_id,
    reach: row.reach,
    impressions: row.impressions,
    likes: row.likes,
    comments: row.comments,
    saves: row.saves,
    shares: row.shares,
    profileVisits: row.profile_visits,
    inboundMessages: row.inbound_messages,
    leadsGenerated: row.leads_generated,
    dealsGenerated: row.deals_generated,
    paidConversions: row.paid_conversions,
    sourceUploadId: row.source_upload_id,
    sourceFileName: row.source_file_name,
    sourceIdentityType: row.source_identity_type,
    sourceConnectorId: row.source_connector_id,
    sourceAccountExternalId: row.source_account_external_id,
    ingestedAt: row.ingested_at,
    trust: {
      completenessScore: row.completeness_score,
      confidenceLevel: row.confidence_level,
      linkageStatus: row.linkage_status,
      diagnosticFlags: JSON.parse(row.diagnostic_flags || '[]'),
      normalizationVersion: row.normalization_version,
      leadLinkKey: row.lead_link_key,
      attributionWindowDays: row.attribution_window_days,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function daysSince(isoDateOrYmd) {
  if (!isoDateOrYmd) return null;
  const date = new Date(isoDateOrYmd);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

function normalizeText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class ContentMetricsService {
  constructor({
    db,
    contentLeadLinkageService = null,
    leadDealLinkageService = null,
    leadLinkageEnabled = true,
  }) {
    this.db = db;
    this.contentLeadLinkageService = contentLeadLinkageService;
    this.leadDealLinkageService = leadDealLinkageService;
    this.leadLinkageEnabled = Boolean(leadLinkageEnabled);
  }

  ingest(payload) {
    const parsed = ingestionSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Invalid payload',
        details: parsed.error.flatten(),
      };
    }

    const { companyId, rows } = parsed.data;
    const now = new Date().toISOString();
    const result = {
      ok: true,
      statusCode: 200,
      companyId,
      processed: rows.length,
      inserted: 0,
      updated: 0,
      trustSummary: {
        exact: 0,
        fallback: 0,
        incomplete: 0,
      },
      rows: [],
    };

    const upsertStmt = this.db.prepare(`
      INSERT INTO content_metrics (
        id, company_id, content_id, platform, content_title, content_type, theme_tag, cta_type,
        published_at, channel_campaign_external_id, reach, impressions, likes, comments, saves, shares,
        profile_visits, inbound_messages, leads_generated, deals_generated, paid_conversions,
        source_upload_id, source_file_name, source_identity_type, source_connector_id, source_account_external_id,
        ingested_at, completeness_score, confidence_level, linkage_status,
        diagnostic_flags, normalization_version, lead_link_key, attribution_window_days, created_at, updated_at
      ) VALUES (
        @id, @company_id, @content_id, @platform, @content_title, @content_type, @theme_tag, @cta_type,
        @published_at, @channel_campaign_external_id, @reach, @impressions, @likes, @comments, @saves, @shares,
        @profile_visits, @inbound_messages, @leads_generated, @deals_generated, @paid_conversions,
        @source_upload_id, @source_file_name, @source_identity_type, @source_connector_id, @source_account_external_id,
        @ingested_at, @completeness_score, @confidence_level, @linkage_status,
        @diagnostic_flags, @normalization_version, @lead_link_key, @attribution_window_days, @created_at, @updated_at
      )
      ON CONFLICT(company_id, platform, content_id, published_at) DO UPDATE SET
        content_title = excluded.content_title,
        content_type = excluded.content_type,
        theme_tag = excluded.theme_tag,
        cta_type = excluded.cta_type,
        channel_campaign_external_id = excluded.channel_campaign_external_id,
        reach = excluded.reach,
        impressions = excluded.impressions,
        likes = excluded.likes,
        comments = excluded.comments,
        saves = excluded.saves,
        shares = excluded.shares,
        profile_visits = excluded.profile_visits,
        inbound_messages = excluded.inbound_messages,
        leads_generated = excluded.leads_generated,
        deals_generated = excluded.deals_generated,
        paid_conversions = excluded.paid_conversions,
        source_upload_id = excluded.source_upload_id,
        source_file_name = excluded.source_file_name,
        source_identity_type = excluded.source_identity_type,
        source_connector_id = excluded.source_connector_id,
        source_account_external_id = excluded.source_account_external_id,
        ingested_at = excluded.ingested_at,
        completeness_score = excluded.completeness_score,
        confidence_level = excluded.confidence_level,
        linkage_status = excluded.linkage_status,
        diagnostic_flags = excluded.diagnostic_flags,
        normalization_version = excluded.normalization_version,
        lead_link_key = excluded.lead_link_key,
        attribution_window_days = excluded.attribution_window_days,
        updated_at = excluded.updated_at
    `);

    const existsStmt = this.db.prepare(`
      SELECT id
      FROM content_metrics
      WHERE company_id = ? AND platform = ? AND content_id = ? AND published_at = ?
      LIMIT 1
    `);

    this.db.exec('BEGIN');
    try {
      for (const row of rows) {
        const trust = deriveTrust({
          ...row,
          reach: toNumberOrZero(row.reach),
          impressions: toNumberOrZero(row.impressions),
          leadsGenerated: toNumberOrZero(row.leadsGenerated),
          paidConversions: toNumberOrZero(row.paidConversions),
        });

        const existing = existsStmt.get(companyId, row.platform, row.contentId, row.publishedAt);
        if (existing) result.updated += 1;
        else result.inserted += 1;

        result.trustSummary[trust.confidenceLevel] += 1;

        const dbRow = {
          id: existing?.id ?? randomUUID(),
          company_id: companyId,
          content_id: row.contentId,
          platform: row.platform,
          content_title: row.contentTitle ?? null,
          content_type: row.contentType ?? null,
          theme_tag: row.themeTag ?? null,
          cta_type: row.ctaType ?? null,
          published_at: row.publishedAt,
          channel_campaign_external_id: row.channelCampaignExternalId ?? null,
          reach: toNumberOrZero(row.reach),
          impressions: toNumberOrZero(row.impressions),
          likes: toNumberOrZero(row.likes),
          comments: toNumberOrZero(row.comments),
          saves: toNumberOrZero(row.saves),
          shares: toNumberOrZero(row.shares),
          profile_visits: toNumberOrZero(row.profileVisits),
          inbound_messages: toNumberOrZero(row.inboundMessages),
          leads_generated: toNumberOrZero(row.leadsGenerated),
          deals_generated: toNumberOrZero(row.dealsGenerated),
          paid_conversions: toNumberOrZero(row.paidConversions),
          source_upload_id: row.sourceUploadId ?? null,
          source_file_name: row.sourceFileName ?? null,
          source_identity_type: row.sourceIdentityType ?? 'file_upload',
          source_connector_id: row.sourceConnectorId ?? null,
          source_account_external_id: row.sourceAccountExternalId ?? null,
          ingested_at: now,
          completeness_score: trust.completenessScore,
          confidence_level: trust.confidenceLevel,
          linkage_status: trust.linkageStatus,
          diagnostic_flags: JSON.stringify(trust.diagnosticFlags),
          normalization_version: row.normalizationVersion ?? 'v1',
          lead_link_key: row.leadLinkKey ?? null,
          attribution_window_days: row.attributionWindowDays ?? 30,
          created_at: now,
          updated_at: now,
        };

        upsertStmt.run(dbRow);
        result.rows.push({
          contentId: row.contentId,
          platform: row.platform,
          publishedAt: row.publishedAt,
          trust,
          status: existing ? 'updated' : 'inserted',
        });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return result;
  }

  list(params) {
    const companyId = String(params.companyId || '').trim();
    if (!companyId) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Missing companyId',
      };
    }

    const from = params.from ? String(params.from) : null;
    const to = params.to ? String(params.to) : null;
    const platform = params.platform ? String(params.platform) : null;
    const limit = Math.min(1000, Math.max(1, Number(params.limit) || 200));
    const offset = Math.max(0, Number(params.offset) || 0);

    const clauses = ['company_id = ?'];
    const values = [companyId];

    if (from) {
      clauses.push('published_at >= ?');
      values.push(from);
    }
    if (to) {
      clauses.push('published_at <= ?');
      values.push(to);
    }
    if (platform) {
      clauses.push('platform = ?');
      values.push(platform);
    }

    const whereSql = `WHERE ${clauses.join(' AND ')}`;
    const rowsStmt = this.db.prepare(`
      SELECT *
      FROM content_metrics
      ${whereSql}
      ORDER BY published_at DESC, updated_at DESC
      LIMIT ? OFFSET ?
    `);

    const countStmt = this.db.prepare(`
      SELECT COUNT(*) as total
      FROM content_metrics
      ${whereSql}
    `);

    const dbRows = rowsStmt.all(...values, limit, offset);
    const countRow = countStmt.get(...values);

    return {
      ok: true,
      statusCode: 200,
      companyId,
      filters: { from, to, platform, limit, offset },
      total: Number(countRow?.total ?? 0),
      rows: dbRows.map(mapDbRow),
    };
  }

  /** Aggregates for syncing executive metrics to external stores (e.g. Supabase) */
  summaryForCompany(params) {
    const companyId = String(params.companyId || '').trim();
    if (!companyId) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Missing companyId',
      };
    }

    const row = this.db.prepare(`
      SELECT
        COUNT(*) as row_count,
        COALESCE(SUM(leads_generated), 0) as sum_leads_generated,
        COALESCE(SUM(deals_generated), 0) as sum_deals_generated,
        COALESCE(SUM(paid_conversions), 0) as sum_paid_conversions,
        COALESCE(SUM(impressions), 0) as sum_impressions,
        MIN(published_at) as min_published_at,
        MAX(published_at) as max_published_at
      FROM content_metrics
      WHERE company_id = ?
    `).get(companyId);

    return {
      ok: true,
      statusCode: 200,
      companyId,
      summary: {
        rowCount: Number(row?.row_count ?? 0),
        sumLeadsGenerated: Number(row?.sum_leads_generated ?? 0),
        sumDealsGenerated: Number(row?.sum_deals_generated ?? 0),
        sumPaidConversions: Number(row?.sum_paid_conversions ?? 0),
        sumImpressions: Number(row?.sum_impressions ?? 0),
        minPublishedAt: row?.min_published_at ?? null,
        maxPublishedAt: row?.max_published_at ?? null,
      },
    };
  }

  diagnostics(params) {
    const companyId = String(params.companyId || '').trim();
    if (!companyId) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Missing companyId',
      };
    }

    const from = params.from ? String(params.from) : null;
    const to = params.to ? String(params.to) : null;
    const platform = params.platform ? String(params.platform) : null;

    const clauses = ['company_id = ?'];
    const values = [companyId];

    if (from) {
      clauses.push('published_at >= ?');
      values.push(from);
    }
    if (to) {
      clauses.push('published_at <= ?');
      values.push(to);
    }
    if (platform) {
      clauses.push('platform = ?');
      values.push(platform);
    }

    const whereSql = `WHERE ${clauses.join(' AND ')}`;
    const summaryStmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_rows,
        ROUND(AVG(completeness_score), 2) as avg_completeness_score,
        SUM(CASE WHEN confidence_level = 'exact' THEN 1 ELSE 0 END) as exact_rows,
        SUM(CASE WHEN confidence_level = 'fallback' THEN 1 ELSE 0 END) as fallback_rows,
        SUM(CASE WHEN confidence_level = 'incomplete' THEN 1 ELSE 0 END) as incomplete_rows,
        SUM(CASE WHEN linkage_status = 'unlinked' THEN 1 ELSE 0 END) as unlinked_rows,
        SUM(CASE WHEN linkage_status = 'partially_linked' THEN 1 ELSE 0 END) as partially_linked_rows,
        SUM(CASE WHEN linkage_status = 'linked' THEN 1 ELSE 0 END) as linked_rows
      FROM content_metrics
      ${whereSql}
    `);

    const topFlagsStmt = this.db.prepare(`
      SELECT diagnostic_flags
      FROM content_metrics
      ${whereSql}
    `);

    const summary = summaryStmt.get(...values);
    const flagRows = topFlagsStmt.all(...values);

    const flagCounts = new Map();
    for (const row of flagRows) {
      const flags = JSON.parse(row.diagnostic_flags || '[]');
      for (const flag of flags) {
        flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
      }
    }

    const topFlags = Array.from(flagCounts.entries())
      .map(([flag, count]) => ({ flag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const freshnessRow = this.db.prepare(`
      SELECT
        MAX(ingested_at) AS last_ingested_at,
        MAX(published_at) AS latest_published_at
      FROM content_metrics
      ${whereSql}
    `).get(...values);

    const healthSummary = this.db.prepare(`
      SELECT
        COUNT(*) AS total_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_jobs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_jobs,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running_jobs,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_jobs,
        MAX(CASE WHEN status = 'completed' THEN completed_at ELSE NULL END) AS last_completed_at,
        MAX(CASE WHEN status = 'failed' THEN failed_at ELSE NULL END) AS last_failed_at
      FROM ingestion_jobs
      WHERE company_id = ? AND entity_type = 'content_metrics'
    `).get(companyId);

    const latestJob = this.db.prepare(`
      SELECT *
      FROM ingestion_jobs
      WHERE company_id = ? AND entity_type = 'content_metrics'
      ORDER BY requested_at DESC
      LIMIT 1
    `).get(companyId);

    let latestJobSource = null;
    if (latestJob) {
      latestJobSource = this.db.prepare(`
        SELECT source_upload_id, source_file_name, source_file_hash, source_data_from, source_data_to, parser_version, normalization_version
        FROM ingestion_job_sources
        WHERE job_id = ?
        ORDER BY created_at ASC
        LIMIT 1
      `).get(latestJob.id) ?? null;
    }

    let leadLinkageBridge = null;
    if (this.leadLinkageEnabled && this.contentLeadLinkageService) {
      leadLinkageBridge = this.contentLeadLinkageService.getDiagnosticsBridgeSummary({
        companyId,
        from,
        to,
        platform,
      });
    }

    let leadDealBridge = null;
    if (this.leadDealLinkageService) {
      leadDealBridge = this.leadDealLinkageService.getDiagnosticsBridgeSummary({
        companyId,
        from,
        to,
      });
    }

    const identityRows = this.db.prepare(`
      SELECT source_identity_type, COUNT(*) AS row_count
      FROM content_metrics
      ${whereSql}
      GROUP BY source_identity_type
    `).all(...values);
    const identityBreakdown = {
      instagramSource: 0,
      fileUpload: 0,
      other: 0,
    };
    for (const row of identityRows) {
      const key = normalizeText(row.source_identity_type);
      const count = Number(row.row_count ?? 0);
      if (key === 'instagram_source') identityBreakdown.instagramSource += count;
      else if (key === 'file_upload') identityBreakdown.fileUpload += count;
      else identityBreakdown.other += count;
    }

    const sourceRows = this.db.prepare(`
      SELECT
        source_connector_id,
        source_account_external_id,
        COUNT(*) AS row_count,
        MAX(ingested_at) AS last_ingested_at,
        MAX(published_at) AS latest_published_at
      FROM content_metrics
      ${whereSql}
      AND source_identity_type = 'instagram_source'
      AND source_connector_id IS NOT NULL
      GROUP BY source_connector_id, source_account_external_id
      ORDER BY row_count DESC
      LIMIT 20
    `).all(...values);

    const sourceMetaStmt = this.db.prepare(`
      SELECT id, source_label, account_external_id, account_username, account_name
      FROM instagram_sources
      WHERE id = ?
      LIMIT 1
    `);
    const latestRunStmt = this.db.prepare(`
      SELECT id, status, requested_at, started_at, completed_at, failed_at
      FROM ingestion_jobs
      WHERE company_id = ? AND entity_type = 'content_metrics' AND connector_source_id = ?
      ORDER BY requested_at DESC
      LIMIT 1
    `);

    const compactSources = sourceRows.map((row) => {
      const sourceId = row.source_connector_id;
      const meta = sourceMetaStmt.get(sourceId);
      const latestRun = latestRunStmt.get(companyId, sourceId);
      const sourceDisplayName =
        normalizeText(meta?.source_label)
        ?? normalizeText(meta?.account_name)
        ?? normalizeText(meta?.account_username)
        ?? normalizeText(row.source_account_external_id)
        ?? null;

      return {
        sourceId,
        connectorSourceId: sourceId,
        sourceDisplayName,
        accountExternalId: normalizeText(meta?.account_external_id) ?? normalizeText(row.source_account_external_id),
        rowCount: Number(row.row_count ?? 0),
        lastIngestedAt: row.last_ingested_at ?? null,
        latestPublishedAt: row.latest_published_at ?? null,
        latestSyncRun: latestRun
          ? {
            jobId: latestRun.id,
            status: latestRun.status,
            requestedAt: latestRun.requested_at,
            startedAt: latestRun.started_at,
            completedAt: latestRun.completed_at,
            failedAt: latestRun.failed_at,
          }
          : null,
      };
    });

    const totalInstagramSourceRows = compactSources.reduce((sum, row) => sum + row.rowCount, 0);
    const latestSourceRun = compactSources
      .filter((row) => row.latestSyncRun)
      .map((row) => ({ sourceId: row.sourceId, ...row.latestSyncRun }))
      .sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')))[0] ?? null;

    return {
      ok: true,
      statusCode: 200,
      companyId,
      filters: { from, to, platform },
      summary: {
        totalRows: Number(summary?.total_rows ?? 0),
        avgCompletenessScore: Number(summary?.avg_completeness_score ?? 0),
        confidenceBreakdown: {
          exact: Number(summary?.exact_rows ?? 0),
          fallback: Number(summary?.fallback_rows ?? 0),
          incomplete: Number(summary?.incomplete_rows ?? 0),
        },
        linkageBreakdown: {
          unlinked: Number(summary?.unlinked_rows ?? 0),
          partiallyLinked: Number(summary?.partially_linked_rows ?? 0),
          linked: Number(summary?.linked_rows ?? 0),
        },
      },
      freshness: {
        lastIngestedAt: freshnessRow?.last_ingested_at ?? null,
        daysSinceLastIngest: daysSince(freshnessRow?.last_ingested_at),
        latestPublishedAt: freshnessRow?.latest_published_at ?? null,
        daysSinceLatestPublishedContent: daysSince(freshnessRow?.latest_published_at),
      },
      ingestionHealth: {
        totalJobs: Number(healthSummary?.total_jobs ?? 0),
        completedJobs: Number(healthSummary?.completed_jobs ?? 0),
        failedJobs: Number(healthSummary?.failed_jobs ?? 0),
        runningJobs: Number(healthSummary?.running_jobs ?? 0),
        pendingJobs: Number(healthSummary?.pending_jobs ?? 0),
        lastCompletedAt: healthSummary?.last_completed_at ?? null,
        lastFailedAt: healthSummary?.last_failed_at ?? null,
        latestJob: latestJob
          ? {
            id: latestJob.id,
            status: latestJob.status,
            requestedAt: latestJob.requested_at,
            sourceType: latestJob.source_type,
            sourceName: latestJob.source_name,
            sourceAccountRef: latestJob.source_account_ref,
            source: latestJobSource
              ? {
                sourceUploadId: latestJobSource.source_upload_id,
                sourceFileName: latestJobSource.source_file_name,
                sourceFileHash: latestJobSource.source_file_hash,
                sourceDataFrom: latestJobSource.source_data_from,
                sourceDataTo: latestJobSource.source_data_to,
                parserVersion: latestJobSource.parser_version,
                normalizationVersion: latestJobSource.normalization_version,
              }
              : null,
          }
          : null,
      },
      topDiagnosticFlags: topFlags,
      leadLinkageBridge,
      leadDealBridge,
      instagramSourceSummary: {
        hasInstagramSourceData: totalInstagramSourceRows > 0,
        totalInstagramSourceRows,
        sourceIdentityBreakdown: identityBreakdown,
        latestSourceBoundSyncRun: latestSourceRun,
        sources: compactSources,
      },
    };
  }
}
