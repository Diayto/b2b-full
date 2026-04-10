import { Router } from 'express';

function resolveIdempotencyKey(req) {
  return req.header('X-Idempotency-Key') || req.body?.idempotencyKey || null;
}

function resolveCompanyId(req) {
  return String(req.query?.companyId || req.body?.companyId || '').trim();
}

export function createInstagramConnectorRoutes({
  instagramSourcesService,
  contentMetricsIngestionService,
  instagramOAuthService,
  instagramLivePullService,
}) {
  const router = Router();

  router.get('/connectors/instagram/oauth/start', (req, res, next) => {
    try {
      if (!instagramOAuthService) {
        return res.status(503).json({
          ok: false,
          error: 'Instagram OAuth service is not configured',
          feature: 'instagram_oauth',
        });
      }
      const result = instagramOAuthService.start(req.query);
      if (result.ok && result.redirectUrl) {
        return res.redirect(302, result.redirectUrl);
      }
      return res.status(result.statusCode).json(result.body);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/connectors/instagram/oauth/callback', async (req, res, next) => {
    try {
      if (!instagramOAuthService) {
        return res.status(503).json({
          ok: false,
          error: 'Instagram OAuth service is not configured',
          feature: 'instagram_oauth',
        });
      }
      const redirectUrl = await instagramOAuthService.completeCallback(req.query);
      return res.redirect(302, redirectUrl);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/connectors/instagram/sources', (req, res, next) => {
    try {
      const result = instagramSourcesService.create(req.body);
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/connectors/instagram/sources', (req, res, next) => {
    try {
      const result = instagramSourcesService.list(req.query);
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/connectors/instagram/sources/:sourceId', (req, res, next) => {
    try {
      const result = instagramSourcesService.getById({
        ...req.query,
        sourceId: req.params.sourceId,
      });
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/connectors/instagram/sources/:sourceId/connection', (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) {
        return res.status(400).json({
          ok: false,
          error: 'Missing companyId',
        });
      }

      const result = instagramSourcesService.getConnectionContract({
        companyId,
        sourceId: req.params.sourceId,
      });
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/connectors/instagram/sources/:sourceId/live-pull', async (req, res, next) => {
    try {
      if (!instagramLivePullService) {
        return res.status(503).json({
          ok: false,
          error: 'Instagram live pull service is not configured',
          feature: 'instagram_live_pull',
        });
      }
      const companyId = resolveCompanyId(req);
      if (!companyId) {
        return res.status(400).json({
          ok: false,
          error: 'Missing companyId',
        });
      }

      const result = await instagramLivePullService.execute({
        companyId,
        sourceId: req.params.sourceId,
        requestId: req.context?.requestId,
        idempotencyKey: resolveIdempotencyKey(req),
        limit: req.body?.limit,
      });
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/connectors/instagram/sources/:sourceId/connection', (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) {
        return res.status(400).json({
          ok: false,
          error: 'Missing companyId',
        });
      }

      const result = instagramSourcesService.updateConnectionContract({
        ...req.body,
        companyId,
        sourceId: req.params.sourceId,
      });
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/connectors/instagram/sources/:sourceId/sync-runs', (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) {
        return res.status(400).json({
          ok: false,
          error: 'Missing companyId',
        });
      }

      const sourceResult = instagramSourcesService.getById({
        companyId,
        sourceId: req.params.sourceId,
      });
      if (!sourceResult.ok) {
        return res.status(sourceResult.statusCode).json(sourceResult);
      }

      const source = sourceResult.source;
      const ingestionResult = contentMetricsIngestionService.ingestWithJob(req.body, {
        requestId: req.context?.requestId,
        idempotencyKey: resolveIdempotencyKey(req),
        connectorSource: {
          id: source.id,
          companyId: source.companyId,
          platform: source.platform,
          accountExternalId: source.accountExternalId,
          accountUsername: source.accountUsername,
          accountName: source.accountName,
          sourceLabel: source.sourceLabel,
          connectionState: source.connectionState,
        },
      });

      return res.status(ingestionResult.statusCode).json(ingestionResult);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/connectors/instagram/sources/:sourceId/sync-runs', (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) {
        return res.status(400).json({
          ok: false,
          error: 'Missing companyId',
        });
      }

      const sourceResult = instagramSourcesService.getById({
        companyId,
        sourceId: req.params.sourceId,
      });
      if (!sourceResult.ok) {
        return res.status(sourceResult.statusCode).json(sourceResult);
      }

      const result = contentMetricsIngestionService.listJobsByConnectorSource({
        ...req.query,
        companyId,
        connectorSourceId: sourceResult.source.id,
      });

      if (!result.ok) {
        return res.status(result.statusCode).json(result);
      }

      return res.status(result.statusCode).json({
        ...result,
        source: {
          id: sourceResult.source.id,
          companyId: sourceResult.source.companyId,
          platform: sourceResult.source.platform,
          accountExternalId: sourceResult.source.accountExternalId,
          accountUsername: sourceResult.source.accountUsername,
          sourceLabel: sourceResult.source.sourceLabel,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/connectors/instagram/sources/:sourceId/sync-runs/:jobId', (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) {
        return res.status(400).json({
          ok: false,
          error: 'Missing companyId',
        });
      }

      const sourceResult = instagramSourcesService.getById({
        companyId,
        sourceId: req.params.sourceId,
      });
      if (!sourceResult.ok) {
        return res.status(sourceResult.statusCode).json(sourceResult);
      }

      const result = contentMetricsIngestionService.getJobByConnectorSource({
        ...req.query,
        companyId,
        connectorSourceId: sourceResult.source.id,
        jobId: req.params.jobId,
      });

      if (!result.ok) {
        return res.status(result.statusCode).json(result);
      }

      return res.status(result.statusCode).json({
        ...result,
        source: {
          id: sourceResult.source.id,
          companyId: sourceResult.source.companyId,
          platform: sourceResult.source.platform,
          accountExternalId: sourceResult.source.accountExternalId,
          accountUsername: sourceResult.source.accountUsername,
          sourceLabel: sourceResult.source.sourceLabel,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
