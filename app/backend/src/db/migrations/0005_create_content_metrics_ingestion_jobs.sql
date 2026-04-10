CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_name TEXT,
  source_account_ref TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  request_id TEXT,
  idempotency_key TEXT,
  error_message TEXT,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  failed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_jobs_idempotency
ON ingestion_jobs (company_id, entity_type, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_company_entity_requested
ON ingestion_jobs (company_id, entity_type, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_company_entity_status
ON ingestion_jobs (company_id, entity_type, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS ingestion_job_stats (
  job_id TEXT PRIMARY KEY,
  rows_received INTEGER NOT NULL DEFAULT 0,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  rows_updated INTEGER NOT NULL DEFAULT 0,
  rows_rejected INTEGER NOT NULL DEFAULT 0,
  exact_count INTEGER NOT NULL DEFAULT 0,
  fallback_count INTEGER NOT NULL DEFAULT 0,
  incomplete_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES ingestion_jobs (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ingestion_job_sources (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  source_upload_id TEXT,
  source_file_name TEXT,
  source_file_hash TEXT,
  source_data_from TEXT,
  source_data_to TEXT,
  parser_version TEXT,
  normalization_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES ingestion_jobs (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ingestion_job_sources_job
ON ingestion_job_sources (job_id);
