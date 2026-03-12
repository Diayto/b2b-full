import { useEffect } from 'react';
import { getSession } from '@/lib/store';
import { processDeadlineReminders } from '@/lib/deadline-notifications';

const LAST_RUN_KEY = 'bp_deadline_reminder_last_run';
const RUN_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function shouldRunNow(): boolean {
  const raw = localStorage.getItem(LAST_RUN_KEY);
  if (!raw) return true;
  const ts = Number(raw);
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts >= RUN_INTERVAL_MS;
}

function markRun(): void {
  localStorage.setItem(LAST_RUN_KEY, String(Date.now()));
}

export default function DeadlineReminderBootstrap() {
  useEffect(() => {
    let disposed = false;

    const tick = async () => {
      const session = getSession();
      if (!session || !shouldRunNow()) return;

      markRun();
      const result = await processDeadlineReminders(session.companyId);
      if (!disposed && result.processed > 0) {
        console.log('Deadline reminders processed:', result);
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), RUN_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
