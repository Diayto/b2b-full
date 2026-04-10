ALTER TABLE ingestion_jobs
ADD COLUMN connector_source_id TEXT;

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_connector_source
ON ingestion_jobs (company_id, connector_source_id, requested_at DESC);

ALTER TABLE ingestion_job_sources
ADD COLUMN source_connector_id TEXT;

ALTER TABLE ingestion_job_sources
ADD COLUMN source_account_external_id TEXT;

ALTER TABLE ingestion_job_sources
ADD COLUMN source_platform TEXT;

ALTER TABLE ingestion_job_sources
ADD COLUMN source_snapshot_json TEXT;

CREATE INDEX IF NOT EXISTS idx_ingestion_job_sources_connector
ON ingestion_job_sources (source_connector_id, source_account_external_id);

ALTER TABLE content_metrics
ADD COLUMN source_identity_type TEXT NOT NULL DEFAULT 'file_upload';

ALTER TABLE content_metrics
ADD COLUMN source_connector_id TEXT;

ALTER TABLE content_metrics
ADD COLUMN source_account_external_id TEXT;

CREATE INDEX IF NOT EXISTS idx_content_metrics_source_identity
ON content_metrics (company_id, source_identity_type, source_connector_id, published_at DESC);
