CREATE TABLE IF NOT EXISTS instagram_source_oauth_tokens (
  instagram_source_id TEXT NOT NULL PRIMARY KEY,
  enc_payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (instagram_source_id) REFERENCES instagram_sources(id) ON DELETE CASCADE
);
