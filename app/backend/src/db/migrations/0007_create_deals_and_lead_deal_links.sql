CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  deal_external_id TEXT NOT NULL,
  lead_external_id TEXT,
  lead_link_key TEXT,
  created_date TEXT,
  status TEXT,
  source_type TEXT,
  source_upload_id TEXT,
  source_file_name TEXT,
  ingested_at TEXT NOT NULL,
  diagnostic_flags TEXT NOT NULL,
  normalization_version TEXT NOT NULL DEFAULT 'v1',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_deals_identity
ON deals (company_id, deal_external_id);

CREATE INDEX IF NOT EXISTS idx_deals_company_created_date
ON deals (company_id, created_date);

CREATE INDEX IF NOT EXISTS idx_deals_company_lead
ON deals (company_id, lead_external_id);

CREATE INDEX IF NOT EXISTS idx_deals_company_link_key
ON deals (company_id, lead_link_key);

CREATE TABLE IF NOT EXISTS lead_deal_links (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  deal_external_id TEXT NOT NULL,
  lead_external_id TEXT NOT NULL,
  match_method TEXT NOT NULL,
  confidence_level TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  matcher_version TEXT NOT NULL DEFAULT 'v1',
  linked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (company_id, deal_external_id) REFERENCES deals (company_id, deal_external_id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, lead_external_id) REFERENCES leads (company_id, lead_external_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_lead_deal_links_active
ON lead_deal_links (company_id, deal_external_id);

CREATE INDEX IF NOT EXISTS idx_lead_deal_links_company_lead
ON lead_deal_links (company_id, lead_external_id);
