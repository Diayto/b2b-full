import { Router } from 'express';

export function createLeadsRoutes({ leadsService }) {
  const router = Router();

  router.get('/leads/summary', (req, res, next) => {
    try {
      const result = leadsService.summary(req.query);
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/ingestion/leads', (req, res, next) => {
    try {
      const result = leadsService.ingest(req.body);
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
