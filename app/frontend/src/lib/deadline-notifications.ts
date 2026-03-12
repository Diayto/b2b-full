import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';
import {
  addDeadlineReminderLog,
  getCompany,
  getDeadlineReminderLogs,
  getDocuments,
  getNotificationSettings,
  wasReminderSent,
} from './store';
import { getAPIBaseURL } from './config';
import {
  buildDeadlineReminderHtml,
  buildDeadlineReminderRequest,
  buildDeadlineReminderSubject,
} from './notification-contract';
import type { DeadlineReminderRequest, DeadlineReminderResponse } from './types';

interface ProcessRemindersResult {
  processed: number;
  sent: number;
  queued: number;
  failed: number;
}

async function sendDeadlineReminder(payload: DeadlineReminderRequest): Promise<{ ok: boolean; error?: string }> {
  try {
    const base = getAPIBaseURL();
    const endpoint = `${base}/api/notifications/deadlines`;
    const company = getCompany(payload.companyId);
    const body = {
      ...payload,
      subject: buildDeadlineReminderSubject(payload.documentTitle, payload.daysBefore),
      html: buildDeadlineReminderHtml({
        companyName: company?.name,
        documentTitle: payload.documentTitle,
        deadlineDate: payload.deadlineDate,
        daysBefore: payload.daysBefore,
      }),
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': payload.requestId,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }

    const data = (await response.json().catch(() => ({}))) as Partial<DeadlineReminderResponse>;
    if (data.status === 'failed') {
      return { ok: false, error: data.error || 'Provider failed' };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown network error' };
  }
}

export async function processDeadlineReminders(companyId: string): Promise<ProcessRemindersResult> {
  const settings = getNotificationSettings(companyId);
  if (!settings.enabled || settings.recipientEmails.length === 0) {
    return { processed: 0, sent: 0, queued: 0, failed: 0 };
  }

  const documents = getDocuments(companyId).filter((doc) => Boolean(doc.endDate));
  const today = startOfDay(new Date());
  let processed = 0;
  let sent = 0;
  let queued = 0;
  let failed = 0;

  for (const doc of documents) {
    const deadlineDate = doc.endDate!;
    const daysBefore = differenceInCalendarDays(parseISO(deadlineDate), today);

    if (!settings.reminderDays.includes(daysBefore)) {
      continue;
    }

    for (const email of settings.recipientEmails) {
      if (wasReminderSent(companyId, doc.id, deadlineDate, daysBefore, email)) {
        continue;
      }

      processed += 1;
      const request = buildDeadlineReminderRequest({
        companyId,
        documentId: doc.id,
        documentTitle: doc.title,
        deadlineDate,
        daysBefore,
        recipientEmail: email,
      });
      const result = await sendDeadlineReminder(request);

      if (result.ok) {
        addDeadlineReminderLog(companyId, {
          documentId: doc.id,
          documentTitle: doc.title,
          deadlineDate,
          daysBefore,
          recipientEmail: email,
          status: 'sent',
        });
        sent += 1;
      } else {
        // Queue semantic for local MVP: backend unavailable but event captured.
        const status = result.error?.startsWith('HTTP') ? 'failed' : 'queued';
        addDeadlineReminderLog(companyId, {
          documentId: doc.id,
          documentTitle: doc.title,
          deadlineDate,
          daysBefore,
          recipientEmail: email,
          status,
          error: result.error,
        });
        if (status === 'queued') queued += 1;
        if (status === 'failed') failed += 1;
      }
    }
  }

  return { processed, sent, queued, failed };
}

export function getRecentReminderLogs(companyId: string, limit = 15) {
  return getDeadlineReminderLogs(companyId).slice(0, limit);
}
