CREATE TABLE IF NOT EXISTS ingestion_idempotency_log (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  identity_type TEXT NOT NULL CHECK (identity_type IN ('explicit_key', 'source_signature')),
  identity_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  source_signature TEXT NOT NULL,
  job_id TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  replay_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES ingestion_jobs (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_idempotency_identity
ON ingestion_idempotency_log (company_id, entity_type, identity_key);

CREATE INDEX IF NOT EXISTS idx_ingestion_idempotency_job
ON ingestion_idempotency_log (job_id);
