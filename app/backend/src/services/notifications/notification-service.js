import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { z } from 'zod';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

export const reminderSchema = z.object({
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

export class NotificationService {
  constructor({ env, dataDir }) {
    this.env = env;
    this.dataDir = dataDir;
    this.idempotencyFile = path.join(dataDir, 'idempotency.json');
    this.logFile = path.join(dataDir, 'deadline-reminders.log');
    this.retryQueueFile = path.join(dataDir, 'retry-queue.json');
    this.deadLetterFile = path.join(dataDir, 'dead-letter.json');

    this.idempotencyStore = new Map();
    this.retryQueue = [];
    this.deadLetterQueue = [];
    this.retryWorkerBusy = false;
    this.retryTimer = null;

    const resendApiKey = process.env.RESEND_API_KEY;
    this.resendClient = resendApiKey ? new Resend(resendApiKey) : null;
    this.smtpTransporter = this.getSmtpTransporter();
  }

  getSmtpTransporter() {
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

  activeProvider() {
    if (this.resendClient) return 'resend';
    if (this.smtpTransporter) return 'smtp';
    return 'none';
  }

  async init() {
    await this.ensureDataFiles();
  }

  startWorker() {
    if (this.retryTimer) return;
    this.retryTimer = setInterval(() => {
      void this.processRetryQueue();
    }, this.env.RETRY_TICK_MS);
  }

  stopWorker() {
    if (!this.retryTimer) return;
    clearInterval(this.retryTimer);
    this.retryTimer = null;
  }

  async ensureDataFiles() {
    await mkdir(this.dataDir, { recursive: true });

    try {
      const raw = await readFile(this.idempotencyFile, 'utf-8');
      const parsed = JSON.parse(raw);
      for (const [key, value] of Object.entries(parsed)) {
        this.idempotencyStore.set(key, value);
      }
    } catch {
      await writeFile(this.idempotencyFile, '{}', 'utf-8');
    }

    try {
      this.retryQueue = JSON.parse(await readFile(this.retryQueueFile, 'utf-8'));
    } catch {
      this.retryQueue = [];
      await writeFile(this.retryQueueFile, '[]', 'utf-8');
    }

    try {
      this.deadLetterQueue = JSON.parse(await readFile(this.deadLetterFile, 'utf-8'));
    } catch {
      this.deadLetterQueue = [];
      await writeFile(this.deadLetterFile, '[]', 'utf-8');
    }
  }

  async persistIdempotency() {
    const obj = Object.fromEntries(this.idempotencyStore.entries());
    await writeFile(this.idempotencyFile, JSON.stringify(obj, null, 2), 'utf-8');
  }

  async persistRetryQueue() {
    await writeFile(this.retryQueueFile, JSON.stringify(this.retryQueue, null, 2), 'utf-8');
  }

  async persistDeadLetter() {
    await writeFile(this.deadLetterFile, JSON.stringify(this.deadLetterQueue, null, 2), 'utf-8');
  }

  async appendLog(entry) {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
    await appendFile(this.logFile, line, 'utf-8');
  }

  calcBackoffMs(attempt) {
    const exponent = Math.max(0, attempt - 1);
    return this.env.RETRY_BASE_MS * 2 ** exponent;
  }

  async sendViaProvider(payload) {
    if (this.resendClient) {
      const from = process.env.RESEND_FROM || 'BizPulse <onboarding@resend.dev>';
      const response = await this.resendClient.emails.send({
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

    if (this.smtpTransporter) {
      const info = await this.smtpTransporter.sendMail({
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

  async enqueueRetryJob(key, payload, attempt, errorMessage) {
    const existing = this.retryQueue.find((job) => job.key === key);
    if (existing) return;

    const delayMs = this.calcBackoffMs(attempt);
    const job = {
      key,
      payload,
      attempt,
      nextAttemptAt: new Date(Date.now() + delayMs).toISOString(),
      lastError: errorMessage,
    };

    this.retryQueue.push(job);
    this.idempotencyStore.set(key, {
      status: 'queued',
      provider: this.activeProvider(),
      error: errorMessage,
    });

    await this.persistRetryQueue();
    await this.persistIdempotency();
    await this.appendLog({ event: 'queued', key, attempt, error: errorMessage });
  }

  async moveToDeadLetter(job, reason) {
    const deadItem = {
      ...job,
      movedToDlqAt: new Date().toISOString(),
      lastError: reason,
    };

    this.deadLetterQueue.push(deadItem);
    this.idempotencyStore.set(job.key, {
      status: 'failed',
      provider: this.activeProvider(),
      error: reason,
    });

    await this.persistDeadLetter();
    await this.persistIdempotency();
    await this.appendLog({ event: 'dead_letter', key: job.key, attempt: job.attempt, error: reason });
  }

  async processRetryQueue() {
    if (this.retryWorkerBusy || this.retryQueue.length === 0) return;
    this.retryWorkerBusy = true;

    try {
      const now = Date.now();
      const dueJobs = this.retryQueue.filter((job) => new Date(job.nextAttemptAt).getTime() <= now);
      if (dueJobs.length === 0) return;

      for (const job of dueJobs) {
        this.retryQueue = this.retryQueue.filter((item) => item.key !== job.key);
        const attempt = job.attempt + 1;

        try {
          const result = await this.sendViaProvider(job.payload);
          this.idempotencyStore.set(job.key, result);
          await this.appendLog({ event: 'retry_sent', key: job.key, attempt, provider: result.provider });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown provider error';
          if (attempt >= this.env.MAX_RETRY_ATTEMPTS) {
            await this.moveToDeadLetter({ ...job, attempt }, message);
          } else {
            const delayMs = this.calcBackoffMs(attempt);
            this.retryQueue.push({
              ...job,
              attempt,
              nextAttemptAt: new Date(Date.now() + delayMs).toISOString(),
              lastError: message,
            });
            this.idempotencyStore.set(job.key, {
              status: 'queued',
              provider: this.activeProvider(),
              error: message,
            });
            await this.appendLog({ event: 'retry_queued', key: job.key, attempt, error: message });
          }
        }
      }
    } finally {
      await this.persistRetryQueue();
      await this.persistIdempotency();
      this.retryWorkerBusy = false;
    }
  }

  getHealth() {
    return {
      ok: true,
      provider: this.activeProvider(),
      retryQueueSize: this.retryQueue.length,
      deadLetterSize: this.deadLetterQueue.length,
      now: new Date().toISOString(),
    };
  }

  getQueueSnapshot() {
    return {
      provider: this.activeProvider(),
      retryQueue: this.retryQueue,
      deadLetterQueue: this.deadLetterQueue.slice(-50),
    };
  }

  async sendDeadline(payload, key) {
    if (this.idempotencyStore.has(key)) {
      return { statusCode: 200, body: this.idempotencyStore.get(key) };
    }

    try {
      const result = await this.sendViaProvider(payload);
      this.idempotencyStore.set(key, result);
      await this.persistIdempotency();
      await this.appendLog({ event: 'sent', key, provider: result.provider, messageId: result.messageId });
      return { statusCode: 200, body: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown provider error';
      await this.enqueueRetryJob(key, payload, 1, message);
      return {
        statusCode: 202,
        body: {
          status: 'queued',
          provider: this.activeProvider(),
          error: message,
        },
      };
    }
  }

  async retryDeadLetter() {
    const items = [...this.deadLetterQueue];
    this.deadLetterQueue = [];

    for (const item of items) {
      this.retryQueue.push({
        key: item.key,
        payload: item.payload,
        attempt: 1,
        nextAttemptAt: new Date().toISOString(),
        lastError: item.lastError,
      });
      this.idempotencyStore.set(item.key, {
        status: 'queued',
        provider: this.activeProvider(),
        error: 'Re-queued from DLQ',
      });
    }

    await this.persistDeadLetter();
    await this.persistRetryQueue();
    await this.persistIdempotency();
    await this.appendLog({ event: 'dead_letter_requeued', count: items.length });
    return { status: 'accepted', requeued: items.length };
  }
}

