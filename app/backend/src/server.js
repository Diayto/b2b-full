import 'dotenv/config';
import path from 'node:path';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { paths } from './config/paths.js';
import { NotificationService } from './services/notifications/notification-service.js';
import { createDatabase } from './db/client.js';
import { ContentMetricsService } from './services/content-metrics/content-metrics-service.js';
import { LeadsService } from './services/leads/leads-service.js';
import { ContentLeadLinkageService } from './services/content-metrics/content-lead-linkage-service.js';
import { ContentMetricsIngestionService } from './services/content-metrics/content-metrics-ingestion-service.js';
import { ActionItemsService } from './services/actions/action-items-service.js';
import { DealsService } from './services/deals/deals-service.js';
import { LeadDealLinkageService } from './services/linkage/lead-deal-linkage-service.js';
import { PilotReadinessService } from './services/system/pilot-readiness-service.js';
import { OperatorControlService } from './services/system/operator-control-service.js';
import { InstagramSourcesService } from './services/connectors/instagram-sources-service.js';
import { InstagramOAuthService } from './services/connectors/instagram-oauth-service.js';
import { InstagramLivePullService } from './services/connectors/instagram-live-pull-service.js';

let server;
let notificationService;
let db;

async function bootstrap() {
  db = await createDatabase({
    dbFilePath: path.join(paths.DATA_DIR, env.DB_FILE),
    migrationsDirPath: paths.MIGRATIONS_DIR,
  });

  notificationService = new NotificationService({
    env,
    dataDir: paths.DATA_DIR,
  });
  await notificationService.init();
  notificationService.startWorker();

  const contentLeadLinkageService = new ContentLeadLinkageService({ db });
  const leadDealLinkageService = new LeadDealLinkageService({ db });
  const contentMetricsService = new ContentMetricsService({
    db,
    contentLeadLinkageService,
    leadDealLinkageService,
    leadLinkageEnabled: env.LEAD_LINKAGE_ENABLED,
  });
  const contentMetricsIngestionService = new ContentMetricsIngestionService({
    db,
    contentMetricsService,
  });
  const leadsService = new LeadsService({ db });
  const dealsService = new DealsService({ db });
  const actionItemsService = new ActionItemsService({
    db,
    contentMetricsService,
  });
  const operatorControlService = new OperatorControlService({ db });
  const instagramSourcesService = new InstagramSourcesService({ db });
  const instagramOAuthService = new InstagramOAuthService({
    env,
    db,
    instagramSourcesService,
  });
  const instagramLivePullService = new InstagramLivePullService({
    env,
    db,
    instagramSourcesService,
    contentMetricsIngestionService,
  });
  const pilotReadinessService = new PilotReadinessService({
    contentMetricsService,
    actionItemsService,
    operatorControlService,
  });

  const app = createApp({
    corsOrigin: env.CORS_ORIGIN,
    notificationService,
    pilotReadinessService,
    operatorControlService,
    contentMetricsService,
    contentMetricsIngestionService,
    ingestionJobsEnabled: env.CONTENT_INGESTION_JOBS_ENABLED,
    leadsService,
    dealsService,
    contentLeadLinkageService,
    leadDealLinkageService,
    leadLinkageEnabled: env.LEAD_LINKAGE_ENABLED,
    actionItemsService,
    instagramSourcesService,
    instagramOAuthService,
    instagramLivePullService,
  });

  server = app.listen(env.PORT, () => {
    console.log(`BizPulse backend listening on http://localhost:${env.PORT}`);
    console.log(`CORS origin: ${env.CORS_ORIGIN}`);
    console.log(`Active provider: ${notificationService.activeProvider()}`);
    console.log(`Retry policy: max=${env.MAX_RETRY_ATTEMPTS}, baseMs=${env.RETRY_BASE_MS}`);
  });
}

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  notificationService?.stopWorker();
  db?.close?.();
  if (!server) {
    process.exit(0);
    return;
  }

  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

bootstrap().catch((error) => {
  console.error('Failed to initialize backend:', error);
  process.exit(1);
});
