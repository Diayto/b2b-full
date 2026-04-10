import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const CONNECTION_STATES = ['draft', 'configured', 'auth_required', 'active', 'paused', 'error'];
const CONTRACT_VALIDATION_STATUSES = ['unknown', 'valid', 'invalid'];

const ALLOWED_CONNECTION_TRANSITIONS = {
  draft: new Set(['configured', 'auth_required', 'error']),
  configured: new Set(['auth_required', 'active', 'paused', 'error']),
  auth_required: new Set(['configured', 'active', 'paused', 'error']),
  active: new Set(['paused', 'error']),
  paused: new Set(['active', 'error']),
  error: new Set(['configured', 'auth_required', 'paused']),
};

const createSourceSchema = z.object({
  companyId: z.string().min(1),
  sourceLabel: z.string().trim().max(120).optional(),
  accountExternalId: z.string().trim().min(1).max(160),
  accountUsername: z.string().trim().max(120).optional(),
  accountName: z.string().trim().max(160).optional(),
  connectionState: z.enum(CONNECTION_STATES).optional(),
});

const connectionContractUpdateSchema = z.object({
  companyId: z.string().min(1),
  sourceId: z.string().min(1),
  connectionState: z.enum(CONNECTION_STATES).optional(),
  connectionStateReason: z.string().trim().max(240).nullable().optional(),
  credentialSchemaVersion: z.string().trim().min(1).max(40).nullable().optional(),
  credentialPresence: z.union([
    z.boolean(),
    z.number().int().min(0).max(1),
    z.enum(['true', 'false', '1', '0']),
  ]).optional(),
  credentialRef: z.string().trim().max(240).nullable().optional(),
  credentialExpiresAt: z.string().trim().max(80).nullable().optional(),
  lastContractValidationStatus: z.enum(CONTRACT_VALIDATION_STATUSES).nullable().optional(),
  lastContractValidationMessage: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, context) => {
  const hasAnyField =
    value.connectionState !== undefined
    || value.connectionStateReason !== undefined
    || value.credentialSchemaVersion !== undefined
    || value.credentialPresence !== undefined
    || value.credentialRef !== undefined
    || value.credentialExpiresAt !== undefined
    || value.lastContractValidationStatus !== undefined
    || value.lastContractValidationMessage !== undefined;

  if (!hasAnyField) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'No connection-contract fields provided for update',
      path: ['connectionContract'],
    });
  }
});

function normalizeText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) return null;
  return normalizeText(String(value));
}

function toBoolean(value) {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true') return true;
  if (normalized === '0' || normalized === 'false') return false;
  return undefined;
}

function toPositiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const normalized = Math.floor(n);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, max);
}

function isIsoDateLike(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time);
}

function isConnectionTransitionAllowed(currentState, nextState) {
  if (currentState === nextState) return true;
  const allowed = ALLOWED_CONNECTION_TRANSITIONS[currentState];
  return Boolean(allowed && allowed.has(nextState));
}

function getSourceRow(db, { companyId, sourceId }) {
  return db.prepare(`
    SELECT *
    FROM instagram_sources
    WHERE id = ? AND company_id = ?
    LIMIT 1
  `).get(sourceId, companyId);
}

function mapSourceRow(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    platform: row.platform,
    sourceLabel: row.source_label,
    accountExternalId: row.account_external_id,
    accountUsername: row.account_username,
    accountName: row.account_name,
    connectionState: row.connection_state,
    connectionStateReason: row.connection_state_reason,
    connectionStateChangedAt: row.connection_state_changed_at,
    credentialSchemaVersion: row.credential_schema_version,
    credentialPresence: Boolean(row.credential_presence),
    credentialRef: row.credential_ref,
    credentialExpiresAt: row.credential_expires_at,
    lastContractValidatedAt: row.last_contract_validated_at,
    lastContractValidationStatus: row.last_contract_validation_status ?? 'unknown',
    lastContractValidationMessage: row.last_contract_validation_message,
    lastSyncRequestedAt: row.last_sync_requested_at,
    lastSyncCompletedAt: row.last_sync_completed_at,
    lastSyncStatus: row.last_sync_status,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapConnectionContract(row) {
  return {
    state: row.connection_state,
    stateReason: row.connection_state_reason,
    stateChangedAt: row.connection_state_changed_at,
    credentialSchemaVersion: row.credential_schema_version,
    credentialPresence: Boolean(row.credential_presence),
    credentialRef: row.credential_ref,
    credentialExpiresAt: row.credential_expires_at,
    lastContractValidatedAt: row.last_contract_validated_at,
    lastContractValidationStatus: row.last_contract_validation_status ?? 'unknown',
    lastContractValidationMessage: row.last_contract_validation_message,
  };
}

export class InstagramSourcesService {
  constructor({ db }) {
    this.db = db;
  }

  create(payload) {
    const parsed = createSourceSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Invalid payload',
        details: parsed.error.flatten(),
      };
    }

    const input = parsed.data;
    const companyId = input.companyId.trim();
    const accountExternalId = input.accountExternalId.trim();
    const now = new Date().toISOString();

    const existing = this.db.prepare(`
      SELECT id
      FROM instagram_sources
      WHERE company_id = ? AND account_external_id = ?
      LIMIT 1
    `).get(companyId, accountExternalId);

    if (existing) {
      return {
        ok: false,
        statusCode: 409,
        error: 'Instagram source already exists for this account',
        details: {
          companyId,
          accountExternalId,
          sourceId: existing.id,
        },
      };
    }

    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO instagram_sources (
        id, company_id, platform, source_label, account_external_id, account_username, account_name,
        connection_state_reason, connection_state_changed_at,
        credential_schema_version, credential_presence, credential_ref, credential_expires_at,
        last_contract_validated_at, last_contract_validation_status, last_contract_validation_message,
        connection_state, last_sync_requested_at, last_sync_completed_at, last_sync_status,
        last_error_code, last_error_message, created_at, updated_at
      ) VALUES (
        @id, @company_id, @platform, @source_label, @account_external_id, @account_username, @account_name,
        @connection_state_reason, @connection_state_changed_at,
        @credential_schema_version, @credential_presence, @credential_ref, @credential_expires_at,
        @last_contract_validated_at, @last_contract_validation_status, @last_contract_validation_message,
        @connection_state, @last_sync_requested_at, @last_sync_completed_at, @last_sync_status,
        @last_error_code, @last_error_message, @created_at, @updated_at
      )
    `).run({
      id,
      company_id: companyId,
      platform: 'instagram',
      source_label: normalizeText(input.sourceLabel),
      account_external_id: accountExternalId,
      account_username: normalizeText(input.accountUsername),
      account_name: normalizeText(input.accountName),
      connection_state_reason: null,
      connection_state_changed_at: now,
      credential_schema_version: null,
      credential_presence: 0,
      credential_ref: null,
      credential_expires_at: null,
      last_contract_validated_at: null,
      last_contract_validation_status: 'unknown',
      last_contract_validation_message: null,
      connection_state: input.connectionState ?? 'configured',
      last_sync_requested_at: null,
      last_sync_completed_at: null,
      last_sync_status: null,
      last_error_code: null,
      last_error_message: null,
      created_at: now,
      updated_at: now,
    });

    return this.getById({ companyId, sourceId: id, statusCode: 201 });
  }

  list(params) {
    const companyId = String(params.companyId || '').trim();
    if (!companyId) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Missing companyId',
      };
    }

    const connectionState = normalizeText(params.connectionState);
    const limit = toPositiveInt(params.limit, 100, 200);
    const offset = Math.max(0, Number(params.offset) || 0);

    const clauses = ['company_id = ?'];
    const values = [companyId];
    if (connectionState) {
      clauses.push('connection_state = ?');
      values.push(connectionState);
    }

    const whereSql = `WHERE ${clauses.join(' AND ')}`;
    const listStmt = this.db.prepare(`
      SELECT *
      FROM instagram_sources
      ${whereSql}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `);
    const countStmt = this.db.prepare(`
      SELECT COUNT(*) as total
      FROM instagram_sources
      ${whereSql}
    `);

    const rows = listStmt.all(...values, limit, offset);
    const countRow = countStmt.get(...values);

    return {
      ok: true,
      statusCode: 200,
      companyId,
      filters: {
        connectionState: connectionState ?? null,
        limit,
        offset,
      },
      total: Number(countRow?.total ?? 0),
      sources: rows.map(mapSourceRow),
    };
  }

  getById(params) {
    const companyId = String(params.companyId || '').trim();
    const sourceId = String(params.sourceId || '').trim();
    if (!companyId || !sourceId) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Missing companyId or sourceId',
      };
    }

    const row = getSourceRow(this.db, { companyId, sourceId });

    if (!row) {
      return {
        ok: false,
        statusCode: 404,
        error: 'Instagram source not found',
        details: { companyId, sourceId },
      };
    }

    return {
      ok: true,
      statusCode: Number(params.statusCode) || 200,
      source: mapSourceRow(row),
    };
  }

  getConnectionContract(params) {
    const companyId = String(params.companyId || '').trim();
    const sourceId = String(params.sourceId || '').trim();
    if (!companyId || !sourceId) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Missing companyId or sourceId',
      };
    }

    const row = getSourceRow(this.db, { companyId, sourceId });
    if (!row) {
      return {
        ok: false,
        statusCode: 404,
        error: 'Instagram source not found',
        details: { companyId, sourceId },
      };
    }

    return {
      ok: true,
      statusCode: 200,
      companyId,
      sourceId,
      source: {
        id: row.id,
        sourceLabel: row.source_label,
        accountExternalId: row.account_external_id,
        accountUsername: row.account_username,
      },
      connection: mapConnectionContract(row),
    };
  }

  updateConnectionContract(payload) {
    const parsed = connectionContractUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Invalid payload',
        details: parsed.error.flatten(),
      };
    }

    const input = parsed.data;
    const companyId = input.companyId.trim();
    const sourceId = input.sourceId.trim();
    const existing = getSourceRow(this.db, { companyId, sourceId });

    if (!existing) {
      return {
        ok: false,
        statusCode: 404,
        error: 'Instagram source not found',
        details: { companyId, sourceId },
      };
    }

    const now = new Date().toISOString();
    const nextState = input.connectionState ?? existing.connection_state;
    if (!isConnectionTransitionAllowed(existing.connection_state, nextState)) {
      return {
        ok: false,
        statusCode: 409,
        error: 'Invalid connection state transition',
        details: {
          from: existing.connection_state,
          to: nextState,
        },
      };
    }

    const stateChanged = nextState !== existing.connection_state;
    const nextCredentialPresence =
      input.credentialPresence !== undefined
        ? Boolean(toBoolean(input.credentialPresence))
        : Boolean(existing.credential_presence);
    if (nextState === 'active' && !nextCredentialPresence) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Active state requires credentialPresence=true',
        details: {
          connectionState: nextState,
          credentialPresence: nextCredentialPresence,
        },
      };
    }

    let nextCredentialExpiresAt = existing.credential_expires_at;
    if (input.credentialExpiresAt !== undefined) {
      if (input.credentialExpiresAt === null || String(input.credentialExpiresAt).trim() === '') {
        nextCredentialExpiresAt = null;
      } else if (!isIsoDateLike(input.credentialExpiresAt)) {
        return {
          ok: false,
          statusCode: 400,
          error: 'Invalid credentialExpiresAt; expected ISO datetime',
          details: { credentialExpiresAt: input.credentialExpiresAt },
        };
      } else {
        nextCredentialExpiresAt = new Date(input.credentialExpiresAt).toISOString();
      }
    }

    const validationStatusProvided = input.lastContractValidationStatus !== undefined;
    const validationMessageProvided = input.lastContractValidationMessage !== undefined;
    const nextValidationStatus = validationStatusProvided
      ? (input.lastContractValidationStatus ?? 'unknown')
      : (existing.last_contract_validation_status ?? 'unknown');
    const nextValidationMessage = validationMessageProvided
      ? normalizeOptionalText(input.lastContractValidationMessage)
      : existing.last_contract_validation_message;
    const nextValidatedAt = validationStatusProvided || validationMessageProvided
      ? now
      : existing.last_contract_validated_at;

    const nextStateReason = input.connectionStateReason !== undefined
      ? normalizeOptionalText(input.connectionStateReason)
      : stateChanged
        ? null
        : existing.connection_state_reason;

    const nextCredentialSchemaVersion = input.credentialSchemaVersion !== undefined
      ? normalizeOptionalText(input.credentialSchemaVersion)
      : existing.credential_schema_version;
    const nextCredentialRef = input.credentialRef !== undefined
      ? normalizeOptionalText(input.credentialRef)
      : existing.credential_ref;

    this.db.prepare(`
      UPDATE instagram_sources
      SET
        connection_state = @connection_state,
        connection_state_reason = @connection_state_reason,
        connection_state_changed_at = @connection_state_changed_at,
        credential_schema_version = @credential_schema_version,
        credential_presence = @credential_presence,
        credential_ref = @credential_ref,
        credential_expires_at = @credential_expires_at,
        last_contract_validated_at = @last_contract_validated_at,
        last_contract_validation_status = @last_contract_validation_status,
        last_contract_validation_message = @last_contract_validation_message,
        updated_at = @updated_at
      WHERE id = @id AND company_id = @company_id
    `).run({
      id: sourceId,
      company_id: companyId,
      connection_state: nextState,
      connection_state_reason: nextStateReason,
      connection_state_changed_at: stateChanged
        ? now
        : (existing.connection_state_changed_at ?? existing.updated_at ?? existing.created_at ?? now),
      credential_schema_version: nextCredentialSchemaVersion,
      credential_presence: nextCredentialPresence ? 1 : 0,
      credential_ref: nextCredentialRef,
      credential_expires_at: nextCredentialExpiresAt,
      last_contract_validated_at: nextValidatedAt,
      last_contract_validation_status: nextValidationStatus,
      last_contract_validation_message: nextValidationMessage,
      updated_at: now,
    });

    return this.getConnectionContract({ companyId, sourceId });
  }

  /**
   * Internal: bind or refresh an Instagram Graph account after OAuth (no transition validation).
   * Persists account identity; OAuth token row is stored separately by InstagramOAuthService.
   */
  upsertOAuthConnectedSource({
    companyId,
    accountExternalId,
    accountUsername,
    accountName,
    sourceLabel,
    credentialExpiresAt,
  }) {
    const companyIdNorm = String(companyId || '').trim();
    const accountExternalIdNorm = String(accountExternalId || '').trim();
    if (!companyIdNorm || !accountExternalIdNorm) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Missing companyId or accountExternalId',
      };
    }

    const now = new Date().toISOString();
    const username = normalizeOptionalText(accountUsername);
    const name = normalizeOptionalText(accountName);
    const label = normalizeOptionalText(sourceLabel);

    let expiresAt = null;
    if (credentialExpiresAt != null && String(credentialExpiresAt).trim() !== '') {
      if (!isIsoDateLike(credentialExpiresAt)) {
        return {
          ok: false,
          statusCode: 400,
          error: 'Invalid credentialExpiresAt',
        };
      }
      expiresAt = new Date(credentialExpiresAt).toISOString();
    }

    const existing = this.db.prepare(`
      SELECT id
      FROM instagram_sources
      WHERE company_id = ? AND account_external_id = ?
      LIMIT 1
    `).get(companyIdNorm, accountExternalIdNorm);

    if (existing?.id) {
      this.db.prepare(`
        UPDATE instagram_sources
        SET
          account_username = @account_username,
          account_name = @account_name,
          source_label = COALESCE(@source_label, source_label),
          connection_state = 'active',
          connection_state_reason = NULL,
          connection_state_changed_at = @now,
          credential_schema_version = 'meta_oauth_v1',
          credential_presence = 1,
          credential_ref = 'oauth_token:v1',
          credential_expires_at = @credential_expires_at,
          last_contract_validated_at = @now,
          last_contract_validation_status = 'valid',
          last_contract_validation_message = NULL,
          last_error_code = NULL,
          last_error_message = NULL,
          updated_at = @now
        WHERE id = @id AND company_id = @company_id
      `).run({
        id: existing.id,
        company_id: companyIdNorm,
        account_username: username,
        account_name: name,
        source_label: label,
        credential_expires_at: expiresAt,
        now,
      });

      return {
        ok: true,
        statusCode: 200,
        sourceId: existing.id,
        created: false,
      };
    }

    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO instagram_sources (
        id, company_id, platform, source_label, account_external_id, account_username, account_name,
        connection_state, connection_state_reason, connection_state_changed_at,
        credential_schema_version, credential_presence, credential_ref, credential_expires_at,
        last_contract_validated_at, last_contract_validation_status, last_contract_validation_message,
        last_sync_requested_at, last_sync_completed_at, last_sync_status,
        last_error_code, last_error_message, created_at, updated_at
      ) VALUES (
        @id, @company_id, 'instagram', @source_label, @account_external_id, @account_username, @account_name,
        'active', NULL, @now,
        'meta_oauth_v1', 1, 'oauth_token:v1', @credential_expires_at,
        @now, 'valid', NULL,
        NULL, NULL, NULL,
        NULL, NULL, @now, @now
      )
    `).run({
      id,
      company_id: companyIdNorm,
      source_label: label,
      account_external_id: accountExternalIdNorm,
      account_username: username,
      account_name: name,
      credential_expires_at: expiresAt,
      now,
    });

    return {
      ok: true,
      statusCode: 201,
      sourceId: id,
      created: true,
    };
  }
}
