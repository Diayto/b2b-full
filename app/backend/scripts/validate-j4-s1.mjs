import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../src/db/client.js';
import { InstagramSourcesService } from '../src/services/connectors/instagram-sources-service.js';
import { InstagramOAuthService } from '../src/services/connectors/instagram-oauth-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.INSTAGRAM_LIVE_OAUTH_ENABLED = 'false';
const { env: envOff } = await import('../src/config/env.js');
const dbPath = path.join(__dirname, '..', 'data', 'j4-s1-validate.db');
const db = await createDatabase({
  dbFilePath: dbPath,
  migrationsDirPath: path.join(__dirname, '..', 'src/db/migrations'),
});
const iss = new InstagramSourcesService({ db });
const oauthOff = new InstagramOAuthService({ env: envOff, db, instagramSourcesService: iss });
const rOff = oauthOff.start({ companyId: 'cmp_test' });
console.log('disabled:', rOff.ok === false && rOff.statusCode === 503);

const envOn = {
  ...envOff,
  INSTAGRAM_LIVE_OAUTH_ENABLED: true,
  META_APP_ID: 'test_app',
  META_APP_SECRET: 'test_secret_for_hmac_signing_only',
  META_OAUTH_REDIRECT_URI: 'http://localhost:8000/api/connectors/instagram/oauth/callback',
  META_GRAPH_VERSION: envOff.META_GRAPH_VERSION,
  INSTAGRAM_TOKEN_ENCRYPTION_KEY:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  INSTAGRAM_OAUTH_FRONTEND_REDIRECT_BASE: envOff.INSTAGRAM_OAUTH_FRONTEND_REDIRECT_BASE,
  INSTAGRAM_OAUTH_FRONTEND_PATH: envOff.INSTAGRAM_OAUTH_FRONTEND_PATH,
  CORS_ORIGIN: envOff.CORS_ORIGIN,
};
const oauthOn = new InstagramOAuthService({ env: envOn, db, instagramSourcesService: iss });
const rOn = oauthOn.start({ companyId: 'cmp_test' });
console.log('enabled:', rOn.ok === true && rOn.redirectUrl?.includes('facebook.com'));

db.close();
