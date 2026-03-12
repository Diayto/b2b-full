import { format, parseISO } from 'date-fns';
import type { DeadlineReminderRequest } from './types';

function sanitizeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function createReminderRequestId(
  companyId: string,
  documentId: string,
  deadlineDate: string,
  daysBefore: number,
  recipientEmail: string
): string {
  return `${companyId}:${documentId}:${deadlineDate}:${daysBefore}:${recipientEmail.toLowerCase()}`;
}

export function buildDeadlineReminderRequest(input: Omit<DeadlineReminderRequest, 'requestId'>): DeadlineReminderRequest {
  return {
    ...input,
    requestId: createReminderRequestId(
      input.companyId,
      input.documentId,
      input.deadlineDate,
      input.daysBefore,
      input.recipientEmail
    ),
  };
}

export function buildDeadlineReminderSubject(documentTitle: string, daysBefore: number): string {
  const normalizedTitle = documentTitle.trim() || 'Договор';
  if (daysBefore === 0) {
    return `Сегодня дедлайн: ${normalizedTitle}`;
  }
  return `Дедлайн через ${daysBefore} дн.: ${normalizedTitle}`;
}

export function buildDeadlineReminderHtml(input: {
  companyName?: string;
  documentTitle: string;
  deadlineDate: string;
  daysBefore: number;
}): string {
  const safeCompany = sanitizeHtml(input.companyName || 'Ваша компания');
  const safeTitle = sanitizeHtml(input.documentTitle || 'Документ');
  const deadline = format(parseISO(input.deadlineDate), 'dd.MM.yyyy');
  const urgencyText =
    input.daysBefore === 0
      ? 'Срок документа наступает сегодня.'
      : `До дедлайна осталось ${input.daysBefore} дн.`;

  return `
<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:20px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:24px 24px 8px 24px;">
                <h2 style="margin:0;font-size:20px;color:#1e3a5f;">Напоминание о дедлайне</h2>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 0 24px;font-size:14px;line-height:1.6;">
                <p style="margin:0 0 10px 0;">Компания: <strong>${safeCompany}</strong></p>
                <p style="margin:0 0 10px 0;">Документ: <strong>${safeTitle}</strong></p>
                <p style="margin:0 0 10px 0;">Дедлайн: <strong>${deadline}</strong></p>
                <p style="margin:0 0 16px 0;color:#b91c1c;"><strong>${sanitizeHtml(urgencyText)}</strong></p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px;font-size:12px;color:#64748b;">
                Это автоматическое уведомление BizPulse. Проверьте продление/исполнение документа.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();
}
