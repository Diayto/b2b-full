import { Router } from 'express';
import { reminderSchema } from '../services/notifications/notification-service.js';

export function createNotificationRoutes({ notificationService }) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json(notificationService.getHealth());
  });

  router.get('/queue', (_req, res) => {
    res.json(notificationService.getQueueSnapshot());
  });

  router.post('/deadlines', async (req, res, next) => {
    try {
      const parsed = reminderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          status: 'failed',
          error: 'Invalid payload',
          details: parsed.error.flatten(),
        });
      }

      const payload = parsed.data;
      const key = req.header('X-Request-Id') || payload.requestId;
      const result = await notificationService.sendDeadline(payload, key);
      return res.status(result.statusCode).json(result.body);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/retry-dead-letter', async (_req, res, next) => {
    try {
      const result = await notificationService.retryDeadLetter();
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

