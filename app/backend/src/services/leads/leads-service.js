import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

const leadRowSchema = z.object({
  leadExternalId: z.string().min(1),
  channelCampaignExternalId: z.string().optional(),
  createdDate: z.string().regex(ymdRegex).optional(),
  sourceType: z.string().optional(),
  leadLinkKey: z.string().optional(),
  sourceUploadId: z.string().optional(),
  sourceFileName: z.string().optional(),
  normalizationVersion: z.string().optional(),
  diagnosticFlags: z.array(z.string()).optional(),
});

const leadsIngestionSchema = z.object({
  companyId: z.string().min(1),
  rows: z.array(leadRowSchema).min(1).max(5000),
});

function normalizeText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function uniqueFlags(flags) {
  return Array.from(new Set(flags));
}

function deriveLeadFlags(row) {
  const flags = [...(row.diagnosticFlags ?? [])];
  if (!row.channelCampaignExternalId) flags.push('missing_channel_campaign_external_id');
  if (!row.createdDate) flags.push('missing_created_date');
  if (!row.leadLinkKey) flags.push('missing_lead_link_key');
  return uniqueFlags(flags);
}

export class LeadsService {
  constructor({ db }) {
    this.db = db;
  }

  ingest(payload) {
    const parsed = leadsIngestionSchema.safeParse(payload);
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
      rows: [],
    };

    const existsStmt = this.db.prepare(`
      SELECT id
      FROM leads
      WHERE company_id = ? AND lead_external_id = ?
      LIMIT 1
    `);

    const upsertStmt = this.db.prepare(`
      INSERT INTO leads (
        id, company_id, lead_external_id, channel_campaign_external_id, created_date, source_type, lead_link_key,
        source_upload_id, source_file_name, ingested_at, diagnostic_flags, normalization_version, created_at, updated_at
      ) VALUES (
        @id, @company_id, @lead_external_id, @channel_campaign_external_id, @created_date, @source_type, @lead_link_key,
        @source_upload_id, @source_file_name, @ingested_at, @diagnostic_flags, @normalization_version, @created_at, @updated_at
      )
      ON CONFLICT(company_id, lead_external_id) DO UPDATE SET
        channel_campaign_external_id = excluded.channel_campaign_external_id,
        created_date = excluded.created_date,
        source_type = excluded.source_type,
        lead_link_key = excluded.lead_link_key,
        source_upload_id = excluded.source_upload_id,
        source_file_name = excluded.source_file_name,
        ingested_at = excluded.ingested_at,
        diagnostic_flags = excluded.diagnostic_flags,
        normalization_version = excluded.normalization_version,
        updated_at = excluded.updated_at
    `);

    this.db.exec('BEGIN');
    try {
      for (const row of rows) {
        const existing = existsStmt.get(companyId, row.leadExternalId);
        const diagnosticFlags = deriveLeadFlags(row);

        if (existing) result.updated += 1;
        else result.inserted += 1;

        const dbRow = {
          id: existing?.id ?? randomUUID(),
          company_id: companyId,
          lead_external_id: row.leadExternalId,
          channel_campaign_external_id: normalizeText(row.channelCampaignExternalId),
          created_date: normalizeText(row.createdDate),
          source_type: normalizeText(row.sourceType),
          lead_link_key: normalizeText(row.leadLinkKey),
          source_upload_id: normalizeText(row.sourceUploadId),
          source_file_name: normalizeText(row.sourceFileName),
          ingested_at: now,
          diagnostic_flags: JSON.stringify(diagnosticFlags),
          normalization_version: normalizeText(row.normalizationVersion) ?? 'v1',
          created_at: now,
          updated_at: now,
        };

        upsertStmt.run(dbRow);
        result.rows.push({
          leadExternalId: row.leadExternalId,
          createdDate: dbRow.created_date,
          channelCampaignExternalId: dbRow.channel_campaign_external_id,
          status: existing ? 'updated' : 'inserted',
          diagnosticFlags,
        });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return result;
  }

  /** GET summary for processed_metrics / external aggregates */
  summary(params) {
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
        MIN(created_date) as min_created_date,
        MAX(created_date) as max_created_date
      FROM leads
      WHERE company_id = ?
    `).get(companyId);

    return {
      ok: true,
      statusCode: 200,
      companyId,
      count: Number(row?.row_count ?? 0),
      minCreatedDate: row?.min_created_date ?? null,
      maxCreatedDate: row?.max_created_date ?? null,
    };
  }
}
