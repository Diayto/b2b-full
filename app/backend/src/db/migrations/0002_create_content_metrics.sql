CREATE TABLE IF NOT EXISTS content_metrics (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  content_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  content_title TEXT,
  content_type TEXT,
  theme_tag TEXT,
  cta_type TEXT,
  published_at TEXT NOT NULL,
  channel_campaign_external_id TEXT,
  reach INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  profile_visits INTEGER NOT NULL DEFAULT 0,
  inbound_messages INTEGER NOT NULL DEFAULT 0,
  leads_generated INTEGER NOT NULL DEFAULT 0,
  deals_generated INTEGER NOT NULL DEFAULT 0,
  paid_conversions INTEGER NOT NULL DEFAULT 0,
  source_upload_id TEXT,
  source_file_name TEXT,
  ingested_at TEXT NOT NULL,
  completeness_score INTEGER NOT NULL,
  confidence_level TEXT NOT NULL,
  linkage_status TEXT NOT NULL,
  diagnostic_flags TEXT NOT NULL,
  normalization_version TEXT NOT NULL DEFAULT 'v1',
  lead_link_key TEXT,
  attribution_window_days INTEGER NOT NULL DEFAULT 30,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_content_metrics_identity
ON content_metrics (company_id, platform, content_id, published_at);

CREATE INDEX IF NOT EXISTS idx_content_metrics_company_date
ON content_metrics (company_id, published_at);

CREATE INDEX IF NOT EXISTS idx_content_metrics_confidence
ON content_metrics (company_id, confidence_level);

