import { Router } from 'express';

export function createDealsRoutes({ dealsService }) {
  const router = Router();

  router.get('/deals/summary', (req, res, next) => {
    try {
      const result = dealsService.summary(req.query);
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/ingestion/deals', (req, res, next) => {
    try {
      const result = dealsService.ingest(req.body);
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
