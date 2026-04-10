import { Router } from 'express';

export function createActionRoutes({ actionItemsService, operatorControlService }) {
  const router = Router();

  router.post('/actions/from-diagnostics', (req, res, next) => {
    try {
      const result = operatorControlService.execute({
        companyId: req.body?.companyId,
        actionType: 'generate_actions',
        requestId: req.context?.requestId,
        payload: req.body ?? null,
        run: () => actionItemsService.createFromDiagnostics(req.body),
      });
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/actions', (req, res, next) => {
    try {
      const result = actionItemsService.list(req.query);
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/actions/weekly-review', (req, res, next) => {
    try {
      const result = actionItemsService.weeklyReviewSummary(req.query);
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/actions/:actionId', (req, res, next) => {
    try {
      const result = actionItemsService.update(
        {
          ...req.query,
          actionId: req.params.actionId,
        },
        req.body,
      );
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
