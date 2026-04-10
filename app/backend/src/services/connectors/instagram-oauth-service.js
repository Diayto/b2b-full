import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { encryptAccessTokenJson, assertEncryptionKeyFormat } from './token-crypto.js';

const STATE_TTL_SEC = 600;
const DEFAULT_SCOPES = 'pages_show_list,instagram_basic,business_management';

function base64UrlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function base64UrlDecodeToBuffer(str) {
  return Buffer.from(String(str), 'base64url');
}

function graphOrigin(graphVersion) {
  const v = String(graphVersion || 'v21.0').replace(/^\//, '');
  return `https://graph.facebook.com/${v}`;
}

function wwwFacebookOauthUrl(graphVersion) {
  const v = String(graphVersion || 'v21.0').replace(/^\//, '');
  return `https://www.facebook.com/${v}/dialog/oauth`;
}

function frontendRedirectUrl(env, { ok, sourceId, reason }) {
  const base = env.INSTAGRAM_OAUTH_FRONTEND_REDIRECT_BASE || env.CORS_ORIGIN || 'http://localhost:3000';
  const path = env.INSTAGRAM_OAUTH_FRONTEND_PATH || '/marketing/data';
  const u = new URL(path, base.endsWith('/') ? base : `${base}/`);
  if (ok) {
    u.searchParams.set('ig_oauth', '1');
    u.searchParams.set('sourceId', sourceId);
  } else {
    u.searchParams.set('ig_oauth', '0');
    if (reason) u.searchParams.set('reason', String(reason));
  }
  return u.toString();
}

function validateLiveOAuthConfig(env) {
  if (!env.INSTAGRAM_LIVE_OAUTH_ENABLED) {
    return { ok: false, reason: 'disabled' };
  }
  if (!env.META_APP_ID || !env.META_APP_SECRET || !env.META_OAUTH_REDIRECT_URI) {
    return { ok: false, reason: 'config' };
  }
  if (!assertEncryptionKeyFormat(env.INSTAGRAM_TOKEN_ENCRYPTION_KEY)) {
    return { ok: false, reason: 'config' };
  }
  return { ok: true };
}

export class InstagramOAuthService {
  constructor({ env, db, instagramSourcesService }) {
    this.env = env;
    this.db = db;
    this.instagramSourcesService = instagramSourcesService;
  }

  signState(companyId) {
    const secret = this.env.META_APP_SECRET;
    const exp = Math.floor(Date.now() / 1000) + STATE_TTL_SEC;
    const payload = {
      c: companyId,
      n: randomBytes(16).toString('hex'),
      exp,
    };
    const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
    const sig = createHmac('sha256', secret).update(payloadB64).digest();
    const sigB64 = base64UrlEncode(sig);
    return `${payloadB64}.${sigB64}`;
  }

  verifyState(stateParam) {
    const secret = this.env.META_APP_SECRET;
    const raw = String(stateParam || '').trim();
    const dot = raw.indexOf('.');
    if (dot <= 0) {
      return { ok: false, error: 'state_invalid' };
    }
    const payloadB64 = raw.slice(0, dot);
    const sigB64 = raw.slice(dot + 1);
    let sig;
    let expectedSig;
    try {
      sig = base64UrlDecodeToBuffer(sigB64);
      expectedSig = createHmac('sha256', secret).update(payloadB64).digest();
    } catch {
      return { ok: false, error: 'state_invalid' };
    }
    if (sig.length !== expectedSig.length || !timingSafeEqual(sig, expectedSig)) {
      return { ok: false, error: 'state_invalid' };
    }
    let payload;
    try {
      const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
      payload = JSON.parse(json);
    } catch {
      return { ok: false, error: 'state_invalid' };
    }
    const companyId = String(payload?.c || '').trim();
    const exp = Number(payload?.exp);
    if (!companyId || !Number.isFinite(exp)) {
      return { ok: false, error: 'state_invalid' };
    }
    if (Math.floor(Date.now() / 1000) > exp) {
      return { ok: false, error: 'state_expired' };
    }
    return { ok: true, companyId };
  }

  buildAuthorizeUrl(state) {
    const env = this.env;
    const u = new URL(wwwFacebookOauthUrl(env.META_GRAPH_VERSION));
    u.searchParams.set('client_id', env.META_APP_ID);
    u.searchParams.set('redirect_uri', env.META_OAUTH_REDIRECT_URI);
    u.searchParams.set('state', state);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', DEFAULT_SCOPES);
    return u.toString();
  }

  /**
   * GET /oauth/start — returns { redirectUrl } or { statusCode, body } (JSON error).
   */
  start(query) {
    const cfg = validateLiveOAuthConfig(this.env);
    if (!cfg.ok) {
      const message =
        cfg.reason === 'disabled'
          ? 'Instagram live OAuth is disabled'
          : 'Instagram OAuth is not configured (META_* / INSTAGRAM_TOKEN_ENCRYPTION_KEY)';
      return {
        ok: false,
        statusCode: 503,
        body: { ok: false, error: message, feature: 'instagram_oauth' },
      };
    }

    const companyId = String(query?.companyId || '').trim();
    if (!companyId) {
      return {
        ok: false,
        statusCode: 400,
        body: { ok: false, error: 'Missing companyId' },
      };
    }

    const state = this.signState(companyId);
    const redirectUrl = this.buildAuthorizeUrl(state);
    return { ok: true, redirectUrl };
  }

  async fetchJson(url) {
    const res = await fetch(url, { method: 'GET' });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const msg = data?.error?.message || data?.error_description || text || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.statusCode = res.status;
      err.graphError = data?.error;
      throw err;
    }
    return data;
  }

  async exchangeCodeForShortLivedToken(code) {
    const env = this.env;
    const u = new URL(`${graphOrigin(env.META_GRAPH_VERSION)}/oauth/access_token`);
    u.searchParams.set('client_id', env.META_APP_ID);
    u.searchParams.set('redirect_uri', env.META_OAUTH_REDIRECT_URI);
    u.searchParams.set('client_secret', env.META_APP_SECRET);
    u.searchParams.set('code', code);
    return this.fetchJson(u.toString());
  }

  async exchangeLongLivedToken(shortLived) {
    const env = this.env;
    const u = new URL(`${graphOrigin(env.META_GRAPH_VERSION)}/oauth/access_token`);
    u.searchParams.set('grant_type', 'fb_exchange_token');
    u.searchParams.set('client_id', env.META_APP_ID);
    u.searchParams.set('client_secret', env.META_APP_SECRET);
    u.searchParams.set('fb_exchange_token', shortLived);
    return this.fetchJson(u.toString());
  }

  async fetchInstagramBusinessIdentity(userAccessToken) {
    const env = this.env;
    const u = new URL(`${graphOrigin(env.META_GRAPH_VERSION)}/me/accounts`);
    u.searchParams.set('fields', 'name,instagram_business_account{id,username,name}');
    u.searchParams.set('access_token', userAccessToken);
    const data = await this.fetchJson(u.toString());
    const list = Array.isArray(data?.data) ? data.data : [];
    for (const page of list) {
      const ig = page?.instagram_business_account;
      if (ig?.id) {
        return {
          igUserId: String(ig.id),
          username: ig.username ? String(ig.username) : null,
          name: ig.name ? String(ig.name) : null,
        };
      }
    }
    return null;
  }

  async enrichIgProfile(igUserId, userAccessToken) {
    const env = this.env;
    const u = new URL(`${graphOrigin(env.META_GRAPH_VERSION)}/${encodeURIComponent(igUserId)}`);
    u.searchParams.set('fields', 'username,name');
    u.searchParams.set('access_token', userAccessToken);
    try {
      return await this.fetchJson(u.toString());
    } catch {
      return null;
    }
  }

  persistEncryptedToken({ sourceId, accessToken, expiresAtIso }) {
    const enc = encryptAccessTokenJson({
      keyHex: this.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY,
      payloadObject: {
        v: 1,
        accessToken,
        expiresAt: expiresAtIso ?? null,
      },
    });
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO instagram_source_oauth_tokens (instagram_source_id, enc_payload, updated_at)
      VALUES (@instagram_source_id, @enc_payload, @updated_at)
      ON CONFLICT(instagram_source_id) DO UPDATE SET
        enc_payload = excluded.enc_payload,
        updated_at = excluded.updated_at
    `).run({
      instagram_source_id: sourceId,
      enc_payload: enc,
      updated_at: now,
    });
  }

  /**
   * Always returns a frontend redirect URL (never throws for user-facing flows).
   */
  async completeCallback(query) {
    const env = this.env;
    const fail = (reason) => frontendRedirectUrl(env, { ok: false, reason });

    const cfg = validateLiveOAuthConfig(env);
    if (!cfg.ok) {
      return fail(cfg.reason === 'disabled' ? 'disabled' : 'config');
    }

    if (query?.error) {
      return fail('oauth_denied');
    }

    const code = String(query?.code || '').trim();
    const state = String(query?.state || '').trim();
    if (!code || !state) {
      return fail('callback_invalid');
    }

    const verified = this.verifyState(state);
    if (!verified.ok) {
      return fail(verified.error || 'state_invalid');
    }
    const { companyId } = verified;

    let shortData;
    try {
      shortData = await this.exchangeCodeForShortLivedToken(code);
    } catch {
      return fail('token_exchange_failed');
    }

    const shortToken = shortData?.access_token;
    if (!shortToken) {
      return fail('token_exchange_failed');
    }

    let longData;
    try {
      longData = await this.exchangeLongLivedToken(shortToken);
    } catch {
      return fail('token_exchange_failed');
    }

    const longToken = longData?.access_token;
    if (!longToken) {
      return fail('token_exchange_failed');
    }

    const expiresInSec = Number(longData?.expires_in);
    let expiresAtIso = null;
    if (Number.isFinite(expiresInSec) && expiresInSec > 0) {
      expiresAtIso = new Date(Date.now() + expiresInSec * 1000).toISOString();
    }

    let identity;
    try {
      identity = await this.fetchInstagramBusinessIdentity(longToken);
    } catch {
      return fail('graph_error');
    }

    if (!identity?.igUserId) {
      return fail('no_instagram_business');
    }

    let username = identity.username;
    let name = identity.name;
    if (!username || !name) {
      const prof = await this.enrichIgProfile(identity.igUserId, longToken);
      if (prof) {
        username = username || prof.username || null;
        name = name || prof.name || null;
      }
    }

    this.db.exec('BEGIN');
    try {
      const upsert = this.instagramSourcesService.upsertOAuthConnectedSource({
        companyId,
        accountExternalId: identity.igUserId,
        accountUsername: username,
        accountName: name,
        sourceLabel: null,
        credentialExpiresAt: expiresAtIso,
      });

      if (!upsert.ok) {
        this.db.exec('ROLLBACK');
        return fail('upsert_failed');
      }

      this.persistEncryptedToken({
        sourceId: upsert.sourceId,
        accessToken: longToken,
        expiresAtIso,
      });
      this.db.exec('COMMIT');
      return frontendRedirectUrl(env, { ok: true, sourceId: upsert.sourceId });
    } catch {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      return fail('token_persist_failed');
    }
  }
}
