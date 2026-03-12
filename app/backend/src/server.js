import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { z } from 'zod';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const IDEMPOTENCY_FILE = path.join(DATA_DIR, 'idempotency.json');
const LOG_FILE = path.join(DATA_DIR, 'deadline-reminders.log');
const RETRY_QUEUE_FILE = path.join(DATA_DIR, 'retry-queue.json');
const DEAD_LETTER_FILE = path.join(DATA_DIR, 'dead-letter.json');

const app = express();
const PORT = Number(process.env.PORT || 8000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const MAX_RETRY_ATTEMPTS = Number(process.env.MAX_RETRY_ATTEMPTS || 4);
const RETRY_BASE_MS = Number(process.env.RETRY_BASE_MS || 60_000);
const RETRY_TICK_MS = 15_000;

const reminderSchema = z.object({
  requestId: z.string().min(1),
  companyId: z.string().min(1),
  documentId: z.string().min(1),
  documentTitle: z.string().min(1),
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daysBefore: z.number().int().nonnegative(),
  recipientEmail: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
});

/**
 * @typedef {{
 *   requestId: string;
 *   companyId: string;
 *   documentId: string;
 *   documentTitle: string;
 *   deadlineDate: string;
 *   daysBefore: number;
 *   recipientEmail: string;
 *   subject: string;
 *   html: string;
 * }} ReminderPayload
 */

/**
 * @typedef {{
 *   key: string;
 *   payload: ReminderPayload;
 *   attempt: number;
 *   nextAttemptAt: string;
 *   lastError?: string;
 * }} RetryJob
 */

/**
 * @type {Map<string, { status: 'accepted' | 'queued' | 'sent' | 'failed', messageId?: string, provider?: string, error?: string }>}
 */
const idempotencyStore = new Map();

/** @type {RetryJob[]} */
let retryQueue = [];

/** @type {(RetryJob & { movedToDlqAt: string })[]} */
let deadLetterQueue = [];

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

function getSmtpTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

const resendApiKey = process.env.RESEND_API_KEY;
const resendClient = resendApiKey ? new Resend(resendApiKey) : null;
const smtpTransporter = getSmtpTransporter();

function activeProvider() {
  if (resendClient) return 'resend';
  if (smtpTransporter) return 'smtp';
  return 'none';
}

async function ensureDataFiles() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(IDEMPOTENCY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    for (const [key, value] of Object.entries(parsed)) {
      idempotencyStore.set(key, /** @type {any} */ (value));
    }
  } catch {
    await writeFile(IDEMPOTENCY_FILE, '{}', 'utf-8');
  }

  try {
    retryQueue = JSON.parse(await readFile(RETRY_QUEUE_FILE, 'utf-8'));
  } catch {
    retryQueue = [];
    await writeFile(RETRY_QUEUE_FILE, '[]', 'utf-8');
  }

  try {
    deadLetterQueue = JSON.parse(await readFile(DEAD_LETTER_FILE, 'utf-8'));
  } catch {
    deadLetterQueue = [];
    await writeFile(DEAD_LETTER_FILE, '[]', 'utf-8');
  }
}

async function persistIdempotency() {
  const obj = Object.fromEntries(idempotencyStore.entries());
  await writeFile(IDEMPOTENCY_FILE, JSON.stringify(obj, null, 2), 'utf-8');
}

async function persistRetryQueue() {
  await writeFile(RETRY_QUEUE_FILE, JSON.stringify(retryQueue, null, 2), 'utf-8');
}

async function persistDeadLetter() {
  await writeFile(DEAD_LETTER_FILE, JSON.stringify(deadLetterQueue, null, 2), 'utf-8');
}

async function appendLog(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
  await appendFile(LOG_FILE, line, 'utf-8');
}

function calcBackoffMs(attempt) {
  const exponent = Math.max(0, attempt - 1);
  return RETRY_BASE_MS * 2 ** exponent;
}

async function sendViaProvider(payload) {
  if (resendClient) {
    const from = process.env.RESEND_FROM || 'BizPulse <onboarding@resend.dev>';
    const response = await resendClient.emails.send({
      from,
      to: payload.recipientEmail,
      subject: payload.subject,
      html: payload.html,
    });
    if (response.error) {
      throw new Error(response.error.message || 'Resend provider error');
    }
    return {
      status: 'sent',
      messageId: response.data?.id,
      provider: 'resend',
    };
  }

  if (smtpTransporter) {
    const info = await smtpTransporter.sendMail({
      from: process.env.SMTP_FROM || 'BizPulse <no-reply@bizpulse.local>',
      to: payload.recipientEmail,
      subject: payload.subject,
      html: payload.html,
    });
    return {
      status: 'sent',
      messageId: info.messageId,
      provider: 'smtp',
    };
  }

  throw new Error('No provider configured');
}

async function enqueueRetryJob(key, payload, attempt, errorMessage) {
  const existing = retryQueue.find((job) => job.key === key);
  if (existing) return;

  const delayMs = calcBackoffMs(attempt);
  const job = {
    key,
    payload,
    attempt,
    nextAttemptAt: new Date(Date.now() + delayMs).toISOString(),
    lastError: errorMessage,
  };
  retryQueue.push(job);
  idempotencyStore.set(key, { status: 'queued', provider: activeProvider(), error: errorMessage });
  await persistRetryQueue();
  await persistIdempotency();
  await appendLog({ event: 'queued', key, attempt, error: errorMessage });
}

async function moveToDeadLetter(job, reason) {
  const deadItem = { ...job, movedToDlqAt: new Date().toISOString(), lastError: reason };
  deadLetterQueue.push(deadItem);
  idempotencyStore.set(job.key, { status: 'failed', provider: activeProvider(), error: reason });
  await persistDeadLetter();
  await persistIdempotency();
  await appendLog({ event: 'dead_letter', key: job.key, attempt: job.attempt, error: reason });
}

let retryWorkerBusy = false;
async function processRetryQueue() {
  if (retryWorkerBusy || retryQueue.length === 0) return;
  retryWorkerBusy = true;

  try {
    const now = Date.now();
    const dueJobs = retryQueue.filter((job) => new Date(job.nextAttemptAt).getTime() <= now);
    if (dueJobs.length === 0) return;

    for (const job of dueJobs) {
      retryQueue = retryQueue.filter((item) => item.key !== job.key);
      const attempt = job.attempt + 1;

      try {
        const result = await sendViaProvider(job.payload);
        idempotencyStore.set(job.key, result);
        await appendLog({ event: 'retry_sent', key: job.key, attempt, provider: result.provider });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown provider error';
        if (attempt >= MAX_RETRY_ATTEMPTS) {
          await moveToDeadLetter({ ...job, attempt }, message);
        } else {
          const delayMs = calcBackoffMs(attempt);
          retryQueue.push({
            ...job,
            attempt,
            nextAttemptAt: new Date(Date.now() + delayMs).toISOString(),
            lastError: message,
          });
          idempotencyStore.set(job.key, { status: 'queued', provider: activeProvider(), error: message });
          await appendLog({ event: 'retry_queued', key: job.key, attempt, error: message });
        }
      }
    }
  } finally {
    await persistRetryQueue();
    await persistIdempotency();
    retryWorkerBusy = false;
  }
}

app.get('/api/notifications/health', (_req, res) => {
  res.json({
    ok: true,
    provider: activeProvider(),
    retryQueueSize: retryQueue.length,
    deadLetterSize: deadLetterQueue.length,
    now: new Date().toISOString(),
  });
});

app.get('/api/notifications/queue', (_req, res) => {
  res.json({
    provider: activeProvider(),
    retryQueue,
    deadLetterQueue: deadLetterQueue.slice(-50),
  });
});

app.post('/api/notifications/deadlines', async (req, res) => {
  const parsed = reminderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      status: 'failed',
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  const payload = parsed.data;
  const key = req.header('X-Request-Id') || payload.requestId;

  if (idempotencyStore.has(key)) {
    return res.json(idempotencyStore.get(key));
  }

  try {
    const result = await sendViaProvider(payload);
    idempotencyStore.set(key, result);
    await persistIdempotency();
    await appendLog({ event: 'sent', key, provider: result.provider, messageId: result.messageId });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown provider error';
    await enqueueRetryJob(key, payload, 1, message);
    return res.status(202).json({
      status: 'queued',
      provider: activeProvider(),
      error: message,
    });
  }
});

app.post('/api/notifications/retry-dead-letter', async (_req, res) => {
  const items = [...deadLetterQueue];
  deadLetterQueue = [];
  for (const item of items) {
    retryQueue.push({
      key: item.key,
      payload: item.payload,
      attempt: 1,
      nextAttemptAt: new Date().toISOString(),
      lastError: item.lastError,
    });
    idempotencyStore.set(item.key, { status: 'queued', provider: activeProvider(), error: 'Re-queued from DLQ' });
  }
  await persistDeadLetter();
  await persistRetryQueue();
  await persistIdempotency();
  await appendLog({ event: 'dead_letter_requeued', count: items.length });
  return res.json({ status: 'accepted', requeued: items.length });
});

ensureDataFiles()
  .then(() => {
    setInterval(() => {
      void processRetryQueue();
    }, RETRY_TICK_MS);

    app.listen(PORT, () => {
      console.log(`BizPulse backend listening on http://localhost:${PORT}`);
      console.log(`CORS origin: ${CORS_ORIGIN}`);
      console.log(`Active provider: ${activeProvider()}`);
      console.log(`Retry policy: max=${MAX_RETRY_ATTEMPTS}, baseMs=${RETRY_BASE_MS}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize backend:', error);
    process.exit(1);
  });
