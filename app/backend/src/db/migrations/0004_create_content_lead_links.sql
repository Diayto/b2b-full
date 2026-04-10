CREATE TABLE IF NOT EXISTS content_lead_links (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  lead_external_id TEXT NOT NULL,
  content_metric_id TEXT NOT NULL,
  match_method TEXT NOT NULL,
  confidence_level TEXT NOT NULL,
  match_score INTEGER NOT NULL,
  day_lag INTEGER,
  evidence_json TEXT NOT NULL,
  matcher_version TEXT NOT NULL DEFAULT 'v1',
  linked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (content_metric_id) REFERENCES content_metrics (id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, lead_external_id) REFERENCES leads (company_id, lead_external_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_content_lead_links_active_v1
ON content_lead_links (company_id, lead_external_id);

CREATE INDEX IF NOT EXISTS idx_content_lead_links_company_content
ON content_lead_links (company_id, content_metric_id);

CREATE INDEX IF NOT EXISTS idx_content_lead_links_company_method
ON content_lead_links (company_id, match_method, confidence_level);
