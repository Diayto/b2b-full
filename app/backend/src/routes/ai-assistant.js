import { Router } from 'express';

export function createAiAssistantRoutes({ ownerAssistantService }) {
  const router = Router();

  router.post('/ai/owner-assistant', async (req, res, next) => {
    try {
      if (!ownerAssistantService) {
        return res.status(503).json({
          ok: false,
          error: 'AI assistant service is not available',
          code: 'ai_service_unavailable',
        });
      }

      const result = await ownerAssistantService.ask({
        question: req.body?.question,
        context: req.body?.context,
      });

      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
