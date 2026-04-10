import express from 'express';
import cors from 'cors';
import { requestContext } from './middleware/request-context.js';
import { notFound, errorHandler } from './middleware/error-handler.js';
import { createNotificationRoutes } from './routes/notifications.js';
import { createSystemRoutes } from './routes/system.js';
import { createContentMetricsRoutes } from './routes/content-metrics.js';
import { createLeadsRoutes } from './routes/leads.js';
import { createContentIngestionRoutes } from './routes/content-ingestion.js';
import { createActionRoutes } from './routes/actions.js';
import { createDealsRoutes } from './routes/deals.js';
import { createLinkageRoutes } from './routes/linkage.js';
import { createInstagramConnectorRoutes } from './routes/connectors-instagram.js';

export function createApp({
  corsOrigin,
  notificationService,
  pilotReadinessService,
  operatorControlService,
  contentMetricsService,
  contentMetricsIngestionService,
  ingestionJobsEnabled,
  leadsService,
  dealsService,
  contentLeadLinkageService,
  leadDealLinkageService,
  leadLinkageEnabled,
  actionItemsService,
  instagramSourcesService,
  instagramOAuthService,
  instagramLivePullService,
}) {
  const app = express();

  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestContext);

  app.use('/api/notifications', createNotificationRoutes({ notificationService }));
  app.use('/api', createSystemRoutes({ notificationService, pilotReadinessService }));
  app.use('/api', createContentIngestionRoutes({ contentMetricsIngestionService, ingestionJobsEnabled }));
  app.use('/api', createLeadsRoutes({ leadsService }));
  app.use('/api', createDealsRoutes({ dealsService }));
  app.use('/api', createActionRoutes({ actionItemsService, operatorControlService }));
  app.use('/api', createLinkageRoutes({ leadDealLinkageService, operatorControlService }));
  app.use('/api', createInstagramConnectorRoutes({
    instagramSourcesService,
    contentMetricsIngestionService,
    instagramOAuthService,
    instagramLivePullService,
  }));
  app.use('/api', createContentMetricsRoutes({
    contentMetricsService,
    contentMetricsIngestionService,
    ingestionJobsEnabled,
    contentLeadLinkageService,
    leadLinkageEnabled,
    operatorControlService,
  }));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
