import { Router } from 'express';

export function createLinkageRoutes({ leadDealLinkageService, operatorControlService }) {
  const router = Router();

  router.post('/linkage/leads-deals/rebuild', (req, res, next) => {
    try {
      const result = operatorControlService.execute({
        companyId: req.body?.companyId,
        actionType: 'rebuild_lead_deal',
        requestId: req.context?.requestId,
        payload: req.body ?? null,
        run: () => leadDealLinkageService.rebuild(req.body),
      });
      return res.status(result.statusCode).json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
