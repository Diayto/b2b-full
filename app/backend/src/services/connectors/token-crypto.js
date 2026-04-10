import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function parseKeyHex(keyHex) {
  if (!keyHex || typeof keyHex !== 'string') return null;
  const normalized = keyHex.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) return null;
  return Buffer.from(normalized, 'hex');
}

export function encryptAccessTokenJson({ keyHex, payloadObject }) {
  const key = parseKeyHex(keyHex);
  if (!key) {
    throw new Error('INSTAGRAM_TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const plaintext = JSON.stringify(payloadObject);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const bundle = Buffer.concat([iv, tag, enc]);
  return bundle.toString('base64url');
}

export function decryptAccessTokenJson({ keyHex, encPayload }) {
  const key = parseKeyHex(keyHex);
  if (!key) {
    throw new Error('INSTAGRAM_TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  const buf = Buffer.from(String(encPayload), 'base64url');
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Invalid encrypted payload');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(out.toString('utf8'));
}

export function assertEncryptionKeyFormat(keyHex) {
  return Boolean(parseKeyHex(keyHex));
}
