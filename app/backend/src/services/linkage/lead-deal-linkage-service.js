import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

const rebuildSchema = z.object({
  companyId: z.string().min(1),
  from: z.string().regex(ymdRegex).optional(),
  to: z.string().regex(ymdRegex).optional(),
});

function buildDealFilters({ from, to }) {
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

function sortLeadRows(a, b) {
  return String(a.lead_external_id).localeCompare(String(b.lead_external_id));
}

function buildReasonSummary(rows) {
  const counts = new Map();
  for (const row of rows) {
    const reason = row.reason || 'unknown';
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export class LeadDealLinkageService {
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

    const { companyId, from, to } = parsed.data;
    const dealRows = this.#loadScopedDeals({ companyId, from, to });
    const leadRows = this.#loadLeadRows({ companyId });
    const { links, unlinked } = this.#match({ dealRows, leadRows });
    const now = new Date().toISOString();

    const upsertStmt = this.db.prepare(`
      INSERT INTO lead_deal_links (
        id, company_id, deal_external_id, lead_external_id, match_method, confidence_level,
        evidence_json, matcher_version, linked_at, updated_at
      ) VALUES (
        @id, @company_id, @deal_external_id, @lead_external_id, @match_method, @confidence_level,
        @evidence_json, @matcher_version, @linked_at, @updated_at
      )
      ON CONFLICT(company_id, deal_external_id) DO UPDATE SET
        lead_external_id = excluded.lead_external_id,
        match_method = excluded.match_method,
        confidence_level = excluded.confidence_level,
        evidence_json = excluded.evidence_json,
        matcher_version = excluded.matcher_version,
        linked_at = excluded.linked_at,
        updated_at = excluded.updated_at
    `);

    this.db.exec('BEGIN');
    try {
      if (dealRows.length > 0) {
        const dealIds = dealRows.map((d) => d.deal_external_id);
        const placeholders = dealIds.map(() => '?').join(', ');
        this.db.prepare(`
          DELETE FROM lead_deal_links
          WHERE company_id = ? AND deal_external_id IN (${placeholders})
        `).run(companyId, ...dealIds);
      }

      for (const link of links) {
        upsertStmt.run({
          id: randomUUID(),
          company_id: companyId,
          deal_external_id: link.dealExternalId,
          lead_external_id: link.leadExternalId,
          match_method: link.matchMethod,
          confidence_level: link.confidenceLevel,
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

    const methodBreakdown = {
      explicit_lead_external_id: 0,
      explicit_lead_link_key: 0,
    };
    const confidenceBreakdown = {
      exact: 0,
      fallback: 0,
      incomplete: unlinked.length,
    };
    for (const link of links) {
      if (link.matchMethod === 'explicit_lead_external_id') methodBreakdown.explicit_lead_external_id += 1;
      if (link.matchMethod === 'explicit_lead_link_key') methodBreakdown.explicit_lead_link_key += 1;
      if (link.confidenceLevel === 'exact') confidenceBreakdown.exact += 1;
      if (link.confidenceLevel === 'fallback') confidenceBreakdown.fallback += 1;
    }

    return {
      ok: true,
      statusCode: 200,
      companyId,
      filters: { from: from ?? null, to: to ?? null },
      matcherVersion: 'v1',
      strictFallback: true,
      totalScopedDeals: dealRows.length,
      linkedDeals: links.length,
      unlinkedDeals: unlinked.length,
      linkageCoveragePercent: dealRows.length > 0 ? Number(((links.length / dealRows.length) * 100).toFixed(2)) : 0,
      methodBreakdown,
      confidenceBreakdown,
      topUnlinkedReasons: buildReasonSummary(unlinked),
      sampleLinks: links.slice(0, 20),
    };
  }

  getDiagnosticsBridgeSummary(params) {
    const companyId = String(params.companyId || '').trim();
    if (!companyId) return null;
    const from = params.from ? String(params.from) : null;
    const to = params.to ? String(params.to) : null;

    const dealRows = this.#loadScopedDeals({ companyId, from, to });
    if (dealRows.length === 0) {
      return {
        totalDeals: 0,
        linkedDeals: 0,
        unlinkedDeals: 0,
        linkageCoveragePercent: 0,
        methodBreakdown: {
          explicit_lead_external_id: 0,
          explicit_lead_link_key: 0,
        },
        confidenceBreakdown: {
          exact: 0,
          fallback: 0,
          incomplete: 0,
        },
        topUnlinkedReasons: [],
      };
    }

    const dealSet = new Set(dealRows.map((row) => row.deal_external_id));
    const linkRows = this.db.prepare(`
      SELECT deal_external_id, match_method, confidence_level
      FROM lead_deal_links
      WHERE company_id = ?
    `).all(companyId);

    const linkedDeals = new Set();
    const methodBreakdown = {
      explicit_lead_external_id: 0,
      explicit_lead_link_key: 0,
    };
    const confidenceBreakdown = {
      exact: 0,
      fallback: 0,
      incomplete: 0,
    };

    for (const row of linkRows) {
      if (!dealSet.has(row.deal_external_id)) continue;
      linkedDeals.add(row.deal_external_id);
      if (row.match_method === 'explicit_lead_external_id') methodBreakdown.explicit_lead_external_id += 1;
      if (row.match_method === 'explicit_lead_link_key') methodBreakdown.explicit_lead_link_key += 1;
      if (row.confidence_level === 'exact') confidenceBreakdown.exact += 1;
      if (row.confidence_level === 'fallback') confidenceBreakdown.fallback += 1;
    }

    const leadRows = this.#loadLeadRows({ companyId });
    const { unlinked } = this.#match({ dealRows: dealRows.filter((d) => !linkedDeals.has(d.deal_external_id)), leadRows });
    confidenceBreakdown.incomplete = unlinked.length;

    return {
      totalDeals: dealRows.length,
      linkedDeals: linkedDeals.size,
      unlinkedDeals: dealRows.length - linkedDeals.size,
      linkageCoveragePercent: dealRows.length > 0 ? Number(((linkedDeals.size / dealRows.length) * 100).toFixed(2)) : 0,
      methodBreakdown,
      confidenceBreakdown,
      topUnlinkedReasons: buildReasonSummary(unlinked),
    };
  }

  #loadScopedDeals({ companyId, from, to }) {
    const filters = buildDealFilters({ from, to });
    return this.db.prepare(`
      SELECT deal_external_id, lead_external_id, lead_link_key, created_date
      FROM deals
      WHERE ${filters.whereSql}
      ORDER BY created_date DESC, updated_at DESC
    `).all(companyId, ...filters.values);
  }

  #loadLeadRows({ companyId }) {
    return this.db.prepare(`
      SELECT lead_external_id, lead_link_key
      FROM leads
      WHERE company_id = ?
      ORDER BY lead_external_id ASC
    `).all(companyId);
  }

  #match({ dealRows, leadRows }) {
    const leadsById = new Map();
    const leadsByLinkKey = new Map();

    for (const lead of leadRows) {
      if (lead.lead_external_id) leadsById.set(lead.lead_external_id, lead);
      if (lead.lead_link_key) {
        const arr = leadsByLinkKey.get(lead.lead_link_key) ?? [];
        arr.push(lead);
        leadsByLinkKey.set(lead.lead_link_key, arr);
      }
    }
    for (const arr of leadsByLinkKey.values()) arr.sort(sortLeadRows);

    const links = [];
    const unlinked = [];

    for (const deal of dealRows) {
      if (deal.lead_external_id && leadsById.has(deal.lead_external_id)) {
        links.push({
          dealExternalId: deal.deal_external_id,
          leadExternalId: deal.lead_external_id,
          matchMethod: 'explicit_lead_external_id',
          confidenceLevel: 'exact',
          evidence: {
            matchedOn: ['lead_external_id'],
            dealLeadExternalId: deal.lead_external_id,
          },
        });
        continue;
      }

      if (deal.lead_link_key && leadsByLinkKey.has(deal.lead_link_key)) {
        const candidate = leadsByLinkKey.get(deal.lead_link_key)[0];
        links.push({
          dealExternalId: deal.deal_external_id,
          leadExternalId: candidate.lead_external_id,
          matchMethod: 'explicit_lead_link_key',
          confidenceLevel: 'fallback',
          evidence: {
            matchedOn: ['lead_link_key'],
            leadLinkKey: deal.lead_link_key,
            deterministicTieBreak: 'lead_external_id_asc',
          },
        });
        continue;
      }

      let reason = 'insufficient_deterministic_evidence';
      if (!deal.lead_external_id && !deal.lead_link_key) reason = 'missing_lead_external_id_and_lead_link_key';
      else if (deal.lead_external_id && !leadsById.has(deal.lead_external_id)) reason = 'lead_external_id_not_found';
      else if (deal.lead_link_key && !leadsByLinkKey.has(deal.lead_link_key)) reason = 'lead_link_key_not_found';

      unlinked.push({
        dealExternalId: deal.deal_external_id,
        reason,
      });
    }

    return { links, unlinked };
  }
}
