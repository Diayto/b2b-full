import { Router } from 'express';

export function createSystemRoutes({ notificationService, pilotReadinessService }) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'bizpulse-backend',
      now: new Date().toISOString(),
    });
  });

  router.get('/readiness', (_req, res) => {
    const notifications = notificationService.getHealth();
    res.json({
      ok: true,
      service: 'bizpulse-backend',
      checks: {
        notifications: {
          provider: notifications.provider,
          retryQueueSize: notifications.retryQueueSize,
          deadLetterSize: notifications.deadLetterSize,
        },
      },
      now: new Date().toISOString(),
    });
  });

  router.get('/system/pilot-readiness', (req, res, next) => {
    try {
      if (!pilotReadinessService) {
        return res.status(503).json({
          ok: false,
          error: 'Pilot readiness service is not configured',
          feature: 'pilot_readiness',
        });
      }
      const result = pilotReadinessService.getSummary(req.query);
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
