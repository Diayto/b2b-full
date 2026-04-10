import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

const fromDiagnosticsSchema = z.object({
  companyId: z.string().min(1),
});

const updateActionSchema = z.object({
  status: z.enum(['open', 'in_progress', 'done']).optional(),
  owner: z.string().trim().min(1).max(120).optional(),
  dueDate: z.string().regex(ymdRegex).optional(),
  closureNote: z.string().trim().min(1).max(2000).optional(),
  closureEvidence: z.union([z.string(), z.array(z.string()), z.record(z.any())]).optional(),
});

function normalizeText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value ?? '');
  } catch {
    return fallback;
  }
}

function parseDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateDiffDays(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function computeSignals(row) {
  const status = String(row.status || '');
  const dueDate = normalizeText(row.due_date);
  const updated = parseDate(row.updated_at);
  const now = new Date();

  const active = status !== 'done';
  const isOverdue = Boolean(active && dueDate && dueDate < todayYmd());
  const daysOverdue = isOverdue && dueDate ? dateDiffDays(now, parseDate(`${dueDate}T00:00:00.000Z`) ?? now) : 0;

  const daysSinceUpdate = updated ? Math.max(0, dateDiffDays(now, updated)) : 0;
  const isStale = Boolean(active && daysSinceUpdate >= 7);
  const isEscalated = Boolean(active && (daysOverdue >= 3 || daysSinceUpdate >= 14));

  return {
    isOverdue,
    daysOverdue,
    isStale,
    daysSinceUpdate,
    isEscalated,
  };
}

function mapRow(row) {
  const signals = computeSignals(row);
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    description: row.description,
    status: row.status,
    owner: row.owner,
    dueDate: row.due_date,
    diagnostic: {
      type: row.diagnostic_type,
      key: row.diagnostic_key,
      sourceBlock: row.source_block,
      evidence: JSON.parse(row.evidence_json || '{}'),
    },
    relatedEntity: row.related_entity_type || row.related_entity_id
      ? { type: row.related_entity_type, id: row.related_entity_id }
      : null,
    suggestedByRule: row.suggested_by_rule,
    closureNote: row.closure_note,
    closureEvidence: parseJson(row.closure_evidence_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    reviewedAt: row.reviewed_at,
    signals,
  };
}

function daysFromNow(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildRuleBasedSuggestions(diagnostics) {
  const out = [];
  const generatedAt = new Date().toISOString();
  const freshness = diagnostics?.freshness;
  const health = diagnostics?.ingestionHealth;
  const linkage = diagnostics?.leadLinkageBridge;
  const leadDealBridge = diagnostics?.leadDealBridge;

  if (freshness && Number.isFinite(freshness.daysSinceLastIngest) && freshness.daysSinceLastIngest > 7) {
    out.push({
      title: 'Refresh Instagram/organic ingestion',
      description: 'Content metrics ingestion is stale and should be refreshed to keep decisions current.',
      diagnosticType: 'freshness',
      diagnosticKey: 'days_since_last_ingest_gt_7',
      sourceBlock: 'freshness',
      suggestedByRule: 'freshness.days_since_last_ingest > 7',
      dueDate: daysFromNow(2),
      evidence: {
        generatedAt,
        threshold: 7,
        observedDaysSinceLastIngest: freshness.daysSinceLastIngest,
        lastIngestedAt: freshness.lastIngestedAt ?? null,
      },
      relatedEntityType: null,
      relatedEntityId: null,
    });
  }

  if (health && Number(health.failedJobs ?? 0) > 0) {
    out.push({
      title: 'Investigate failed content ingestion jobs',
      description: 'Recent ingestion failures can reduce trust and freshness of Instagram/organic analytics.',
      diagnosticType: 'ingestion_health',
      diagnosticKey: 'failed_jobs_gt_0',
      sourceBlock: 'ingestionHealth',
      suggestedByRule: 'ingestionHealth.failedJobs > 0',
      dueDate: daysFromNow(1),
      evidence: {
        generatedAt,
        failedJobs: Number(health.failedJobs ?? 0),
        lastFailedAt: health.lastFailedAt ?? null,
      },
      relatedEntityType: health.latestJob?.id ? 'ingestion_job' : null,
      relatedEntityId: health.latestJob?.id ?? null,
    });
  }

  if (linkage && Number.isFinite(linkage.linkageCoveragePercent) && linkage.linkageCoveragePercent < 70) {
    out.push({
      title: 'Improve content-to-lead linkage coverage',
      description: 'Linkage coverage is below target, reducing confidence in organic-to-lead signal continuity.',
      diagnosticType: 'lead_linkage',
      diagnosticKey: 'linkage_coverage_lt_70',
      sourceBlock: 'leadLinkageBridge',
      suggestedByRule: 'leadLinkageBridge.linkageCoveragePercent < 70',
      dueDate: daysFromNow(3),
      evidence: {
        generatedAt,
        threshold: 70,
        linkageCoveragePercent: linkage.linkageCoveragePercent,
        linkedLeads: linkage.linkedLeads,
        unlinkedLeads: linkage.unlinkedLeads,
      },
      relatedEntityType: null,
      relatedEntityId: null,
    });
  }

  if (linkage && Array.isArray(linkage.topUnlinkedReasons) && linkage.topUnlinkedReasons.length > 0) {
    const top = linkage.topUnlinkedReasons[0];
    out.push({
      title: `Address top unlinked reason: ${top.reason}`,
      description: 'Resolve the largest unlinked-lead reason to improve deterministic content-to-lead continuity.',
      diagnosticType: 'lead_linkage',
      diagnosticKey: `top_unlinked_reason_${top.reason}`,
      sourceBlock: 'leadLinkageBridge.topUnlinkedReasons',
      suggestedByRule: 'leadLinkageBridge.topUnlinkedReasons[0] exists',
      dueDate: daysFromNow(3),
      evidence: {
        generatedAt,
        topReason: top.reason,
        count: Number(top.count ?? 0),
      },
      relatedEntityType: 'reason_code',
      relatedEntityId: top.reason,
    });
  }

  if (leadDealBridge && Number.isFinite(leadDealBridge.linkageCoveragePercent) && leadDealBridge.linkageCoveragePercent < 75) {
    out.push({
      title: 'Improve lead-to-deal linkage coverage',
      description: 'Lead→deal deterministic coverage is below target and should be improved before downstream expansion.',
      diagnosticType: 'lead_deal_linkage',
      diagnosticKey: 'lead_deal_linkage_coverage_lt_75',
      sourceBlock: 'leadDealBridge',
      suggestedByRule: 'leadDealBridge.linkageCoveragePercent < 75',
      dueDate: daysFromNow(3),
      evidence: {
        generatedAt,
        threshold: 75,
        linkageCoveragePercent: leadDealBridge.linkageCoveragePercent,
        linkedDeals: leadDealBridge.linkedDeals,
        unlinkedDeals: leadDealBridge.unlinkedDeals,
      },
      relatedEntityType: null,
      relatedEntityId: null,
    });
  }

  if (leadDealBridge && Array.isArray(leadDealBridge.topUnlinkedReasons) && leadDealBridge.topUnlinkedReasons.length > 0) {
    const top = leadDealBridge.topUnlinkedReasons[0];
    out.push({
      title: `Resolve top lead→deal unlinked reason: ${top.reason}`,
      description: 'Address the biggest deterministic break in the lead→deal boundary.',
      diagnosticType: 'lead_deal_linkage',
      diagnosticKey: `lead_deal_top_unlinked_reason_${top.reason}`,
      sourceBlock: 'leadDealBridge.topUnlinkedReasons',
      suggestedByRule: 'leadDealBridge.topUnlinkedReasons[0] exists',
      dueDate: daysFromNow(2),
      evidence: {
        generatedAt,
        topReason: top.reason,
        count: Number(top.count ?? 0),
      },
      relatedEntityType: 'reason_code',
      relatedEntityId: top.reason,
    });
  }

  return out;
}

export class ActionItemsService {
  constructor({ db, contentMetricsService }) {
    this.db = db;
    this.contentMetricsService = contentMetricsService;
  }

  createFromDiagnostics(payload) {
    const parsed = fromDiagnosticsSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Invalid payload',
        details: parsed.error.flatten(),
      };
    }

    const companyId = parsed.data.companyId;
    const diagnostics = this.contentMetricsService.diagnostics({ companyId });
    if (!diagnostics.ok) {
      return diagnostics;
    }

    const suggestions = buildRuleBasedSuggestions(diagnostics);
    const findOpenStmt = this.db.prepare(`
      SELECT id FROM action_items
      WHERE company_id = ? AND diagnostic_type = ? AND diagnostic_key = ? AND status IN ('open', 'in_progress')
      LIMIT 1
    `);
    const insertStmt = this.db.prepare(`
      INSERT INTO action_items (
        id, company_id, title, description, status, owner, due_date,
        diagnostic_type, diagnostic_key, source_block, evidence_json,
        related_entity_type, related_entity_id, suggested_by_rule,
        closure_note, closure_evidence_json, reviewed_at,
        created_at, updated_at, completed_at
      ) VALUES (
        @id, @company_id, @title, @description, @status, @owner, @due_date,
        @diagnostic_type, @diagnostic_key, @source_block, @evidence_json,
        @related_entity_type, @related_entity_id, @suggested_by_rule,
        @closure_note, @closure_evidence_json, @reviewed_at,
        @created_at, @updated_at, @completed_at
      )
    `);

    const now = new Date().toISOString();
    const created = [];
    const skipped = [];

    this.db.exec('BEGIN');
    try {
      for (const s of suggestions) {
        const existing = findOpenStmt.get(companyId, s.diagnosticType, s.diagnosticKey);
        if (existing) {
          skipped.push({
            diagnosticType: s.diagnosticType,
            diagnosticKey: s.diagnosticKey,
            existingActionId: existing.id,
            reason: 'already_open',
          });
          continue;
        }

        const id = randomUUID();
        insertStmt.run({
          id,
          company_id: companyId,
          title: s.title,
          description: s.description,
          status: 'open',
          owner: null,
          due_date: s.dueDate,
          diagnostic_type: s.diagnosticType,
          diagnostic_key: s.diagnosticKey,
          source_block: s.sourceBlock,
          evidence_json: JSON.stringify(s.evidence),
          related_entity_type: s.relatedEntityType,
          related_entity_id: s.relatedEntityId,
          suggested_by_rule: s.suggestedByRule,
          closure_note: null,
          closure_evidence_json: null,
          reviewed_at: null,
          created_at: now,
          updated_at: now,
          completed_at: null,
        });
        created.push(id);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return {
      ok: true,
      statusCode: 200,
      companyId,
      generatedRules: suggestions.length,
      createdCount: created.length,
      skippedCount: skipped.length,
      createdActionIds: created,
      skipped,
    };
  }

  list(params) {
    const companyId = String(params.companyId || '').trim();
    if (!companyId) {
      return { ok: false, statusCode: 400, error: 'Missing companyId' };
    }
    const status = normalizeText(params.status);
    const limit = Math.min(200, Math.max(1, Number(params.limit) || 50));
    const offset = Math.max(0, Number(params.offset) || 0);

    const clauses = ['company_id = ?'];
    const values = [companyId];
    if (status) {
      clauses.push('status = ?');
      values.push(status);
    }
    const whereSql = `WHERE ${clauses.join(' AND ')}`;

    const rows = this.db.prepare(`
      SELECT *
      FROM action_items
      ${whereSql}
      ORDER BY
        CASE status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END ASC,
        updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...values, limit, offset);

    const totalRow = this.db.prepare(`
      SELECT COUNT(*) AS total
      FROM action_items
      ${whereSql}
    `).get(...values);

    return {
      ok: true,
      statusCode: 200,
      companyId,
      filters: { status, limit, offset },
      total: Number(totalRow?.total ?? 0),
      items: rows.map(mapRow),
    };
  }

  update(params, payload) {
    const companyId = String(params.companyId || '').trim();
    const actionId = String(params.actionId || '').trim();
    if (!companyId) return { ok: false, statusCode: 400, error: 'Missing companyId' };
    if (!actionId) return { ok: false, statusCode: 400, error: 'Missing actionId' };

    const parsed = updateActionSchema.safeParse(payload || {});
    if (!parsed.success) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Invalid payload',
        details: parsed.error.flatten(),
      };
    }

    const row = this.db.prepare(`
      SELECT *
      FROM action_items
      WHERE id = ? AND company_id = ?
      LIMIT 1
    `).get(actionId, companyId);
    if (!row) return { ok: false, statusCode: 404, error: 'Action not found' };

    const now = new Date().toISOString();
    const previousStatus = String(row.status || 'open');
    const status = parsed.data.status ?? row.status;
    const owner = parsed.data.owner !== undefined ? normalizeText(parsed.data.owner) : row.owner;
    const dueDate = parsed.data.dueDate !== undefined ? normalizeText(parsed.data.dueDate) : row.due_date;
    const transitioningToDone = previousStatus !== 'done' && status === 'done';

    const closureNote =
      parsed.data.closureNote !== undefined
        ? normalizeText(parsed.data.closureNote)
        : row.closure_note;

    if (transitioningToDone && !closureNote) {
      return {
        ok: false,
        statusCode: 400,
        error: 'closureNote is required when transitioning action to done',
      };
    }

    const closureEvidenceValue =
      parsed.data.closureEvidence !== undefined
        ? parsed.data.closureEvidence
        : parseJson(row.closure_evidence_json, null);
    const closureEvidenceJson =
      closureEvidenceValue === undefined || closureEvidenceValue === null
        ? null
        : JSON.stringify(closureEvidenceValue);

    const completedAt = status === 'done' ? (row.completed_at ?? now) : null;
    const reviewedAt = status === 'done' ? now : row.reviewed_at;

    this.db.prepare(`
      UPDATE action_items
      SET
        status = ?,
        owner = ?,
        due_date = ?,
        closure_note = ?,
        closure_evidence_json = ?,
        reviewed_at = ?,
        completed_at = ?,
        updated_at = ?
      WHERE id = ? AND company_id = ?
    `).run(
      status,
      owner,
      dueDate,
      closureNote,
      closureEvidenceJson,
      reviewedAt,
      completedAt,
      now,
      actionId,
      companyId,
    );

    const updated = this.db.prepare(`
      SELECT *
      FROM action_items
      WHERE id = ? AND company_id = ?
      LIMIT 1
    `).get(actionId, companyId);

    return {
      ok: true,
      statusCode: 200,
      item: mapRow(updated),
    };
  }

  weeklyReviewSummary(params) {
    const companyId = String(params.companyId || '').trim();
    if (!companyId) {
      return { ok: false, statusCode: 400, error: 'Missing companyId' };
    }

    const weekStart = normalizeText(params.weekStart) || (() => {
      const d = new Date();
      const day = d.getUTCDay();
      const diffToMonday = (day + 6) % 7;
      d.setUTCDate(d.getUTCDate() - diffToMonday);
      return d.toISOString().slice(0, 10);
    })();
    const weekEndDate = new Date(`${weekStart}T00:00:00.000Z`);
    if (Number.isNaN(weekEndDate.getTime())) {
      return { ok: false, statusCode: 400, error: 'Invalid weekStart' };
    }
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);

    const rows = this.db.prepare(`
      SELECT *
      FROM action_items
      WHERE company_id = ?
      ORDER BY updated_at DESC
    `).all(companyId);

    let createdThisWeek = 0;
    let completedThisWeek = 0;
    let openCount = 0;
    let inProgressCount = 0;
    let doneCount = 0;
    let overdueOpen = 0;
    let staleOpen = 0;
    let escalatedOpen = 0;

    const reasonCounts = new Map();
    const typeCounts = new Map();

    for (const row of rows) {
      const createdDate = normalizeText(row.created_at)?.slice(0, 10);
      const completedDate = normalizeText(row.completed_at)?.slice(0, 10);
      if (createdDate && createdDate >= weekStart && createdDate <= weekEnd) createdThisWeek += 1;
      if (completedDate && completedDate >= weekStart && completedDate <= weekEnd) completedThisWeek += 1;

      if (row.status === 'open') openCount += 1;
      if (row.status === 'in_progress') inProgressCount += 1;
      if (row.status === 'done') doneCount += 1;

      const signals = computeSignals(row);
      if (row.status !== 'done' && signals.isOverdue) overdueOpen += 1;
      if (row.status !== 'done' && signals.isStale) staleOpen += 1;
      if (row.status !== 'done' && signals.isEscalated) escalatedOpen += 1;

      const type = String(row.diagnostic_type || 'unknown');
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);

      const reasonKey = `${row.diagnostic_type}:${row.diagnostic_key}`;
      reasonCounts.set(reasonKey, (reasonCounts.get(reasonKey) ?? 0) + 1);
    }

    const topDiagnosticReasons = Array.from(reasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const byDiagnosticType = Array.from(typeCounts.entries())
      .map(([diagnosticType, count]) => ({ diagnosticType, count }))
      .sort((a, b) => b.count - a.count);

    return {
      ok: true,
      statusCode: 200,
      companyId,
      weekStart,
      weekEnd,
      summary: {
        createdThisWeek,
        completedThisWeek,
        openCount,
        inProgressCount,
        doneCount,
        overdueOpen,
        staleOpen,
        escalatedOpen,
        byDiagnosticType,
        topDiagnosticReasons,
      },
    };
  }
}
