const toNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toBoolean = (value, fallback) => {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const toOptionalString = (value) => {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
};

export const env = {
  PORT: toNumber(process.env.PORT, 8000),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  MAX_RETRY_ATTEMPTS: toNumber(process.env.MAX_RETRY_ATTEMPTS, 4),
  RETRY_BASE_MS: toNumber(process.env.RETRY_BASE_MS, 60_000),
  RETRY_TICK_MS: toNumber(process.env.RETRY_TICK_MS, 15_000),
  DB_FILE: process.env.DB_FILE || 'app.db',
  LEAD_LINKAGE_ENABLED: toBoolean(process.env.LEAD_LINKAGE_ENABLED, true),
  CONTENT_INGESTION_JOBS_ENABLED: toBoolean(process.env.CONTENT_INGESTION_JOBS_ENABLED, true),

  META_APP_ID: toOptionalString(process.env.META_APP_ID),
  META_APP_SECRET: toOptionalString(process.env.META_APP_SECRET),
  META_OAUTH_REDIRECT_URI: toOptionalString(process.env.META_OAUTH_REDIRECT_URI),
  META_GRAPH_VERSION: toOptionalString(process.env.META_GRAPH_VERSION) || 'v21.0',
  INSTAGRAM_LIVE_OAUTH_ENABLED: toBoolean(process.env.INSTAGRAM_LIVE_OAUTH_ENABLED, false),
  /** 64 hex chars (32 bytes) for AES-256-GCM token encryption at rest */
  INSTAGRAM_TOKEN_ENCRYPTION_KEY: toOptionalString(process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY),
  /** Base URL for browser redirect after OAuth (defaults to CORS_ORIGIN) */
  INSTAGRAM_OAUTH_FRONTEND_REDIRECT_BASE: toOptionalString(process.env.INSTAGRAM_OAUTH_FRONTEND_REDIRECT_BASE),
  /** Path appended to redirect base (default /marketing/data) */
  INSTAGRAM_OAUTH_FRONTEND_PATH: toOptionalString(process.env.INSTAGRAM_OAUTH_FRONTEND_PATH) || '/marketing/data',
};
