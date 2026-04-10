ALTER TABLE instagram_sources ADD COLUMN connection_state_reason TEXT;
ALTER TABLE instagram_sources ADD COLUMN connection_state_changed_at TEXT;
ALTER TABLE instagram_sources ADD COLUMN credential_schema_version TEXT;
ALTER TABLE instagram_sources ADD COLUMN credential_presence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE instagram_sources ADD COLUMN credential_ref TEXT;
ALTER TABLE instagram_sources ADD COLUMN credential_expires_at TEXT;
ALTER TABLE instagram_sources ADD COLUMN last_contract_validated_at TEXT;
ALTER TABLE instagram_sources ADD COLUMN last_contract_validation_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE instagram_sources ADD COLUMN last_contract_validation_message TEXT;

UPDATE instagram_sources
SET connection_state_changed_at = COALESCE(connection_state_changed_at, created_at, updated_at)
WHERE connection_state_changed_at IS NULL;
