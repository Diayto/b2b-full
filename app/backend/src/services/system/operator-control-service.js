import { randomUUID } from 'node:crypto';

const ACTIONS = {
  generate_actions: { label: 'Regenerate Actions', cooldownSeconds: 120 },
  rebuild_content_lead: { label: 'Rebuild Content->Lead', cooldownSeconds: 180 },
  rebuild_lead_deal: { label: 'Rebuild Lead->Deal', cooldownSeconds: 180 },
};

function nowIso() {
  return new Date().toISOString();
}

function addSeconds(iso, seconds) {
  const d = new Date(iso);
  d.setUTCSeconds(d.getUTCSeconds() + seconds);
  return d.toISOString();
}

function toOperatorError({ code, message, details, cooldownUntil, actionType, lastRun }) {
  return {
    code,
    message,
    details: details ?? null,
    actionType: actionType ?? null,
    cooldownUntil: cooldownUntil ?? null,
    lastRun: lastRun ?? null,
  };
}

function summarizeResult(result) {
  if (!result || typeof result !== 'object') return null;
  const summary = {};

  for (const key of [
    'createdCount',
    'skippedCount',
    'linkedLeads',
    'unlinkedLeads',
    'linkedDeals',
    'unlinkedDeals',
    'linkageCoveragePercent',
    'generatedRules',
  ]) {
    if (result[key] !== undefined) summary[key] = result[key];
  }
  return summary;
}

function toActionCode(actionType) {
  if (actionType === 'generate_actions') return 'generate_actions';
  if (actionType === 'rebuild_content_lead') return 'rebuild_content_lead';
  if (actionType === 'rebuild_lead_deal') return 'rebuild_lead_deal';
  return 'operator_action';
}

function deriveFailureCode(resultStatusCode) {
  if (resultStatusCode === 400) return 'invalid_request';
  if (resultStatusCode === 404) return 'not_found';
  if (resultStatusCode === 409) return 'conflict';
  if (resultStatusCode === 429) return 'cooldown_active';
  if (resultStatusCode === 503) return 'feature_disabled';
  return 'operation_failed';
}

function mapEventRow(row) {
  if (!row) return null;
  let resultSummary = null;
  try {
    resultSummary = row.result_summary_json ? JSON.parse(row.result_summary_json) : null;
  } catch {
    resultSummary = null;
  }
  return {
    id: row.id,
    actionType: row.action_type,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cooldownUntil: row.cooldown_until,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    resultSummary,
  };
}

export class OperatorControlService {
  constructor({ db }) {
    this.db = db;
  }

  execute({ companyId, actionType, requestId, payload, run }) {
    const actionDef = ACTIONS[actionType];
    if (!actionDef) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Unknown operator action',
        operatorError: toOperatorError({
          code: 'unknown_action',
          message: 'Unknown operator action.',
          details: { actionType },
          actionType,
        }),
      };
    }

    const cleanCompanyId = String(companyId || '').trim();
    if (!cleanCompanyId) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Missing companyId',
        operatorError: toOperatorError({
          code: 'missing_company_id',
          message: 'Company ID is required for this operator action.',
          actionType,
        }),
      };
    }

    const latest = this.getLatestEvent({ companyId: cleanCompanyId, actionType });
    const now = nowIso();

    if (latest?.cooldownUntil && latest.cooldownUntil > now) {
      const blockedId = randomUUID();
      this.#insertEvent({
        id: blockedId,
        companyId: cleanCompanyId,
        actionType,
        status: 'blocked_cooldown',
        requestId,
        requestPayloadJson: payload ? JSON.stringify(payload) : null,
        resultSummaryJson: null,
        errorCode: 'cooldown_active',
        errorMessage: `Action is cooling down until ${latest.cooldownUntil}`,
        startedAt: now,
        completedAt: now,
        cooldownUntil: latest.cooldownUntil,
      });

      return {
        ok: false,
        statusCode: 429,
        error: 'Action is in cooldown',
        operatorError: toOperatorError({
          code: 'cooldown_active',
          message: `Please wait until ${latest.cooldownUntil} before retrying.`,
          cooldownUntil: latest.cooldownUntil,
          actionType,
          lastRun: latest,
        }),
      };
    }

    const eventId = randomUUID();
    this.#insertEvent({
      id: eventId,
      companyId: cleanCompanyId,
      actionType,
      status: 'running',
      requestId,
      requestPayloadJson: payload ? JSON.stringify(payload) : null,
      resultSummaryJson: null,
      errorCode: null,
      errorMessage: null,
      startedAt: now,
      completedAt: null,
      cooldownUntil: null,
    });

    try {
      const result = run();
      const completedAt = nowIso();

      if (!result?.ok) {
        const statusCode = Number(result?.statusCode) || 400;
        const failureCode = deriveFailureCode(statusCode);
        const failureMessage = result?.error || 'Operator action failed';
        const cooldownUntil = addSeconds(completedAt, actionDef.cooldownSeconds);

        this.#updateEvent({
          id: eventId,
          status: 'failed',
          resultSummaryJson: JSON.stringify(summarizeResult(result)),
          errorCode: failureCode,
          errorMessage: failureMessage,
          completedAt,
          cooldownUntil,
        });

        return {
          ...result,
          operatorError: toOperatorError({
            code: failureCode,
            message: failureMessage,
            details: result?.details ?? null,
            actionType,
            cooldownUntil,
          }),
          operatorControl: {
            actionType,
            eventId,
            status: 'failed',
            cooldownUntil,
          },
        };
      }

      const cooldownUntil = addSeconds(completedAt, actionDef.cooldownSeconds);
      this.#updateEvent({
        id: eventId,
        status: 'completed',
        resultSummaryJson: JSON.stringify(summarizeResult(result)),
        errorCode: null,
        errorMessage: null,
        completedAt,
        cooldownUntil,
      });

      return {
        ...result,
        operatorControl: {
          actionType,
          eventId,
          status: 'completed',
          cooldownUntil,
        },
      };
    } catch (error) {
      const completedAt = nowIso();
      const cooldownUntil = addSeconds(completedAt, actionDef.cooldownSeconds);
      this.#updateEvent({
        id: eventId,
        status: 'failed',
        resultSummaryJson: null,
        errorCode: 'internal_error',
        errorMessage: String(error?.message || 'Unexpected error'),
        completedAt,
        cooldownUntil,
      });

      return {
        ok: false,
        statusCode: 500,
        error: 'Operator action failed unexpectedly',
        operatorError: toOperatorError({
          code: 'internal_error',
          message: 'Unexpected operator action error.',
          details: { action: toActionCode(actionType) },
          actionType,
          cooldownUntil,
        }),
      };
    }
  }

  getLatestEvent({ companyId, actionType }) {
    const row = this.db.prepare(`
      SELECT *
      FROM operator_control_events
      WHERE company_id = ? AND action_type = ?
      ORDER BY started_at DESC
      LIMIT 1
    `).get(companyId, actionType);
    return mapEventRow(row);
  }

  getReadinessSummary(companyId) {
    const evaluatedAt = nowIso();
    const actions = Object.entries(ACTIONS).map(([actionType, def]) => {
      const lastRun = this.getLatestEvent({ companyId, actionType });
      const isCoolingDown = Boolean(lastRun?.cooldownUntil && lastRun.cooldownUntil > evaluatedAt);
      return {
        actionType,
        label: def.label,
        cooldownSeconds: def.cooldownSeconds,
        isCoolingDown,
        cooldownUntil: isCoolingDown ? lastRun?.cooldownUntil : null,
        lastRun,
      };
    });

    const consistencyChecks = this.getConsistencyChecks(companyId, { evaluatedAt });

    return {
      evaluatedAt,
      actions,
      consistencyChecks,
    };
  }

  getConsistencyChecks(companyId, { evaluatedAt = nowIso(), staleRunningMinutes = 15, lookbackHours = 24 } = {}) {
    const staleCutoff = addSeconds(evaluatedAt, -staleRunningMinutes * 60);
    const staleRows = this.db.prepare(`
      SELECT action_type, COUNT(*) AS count
      FROM operator_control_events
      WHERE company_id = ? AND status = 'running' AND started_at < ?
      GROUP BY action_type
    `).all(companyId, staleCutoff);
    const staleRunningCount = staleRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const staleByAction = staleRows.map((row) => ({
      actionType: row.action_type,
      count: Number(row.count || 0),
    }));

    const cooldownInconsistentRows = Number(this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM operator_control_events
      WHERE company_id = ?
        AND (
          (status IN ('completed', 'failed') AND cooldown_until IS NULL)
          OR (status = 'blocked_cooldown' AND cooldown_until IS NULL)
        )
    `).get(companyId)?.count ?? 0);

    const windowStart = addSeconds(evaluatedAt, -lookbackHours * 3600);
    const recent = this.db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
        SUM(CASE WHEN status = 'blocked_cooldown' THEN 1 ELSE 0 END) AS blocked_count
      FROM operator_control_events
      WHERE company_id = ? AND started_at >= ?
    `).get(companyId, windowStart);

    const failedCount = Number(recent?.failed_count ?? 0);
    const completedCount = Number(recent?.completed_count ?? 0);
    const blockedCooldownCount = Number(recent?.blocked_count ?? 0);
    const attempts = failedCount + completedCount;
    const failureRatePercent = attempts > 0 ? Number(((failedCount / attempts) * 100).toFixed(1)) : 0;

    const warnings = [];
    if (staleRunningCount > 0) {
      warnings.push({
        check: 'stale_running_actions',
        severity: 'warning',
        message: `${staleRunningCount} operator action(s) are still running beyond ${staleRunningMinutes} minutes.`,
      });
    }
    if (cooldownInconsistentRows > 0) {
      warnings.push({
        check: 'cooldown_consistency',
        severity: 'warning',
        message: `${cooldownInconsistentRows} operator event row(s) have inconsistent cooldown state.`,
      });
    }
    if (failedCount >= 3 && failureRatePercent >= 50) {
      warnings.push({
        check: 'recent_failure_concentration',
        severity: 'warning',
        message: `Recent failure concentration is high (${failedCount} failed / ${attempts} attempts in ${lookbackHours}h).`,
      });
    }

    return {
      parameters: {
        staleRunningMinutes,
        lookbackHours,
        evaluatedAt,
      },
      staleRunning: {
        count: staleRunningCount,
        byAction: staleByAction,
      },
      cooldownConsistency: {
        inconsistentRows: cooldownInconsistentRows,
      },
      recentFailureConcentration: {
        failedCount,
        completedCount,
        blockedCooldownCount,
        attempts,
        failureRatePercent,
        windowStart,
        windowEnd: evaluatedAt,
      },
      warnings,
    };
  }

  #insertEvent({
    id,
    companyId,
    actionType,
    status,
    requestId,
    requestPayloadJson,
    resultSummaryJson,
    errorCode,
    errorMessage,
    startedAt,
    completedAt,
    cooldownUntil,
  }) {
    const now = nowIso();
    this.db.prepare(`
      INSERT INTO operator_control_events (
        id, company_id, action_type, status, request_id, request_payload_json,
        result_summary_json, error_code, error_message, started_at, completed_at,
        cooldown_until, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      companyId,
      actionType,
      status,
      requestId ?? null,
      requestPayloadJson ?? null,
      resultSummaryJson ?? null,
      errorCode ?? null,
      errorMessage ?? null,
      startedAt,
      completedAt ?? null,
      cooldownUntil ?? null,
      now,
      now,
    );
  }

  #updateEvent({
    id,
    status,
    resultSummaryJson,
    errorCode,
    errorMessage,
    completedAt,
    cooldownUntil,
  }) {
    this.db.prepare(`
      UPDATE operator_control_events
      SET
        status = ?,
        result_summary_json = ?,
        error_code = ?,
        error_message = ?,
        completed_at = ?,
        cooldown_until = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      status,
      resultSummaryJson ?? null,
      errorCode ?? null,
      errorMessage ?? null,
      completedAt ?? null,
      cooldownUntil ?? null,
      nowIso(),
      id,
    );
  }
}
