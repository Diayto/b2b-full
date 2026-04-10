CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  lead_external_id TEXT NOT NULL,
  channel_campaign_external_id TEXT,
  created_date TEXT,
  source_type TEXT,
  lead_link_key TEXT,
  source_upload_id TEXT,
  source_file_name TEXT,
  ingested_at TEXT NOT NULL,
  diagnostic_flags TEXT NOT NULL,
  normalization_version TEXT NOT NULL DEFAULT 'v1',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_leads_identity
ON leads (company_id, lead_external_id);

CREATE INDEX IF NOT EXISTS idx_leads_company_created_date
ON leads (company_id, created_date);

CREATE INDEX IF NOT EXISTS idx_leads_company_channel
ON leads (company_id, channel_campaign_external_id);

CREATE INDEX IF NOT EXISTS idx_leads_company_link_key
ON leads (company_id, lead_link_key);
