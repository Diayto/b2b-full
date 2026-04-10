CREATE TABLE IF NOT EXISTS instagram_sources (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'instagram',
  source_label TEXT,
  account_external_id TEXT NOT NULL,
  account_username TEXT,
  account_name TEXT,
  connection_state TEXT NOT NULL,
  last_sync_requested_at TEXT,
  last_sync_completed_at TEXT,
  last_sync_status TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_instagram_sources_company_account
ON instagram_sources (company_id, account_external_id);

CREATE INDEX IF NOT EXISTS idx_instagram_sources_company_state
ON instagram_sources (company_id, connection_state, updated_at DESC);
