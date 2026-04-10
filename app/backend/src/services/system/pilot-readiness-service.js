function gateStatus({ value, greenIf, yellowIf }) {
  if (greenIf(value)) return 'green';
  if (yellowIf(value)) return 'yellow';
  return 'red';
}

function buildGate({ gate, observed, rule, status, reason }) {
  return {
    gate,
    observed,
    rule,
    status,
    reason,
  };
}

function overallStatus(gates) {
  if (gates.some((gate) => gate.status === 'red')) return 'red';
  if (gates.some((gate) => gate.status === 'yellow')) return 'yellow';
  return 'green';
}

export class PilotReadinessService {
  constructor({ contentMetricsService, actionItemsService, operatorControlService }) {
    this.contentMetricsService = contentMetricsService;
    this.actionItemsService = actionItemsService;
    this.operatorControlService = operatorControlService;
  }

  getSummary(params) {
    const companyId = String(params.companyId || '').trim();
    if (!companyId) {
      return { ok: false, statusCode: 400, error: 'Missing companyId' };
    }

    const diagnostics = this.contentMetricsService.diagnostics({ companyId });
    if (!diagnostics.ok) return diagnostics;

    const actionSummary = this.actionItemsService.weeklyReviewSummary({ companyId });
    if (!actionSummary.ok) return actionSummary;

    const gates = [];

    const daysSinceLastIngest = diagnostics.freshness?.daysSinceLastIngest;
    const freshnessStatus = gateStatus({
      value: daysSinceLastIngest,
      greenIf: (v) => Number.isFinite(v) && v <= 2,
      yellowIf: (v) => Number.isFinite(v) && v <= 7,
    });
    gates.push(buildGate({
      gate: 'content_freshness',
      observed: {
        daysSinceLastIngest: daysSinceLastIngest ?? null,
        lastIngestedAt: diagnostics.freshness?.lastIngestedAt ?? null,
      },
      rule: {
        green: 'daysSinceLastIngest <= 2',
        yellow: 'daysSinceLastIngest <= 7',
        red: 'daysSinceLastIngest > 7 or missing',
      },
      status: freshnessStatus,
      reason:
        freshnessStatus === 'green'
          ? 'Content ingestion is recent.'
          : freshnessStatus === 'yellow'
            ? 'Content ingestion is aging and should be refreshed soon.'
            : 'Content ingestion is stale or missing.',
    }));

    const failedJobs = Number(diagnostics.ingestionHealth?.failedJobs ?? 0);
    const ingestionHealthStatus = gateStatus({
      value: failedJobs,
      greenIf: (v) => v === 0,
      yellowIf: (v) => v <= 2,
    });
    gates.push(buildGate({
      gate: 'ingestion_failure_health',
      observed: {
        failedJobs,
        completedJobs: Number(diagnostics.ingestionHealth?.completedJobs ?? 0),
        runningJobs: Number(diagnostics.ingestionHealth?.runningJobs ?? 0),
        pendingJobs: Number(diagnostics.ingestionHealth?.pendingJobs ?? 0),
        lastFailedAt: diagnostics.ingestionHealth?.lastFailedAt ?? null,
      },
      rule: {
        green: 'failedJobs == 0',
        yellow: 'failedJobs <= 2',
        red: 'failedJobs > 2',
      },
      status: ingestionHealthStatus,
      reason:
        ingestionHealthStatus === 'green'
          ? 'No failed ingestion jobs are currently recorded.'
          : ingestionHealthStatus === 'yellow'
            ? 'Some failed jobs exist and should be reviewed.'
            : 'High ingestion failure count reduces pilot trust.',
    }));

    const avgTrust = Number(diagnostics.summary?.avgCompletenessScore ?? 0);
    const trustStatus = gateStatus({
      value: avgTrust,
      greenIf: (v) => v >= 80,
      yellowIf: (v) => v >= 60,
    });
    gates.push(buildGate({
      gate: 'content_trust_quality',
      observed: {
        avgCompletenessScore: avgTrust,
        confidenceBreakdown: diagnostics.summary?.confidenceBreakdown ?? null,
      },
      rule: {
        green: 'avgCompletenessScore >= 80',
        yellow: 'avgCompletenessScore >= 60',
        red: 'avgCompletenessScore < 60',
      },
      status: trustStatus,
      reason:
        trustStatus === 'green'
          ? 'Content data quality is high.'
          : trustStatus === 'yellow'
            ? 'Content data quality is usable but not strong.'
            : 'Content data quality is too weak for reliable pilot decisions.',
    }));

    const leadCoverage = Number(diagnostics.leadLinkageBridge?.linkageCoveragePercent ?? 0);
    const leadGateStatus = gateStatus({
      value: leadCoverage,
      greenIf: (v) => v >= 70,
      yellowIf: (v) => v >= 50,
    });
    gates.push(buildGate({
      gate: 'content_to_lead_bridge',
      observed: diagnostics.leadLinkageBridge ?? {
        linkageCoveragePercent: 0,
        linkedLeads: 0,
        unlinkedLeads: 0,
      },
      rule: {
        green: 'linkageCoveragePercent >= 70',
        yellow: 'linkageCoveragePercent >= 50',
        red: 'linkageCoveragePercent < 50',
      },
      status: leadGateStatus,
      reason:
        leadGateStatus === 'green'
          ? 'Content-to-lead deterministic bridge is healthy.'
          : leadGateStatus === 'yellow'
            ? 'Content-to-lead bridge is partial and should be improved.'
            : 'Content-to-lead bridge coverage is too low for pilot confidence.',
    }));

    const dealCoverage = Number(diagnostics.leadDealBridge?.linkageCoveragePercent ?? 0);
    const dealGateStatus = gateStatus({
      value: dealCoverage,
      greenIf: (v) => v >= 75,
      yellowIf: (v) => v >= 55,
    });
    gates.push(buildGate({
      gate: 'lead_to_deal_bridge',
      observed: diagnostics.leadDealBridge ?? {
        linkageCoveragePercent: 0,
        linkedDeals: 0,
        unlinkedDeals: 0,
      },
      rule: {
        green: 'linkageCoveragePercent >= 75',
        yellow: 'linkageCoveragePercent >= 55',
        red: 'linkageCoveragePercent < 55',
      },
      status: dealGateStatus,
      reason:
        dealGateStatus === 'green'
          ? 'Lead-to-deal deterministic bridge is healthy.'
          : dealGateStatus === 'yellow'
            ? 'Lead-to-deal bridge is partial and should be improved.'
            : 'Lead-to-deal bridge coverage is too low for pilot control quality.',
    }));

    const overdueOpen = Number(actionSummary.summary?.overdueOpen ?? 0);
    const escalatedOpen = Number(actionSummary.summary?.escalatedOpen ?? 0);
    const loopStatus = gateStatus({
      value: { overdueOpen, escalatedOpen },
      greenIf: (v) => v.overdueOpen === 0 && v.escalatedOpen === 0,
      yellowIf: (v) => v.overdueOpen <= 3 && v.escalatedOpen <= 1,
    });
    gates.push(buildGate({
      gate: 'action_loop_hygiene',
      observed: {
        openCount: Number(actionSummary.summary?.openCount ?? 0),
        inProgressCount: Number(actionSummary.summary?.inProgressCount ?? 0),
        overdueOpen,
        staleOpen: Number(actionSummary.summary?.staleOpen ?? 0),
        escalatedOpen,
      },
      rule: {
        green: 'overdueOpen == 0 and escalatedOpen == 0',
        yellow: 'overdueOpen <= 3 and escalatedOpen <= 1',
        red: 'otherwise',
      },
      status: loopStatus,
      reason:
        loopStatus === 'green'
          ? 'Action loop is clean with no overdue/escalated open actions.'
          : loopStatus === 'yellow'
            ? 'Action loop has manageable overdue/escalated pressure.'
            : 'Action loop has too many overdue/escalated open actions.',
    }));

    const counts = {
      green: gates.filter((gate) => gate.status === 'green').length,
      yellow: gates.filter((gate) => gate.status === 'yellow').length,
      red: gates.filter((gate) => gate.status === 'red').length,
    };

    const operatorControls = this.operatorControlService
      ? this.operatorControlService.getReadinessSummary(companyId)
      : { evaluatedAt: new Date().toISOString(), actions: [] };

    return {
      ok: true,
      statusCode: 200,
      companyId,
      evaluatedAt: new Date().toISOString(),
      overallStatus: overallStatus(gates),
      gateCounts: counts,
      gates,
      operatorControls,
      sources: {
        contentMetricsDiagnostics: diagnostics,
        weeklyActionReview: {
          weekStart: actionSummary.weekStart,
          weekEnd: actionSummary.weekEnd,
          summary: actionSummary.summary,
        },
      },
    };
  }
}
