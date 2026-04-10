import { Router } from 'express';

function resolveIdempotencyKey(req) {
  return req.header('X-Idempotency-Key') || req.body?.idempotencyKey || null;
}

export function createContentMetricsRoutes({
  contentMetricsService,
  contentMetricsIngestionService,
  ingestionJobsEnabled,
  contentLeadLinkageService,
  leadLinkageEnabled,
  operatorControlService,
}) {
  const router = Router();

  router.post('/ingestion/content-metrics', (req, res, next) => {
    try {
      const result = ingestionJobsEnabled
        ? contentMetricsIngestionService.ingestWithJob(req.body, {
          requestId: req.context?.requestId,
          idempotencyKey: resolveIdempotencyKey(req),
        })
        : contentMetricsService.ingest(req.body);
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/content-metrics', (req, res, next) => {
    try {
      const result = contentMetricsService.list(req.query);
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/content-metrics/summary', (req, res, next) => {
    try {
      const result = contentMetricsService.summaryForCompany(req.query);
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/content-metrics/diagnostics', (req, res, next) => {
    try {
      const result = contentMetricsService.diagnostics(req.query);
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/content-metrics/linkage/leads/rebuild', (req, res, next) => {
    try {
      if (!leadLinkageEnabled) {
        return res.status(503).json({
          ok: false,
          error: 'Lead linkage is disabled',
          feature: 'lead_linkage',
          operatorError: {
            code: 'feature_disabled',
            message: 'Lead linkage rebuild is disabled.',
            actionType: 'rebuild_content_lead',
          },
        });
      }

      const result = operatorControlService.execute({
        companyId: req.body?.companyId,
        actionType: 'rebuild_content_lead',
        requestId: req.context?.requestId,
        payload: req.body ?? null,
        run: () => contentLeadLinkageService.rebuild(req.body),
      });
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
