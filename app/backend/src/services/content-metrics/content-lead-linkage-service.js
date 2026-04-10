import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

const rebuildSchema = z.object({
  companyId: z.string().min(1),
  from: z.string().regex(ymdRegex).optional(),
  to: z.string().regex(ymdRegex).optional(),
  platform: z.string().min(1).optional(),
});

function parseYmd(value) {
  if (!value || !ymdRegex.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayDiff(fromDate, toDate) {
  return Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000);
}

function fallbackScore(dayLag) {
  if (!Number.isFinite(dayLag) || dayLag < 0) return 0;
  if (dayLag <= 3) return 70;
  if (dayLag <= 7) return 60;
  if (dayLag <= 14) return 50;
  return 40;
}

function sortCandidates(a, b) {
  if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;

  const aLag = Number.isFinite(a.dayLag) ? a.dayLag : Number.MAX_SAFE_INTEGER;
  const bLag = Number.isFinite(b.dayLag) ? b.dayLag : Number.MAX_SAFE_INTEGER;
  if (aLag !== bLag) return aLag - bLag;

  if (a.publishedAt !== b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
  return a.contentId.localeCompare(b.contentId);
}

function buildContentFilters({ from, to, platform }) {
  const clauses = ['company_id = ?'];
  const values = [];
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
  return { whereSql: clauses.join(' AND '), values };
}

function buildLeadsFilters({ from, to }) {
  const clauses = ['company_id = ?'];
  const values = [];
  if (from) {
    clauses.push('created_date >= ?');
    values.push(from);
  }
  if (to) {
    clauses.push('created_date <= ?');
    values.push(to);
  }
  return { whereSql: clauses.join(' AND '), values };
}

export class ContentLeadLinkageService {
  constructor({ db }) {
    this.db = db;
  }

  rebuild(payload) {
    const parsed = rebuildSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Invalid payload',
        details: parsed.error.flatten(),
      };
    }

    const { companyId, from, to, platform } = parsed.data;
    const contentRows = this.#loadScopedContentRows({ companyId, from, to, platform });
    const leadRows = this.#loadScopedLeadRows({ companyId, from, to });

    const { links, unlinked } = this.#matchLinks({ contentRows, leadRows });
    const upsertStmt = this.db.prepare(`
      INSERT INTO content_lead_links (
        id, company_id, lead_external_id, content_metric_id, match_method, confidence_level,
        match_score, day_lag, evidence_json, matcher_version, linked_at, updated_at
      ) VALUES (
        @id, @company_id, @lead_external_id, @content_metric_id, @match_method, @confidence_level,
        @match_score, @day_lag, @evidence_json, @matcher_version, @linked_at, @updated_at
      )
      ON CONFLICT(company_id, lead_external_id) DO UPDATE SET
        content_metric_id = excluded.content_metric_id,
        match_method = excluded.match_method,
        confidence_level = excluded.confidence_level,
        match_score = excluded.match_score,
        day_lag = excluded.day_lag,
        evidence_json = excluded.evidence_json,
        matcher_version = excluded.matcher_version,
        linked_at = excluded.linked_at,
        updated_at = excluded.updated_at
    `);

    const scopedLeadIds = leadRows.map((row) => row.lead_external_id);
    const now = new Date().toISOString();

    this.db.exec('BEGIN');
    try {
      if (scopedLeadIds.length > 0) {
        const placeholders = scopedLeadIds.map(() => '?').join(', ');
        const deleteStmt = this.db.prepare(`
          DELETE FROM content_lead_links
          WHERE company_id = ? AND lead_external_id IN (${placeholders})
        `);
        deleteStmt.run(companyId, ...scopedLeadIds);
      }

      for (const link of links) {
        upsertStmt.run({
          id: randomUUID(),
          company_id: companyId,
          lead_external_id: link.leadExternalId,
          content_metric_id: link.contentMetricId,
          match_method: link.matchMethod,
          confidence_level: link.confidenceLevel,
          match_score: link.matchScore,
          day_lag: Number.isFinite(link.dayLag) ? link.dayLag : null,
          evidence_json: JSON.stringify(link.evidence),
          matcher_version: 'v1',
          linked_at: now,
          updated_at: now,
        });
      }

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    const methodBreakdown = links.reduce((acc, link) => {
      acc[link.matchMethod] = (acc[link.matchMethod] ?? 0) + 1;
      return acc;
    }, {});
    const confidenceBreakdown = links.reduce((acc, link) => {
      acc[link.confidenceLevel] = (acc[link.confidenceLevel] ?? 0) + 1;
      return acc;
    }, {});

    return {
      ok: true,
      statusCode: 200,
      companyId,
      filters: { from: from ?? null, to: to ?? null, platform: platform ?? null },
      v1Constraint: 'one_active_content_link_per_lead_per_company',
      matcherVersion: 'v1',
      totalScopedLeads: leadRows.length,
      linkedLeads: links.length,
      unlinkedLeads: unlinked.length,
      linkageCoveragePercent: leadRows.length > 0 ? Number(((links.length / leadRows.length) * 100).toFixed(2)) : 0,
      methodBreakdown,
      confidenceBreakdown,
      unlinkedReasons: this.#summarizeReasons(unlinked),
      sampleLinks: links.slice(0, 20),
    };
  }

  getDiagnosticsBridgeSummary(params) {
    const companyId = String(params.companyId || '').trim();
    if (!companyId) return null;

    const from = params.from ? String(params.from) : null;
    const to = params.to ? String(params.to) : null;
    const platform = params.platform ? String(params.platform) : null;

    const contentRows = this.#loadScopedContentRows({ companyId, from, to, platform });
    const leadRows = this.#loadScopedLeadRows({ companyId, from, to });

    const leadSet = new Set(leadRows.map((row) => row.lead_external_id));
    const contentSet = new Set(contentRows.map((row) => row.id));

    if (leadSet.size === 0) {
      return {
        totalLeads: 0,
        linkedLeads: 0,
        unlinkedLeads: 0,
        linkageCoveragePercent: 0,
        methodBreakdown: {
          explicit_lead_link_key: 0,
          channel_date_window: 0,
        },
        confidenceBreakdown: {
          exact: 0,
          fallback: 0,
          incomplete: 0,
        },
        topUnlinkedReasons: [],
      };
    }

    const linkRows = this.db.prepare(`
      SELECT lead_external_id, content_metric_id, match_method, confidence_level
      FROM content_lead_links
      WHERE company_id = ?
    `).all(companyId);

    const linkedLeadIds = new Set();
    const methodBreakdown = {
      explicit_lead_link_key: 0,
      channel_date_window: 0,
    };
    const confidenceBreakdown = {
      exact: 0,
      fallback: 0,
      incomplete: 0,
    };

    for (const link of linkRows) {
      if (!leadSet.has(link.lead_external_id)) continue;
      if (!contentSet.has(link.content_metric_id)) continue;

      linkedLeadIds.add(link.lead_external_id);
      if (link.match_method === 'explicit_lead_link_key') methodBreakdown.explicit_lead_link_key += 1;
      else if (link.match_method === 'channel_date_window') methodBreakdown.channel_date_window += 1;

      if (link.confidence_level === 'exact') confidenceBreakdown.exact += 1;
      else if (link.confidence_level === 'fallback') confidenceBreakdown.fallback += 1;
    }

    const unlinked = leadRows
      .filter((lead) => !linkedLeadIds.has(lead.lead_external_id))
      .map((lead) => ({ lead, reason: this.#deriveUnlinkedReason({ lead, contentRows }) }));

    confidenceBreakdown.incomplete = unlinked.length;

    const totalLeads = leadRows.length;
    const linkedLeads = linkedLeadIds.size;
    const unlinkedLeads = totalLeads - linkedLeads;

    return {
      totalLeads,
      linkedLeads,
      unlinkedLeads,
      linkageCoveragePercent: totalLeads > 0 ? Number(((linkedLeads / totalLeads) * 100).toFixed(2)) : 0,
      methodBreakdown,
      confidenceBreakdown,
      topUnlinkedReasons: this.#summarizeReasons(unlinked.map((row) => ({ reason: row.reason }))),
    };
  }

  #loadScopedContentRows({ companyId, from, to, platform }) {
    const filters = buildContentFilters({ from, to, platform });
    const stmt = this.db.prepare(`
      SELECT
        id,
        content_id,
        published_at,
        channel_campaign_external_id,
        lead_link_key,
        attribution_window_days
      FROM content_metrics
      WHERE ${filters.whereSql}
      ORDER BY published_at DESC, updated_at DESC
    `);
    return stmt.all(companyId, ...filters.values);
  }

  #loadScopedLeadRows({ companyId, from, to }) {
    const filters = buildLeadsFilters({ from, to });
    const stmt = this.db.prepare(`
      SELECT
        lead_external_id,
        channel_campaign_external_id,
        created_date,
        lead_link_key
      FROM leads
      WHERE ${filters.whereSql}
      ORDER BY created_date DESC, updated_at DESC
    `);
    return stmt.all(companyId, ...filters.values);
  }

  #matchLinks({ contentRows, leadRows }) {
    const byLeadLinkKey = new Map();
    const byChannel = new Map();

    for (const content of contentRows) {
      if (content.lead_link_key) {
        const arr = byLeadLinkKey.get(content.lead_link_key) ?? [];
        arr.push(content);
        byLeadLinkKey.set(content.lead_link_key, arr);
      }
      if (content.channel_campaign_external_id) {
        const arr = byChannel.get(content.channel_campaign_external_id) ?? [];
        arr.push(content);
        byChannel.set(content.channel_campaign_external_id, arr);
      }
    }

    const links = [];
    const unlinked = [];

    for (const lead of leadRows) {
      const leadDate = parseYmd(lead.created_date);
      const exactCandidates = [];
      const fallbackCandidates = [];

      if (lead.lead_link_key && byLeadLinkKey.has(lead.lead_link_key)) {
        for (const content of byLeadLinkKey.get(lead.lead_link_key)) {
          const publishedAtDate = parseYmd(content.published_at);
          const lag = leadDate && publishedAtDate ? dayDiff(publishedAtDate, leadDate) : null;
          exactCandidates.push({
            leadExternalId: lead.lead_external_id,
            contentMetricId: content.id,
            contentId: content.content_id,
            publishedAt: content.published_at,
            matchMethod: 'explicit_lead_link_key',
            confidenceLevel: 'exact',
            dayLag: lag,
            matchScore: 100,
            evidence: {
              matchedOn: ['lead_link_key'],
              leadLinkKey: lead.lead_link_key,
              channelCampaignExternalId: content.channel_campaign_external_id ?? null,
            },
          });
        }
      }

      if (lead.channel_campaign_external_id && leadDate && byChannel.has(lead.channel_campaign_external_id)) {
        for (const content of byChannel.get(lead.channel_campaign_external_id)) {
          const publishedAtDate = parseYmd(content.published_at);
          if (!publishedAtDate) continue;

          const lag = dayDiff(publishedAtDate, leadDate);
          if (lag < 0) continue;
          const windowDays = Number(content.attribution_window_days ?? 30);
          if (lag > windowDays) continue;

          fallbackCandidates.push({
            leadExternalId: lead.lead_external_id,
            contentMetricId: content.id,
            contentId: content.content_id,
            publishedAt: content.published_at,
            matchMethod: 'channel_date_window',
            confidenceLevel: 'fallback',
            dayLag: lag,
            matchScore: fallbackScore(lag),
            evidence: {
              matchedOn: ['channel_campaign_external_id', 'created_date_window'],
              channelCampaignExternalId: lead.channel_campaign_external_id,
              attributionWindowDays: windowDays,
            },
          });
        }
      }

      const sortedExact = exactCandidates.sort(sortCandidates);
      const sortedFallback = fallbackCandidates.sort(sortCandidates);
      const winner = sortedExact[0] ?? sortedFallback[0];

      if (winner) {
        links.push(winner);
      } else {
        unlinked.push({
          leadExternalId: lead.lead_external_id,
          reason: this.#deriveUnlinkedReason({ lead, contentRows }),
        });
      }
    }

    return { links, unlinked };
  }

  #deriveUnlinkedReason({ lead, contentRows }) {
    if (!lead.channel_campaign_external_id) return 'missing_channel_campaign_external_id';
    if (!lead.created_date) return 'missing_created_date';

    const leadDate = parseYmd(lead.created_date);
    if (!leadDate) return 'invalid_created_date';

    const sameChannel = contentRows.filter(
      (content) => content.channel_campaign_external_id && content.channel_campaign_external_id === lead.channel_campaign_external_id,
    );
    if (sameChannel.length === 0) return 'no_content_for_channel';

    for (const content of sameChannel) {
      const publishedAtDate = parseYmd(content.published_at);
      if (!publishedAtDate) continue;
      const lag = dayDiff(publishedAtDate, leadDate);
      if (lag < 0) continue;
      const windowDays = Number(content.attribution_window_days ?? 30);
      if (lag <= windowDays) return 'link_exists_but_not_selected';
    }
    return 'no_content_in_window';
  }

  #summarizeReasons(unlinkedRows) {
    const counts = new Map();
    for (const row of unlinkedRows) {
      const reason = row.reason || 'unknown';
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }
}
