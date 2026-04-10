CREATE TABLE IF NOT EXISTS operator_control_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('generate_actions', 'rebuild_content_lead', 'rebuild_lead_deal')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'blocked_cooldown')),
  request_id TEXT,
  request_payload_json TEXT,
  result_summary_json TEXT,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  cooldown_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operator_control_events_company_action_started
ON operator_control_events (company_id, action_type, started_at DESC);
