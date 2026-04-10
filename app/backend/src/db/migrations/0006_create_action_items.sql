CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'done')),
  owner TEXT,
  due_date TEXT,
  diagnostic_type TEXT NOT NULL,
  diagnostic_key TEXT NOT NULL,
  source_block TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id TEXT,
  suggested_by_rule TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_action_items_company_status
ON action_items (company_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_items_company_diagnostic
ON action_items (company_id, diagnostic_type, diagnostic_key);

CREATE UNIQUE INDEX IF NOT EXISTS ux_action_items_open_trace
ON action_items (company_id, diagnostic_type, diagnostic_key)
WHERE status IN ('open', 'in_progress');
