import { Router } from 'express';

function resolveIdempotencyKey(req) {
  return req.header('X-Idempotency-Key') || req.body?.idempotencyKey || null;
}

export function createContentIngestionRoutes({ contentMetricsIngestionService, ingestionJobsEnabled }) {
  const router = Router();

  router.post('/ingestion/content-metrics/jobs', (req, res, next) => {
    try {
      if (!ingestionJobsEnabled) {
        return res.status(503).json({
          ok: false,
          error: 'Content ingestion jobs are disabled',
          feature: 'content_ingestion_jobs',
        });
      }

      const result = contentMetricsIngestionService.ingestWithJob(req.body, {
        requestId: req.context?.requestId,
        idempotencyKey: resolveIdempotencyKey(req),
      });
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/ingestion/content-metrics/jobs', (req, res, next) => {
    try {
      const result = contentMetricsIngestionService.listJobs(req.query);
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/ingestion/content-metrics/jobs/:jobId', (req, res, next) => {
    try {
      const result = contentMetricsIngestionService.getJob({
        ...req.query,
        jobId: req.params.jobId,
      });
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
