// ============================================================
// BizPulse KZ — Settings Page
// ============================================================

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Building2, User, Database, Trash2, BellRing } from 'lucide-react';
import {
  getSession, getCurrentUser, getCompany, getTransactions, getCustomers, getInvoices, getDocuments,
  getNotificationSettings, saveNotificationSettings,
} from '@/lib/store';
import { getRecentReminderLogs, processDeadlineReminders } from '@/lib/deadline-notifications';

export default function SettingsPage() {
  const navigate = useNavigate();
  const session = getSession();
  const user = getCurrentUser();
  const company = session ? getCompany(session.companyId) : null;

  const companyId = session?.companyId || '';
  const txnCount = getTransactions(companyId).length;
  const custCount = getCustomers(companyId).length;
  const invCount = getInvoices(companyId).length;
  const docCount = getDocuments(companyId).length;
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifEmails, setNotifEmails] = useState('');
  const [notifDays, setNotifDays] = useState<number[]>([7, 3, 0]);
  const [sendingNow, setSendingNow] = useState(false);
  const [recentLogs, setRecentLogs] = useState(() => getRecentReminderLogs(companyId));

  useEffect(() => {
    if (!companyId) return;
    const settings = getNotificationSettings(companyId);
    setNotifEnabled(settings.enabled);
    setNotifEmails(settings.recipientEmails.join(', '));
    setNotifDays(settings.reminderDays);
    setRecentLogs(getRecentReminderLogs(companyId));
  }, [companyId]);

  const handleClearData = () => {
    if (window.confirm('Вы уверены? Все данные компании будут удалены.')) {
      const keys = [
        'bp_transactions', 'bp_customers', 'bp_invoices',
        'bp_marketing_spend',
        'bp_leads',
        'bp_deals',
        'bp_channels_campaigns',
        'bp_managers',
        'bp_payments',
        'bp_documents', 'bp_uploads', 'bp_signals',
        'bp_notification_settings', 'bp_deadline_reminder_logs',
      ];
      for (const key of keys) {
        const data = JSON.parse(localStorage.getItem(key) || '[]');
        const filtered = data.filter((item: { companyId: string }) => item.companyId !== companyId);
        localStorage.setItem(key, JSON.stringify(filtered));
      }
      toast.success('Данные компании очищены');
      window.location.reload();
    }
  };

  const toggleDay = (day: number) => {
    setNotifDays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day].sort((a, b) => b - a)
    );
  };

  const handleSaveNotifications = () => {
    const recipientEmails = notifEmails
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    if (notifEnabled && recipientEmails.length === 0) {
      toast.error('Добавьте хотя бы один email для уведомлений');
      return;
    }
    if (notifEnabled && notifDays.length === 0) {
      toast.error('Выберите хотя бы один день уведомления');
      return;
    }

    saveNotificationSettings(companyId, {
      enabled: notifEnabled,
      recipientEmails,
      reminderDays: notifDays,
    });
    toast.success('Настройки уведомлений сохранены');
    setRecentLogs(getRecentReminderLogs(companyId));
  };

  const handleRunReminderCheck = async () => {
    setSendingNow(true);
    try {
      const result = await processDeadlineReminders(companyId);
      setRecentLogs(getRecentReminderLogs(companyId));
      toast.success(`Проверка завершена: обработано ${result.processed}, отправлено ${result.sent}`);
    } catch {
      toast.error('Не удалось выполнить проверку уведомлений');
    } finally {
      setSendingNow(false);
    }
  };

  if (!session || !user || !company) {
    navigate('/');
    return null;
  }

  return (
    <AppLayout>
      <div className="rct-page p-4 lg:p-6 space-y-8 max-w-[800px] mx-auto">
        <div>
          <h1 className="rct-page-title">Настройки</h1>
          <p className="rct-body-micro mt-1">Управление аккаунтом и компанией</p>
        </div>

        {/* Company Info */}
        <Card className="rct-card">
          <CardHeader className="rct-card-padding pb-3">
            <CardTitle className="rct-section-title flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Компания
            </CardTitle>
          </CardHeader>
          <CardContent className="rct-card-padding pt-0 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Название</Label>
                <p className="text-sm font-medium text-foreground">{company.name}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Валюта</Label>
                <p className="text-sm font-medium text-foreground">{company.currency} (₸)</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">ID компании</Label>
                <p className="text-xs font-mono text-muted-foreground">{company.id}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Создана</Label>
                <p className="text-sm text-muted-foreground">
                  {new Date(company.createdAt).toLocaleDateString('ru-KZ')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Info */}
        <Card className="rct-card">
          <CardHeader className="rct-card-padding pb-3">
            <CardTitle className="rct-section-title flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Профиль
            </CardTitle>
          </CardHeader>
          <CardContent className="rct-card-padding pt-0 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Имя</Label>
                <p className="text-sm font-medium text-foreground">{user.name}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <p className="text-sm font-medium text-foreground">{user.email}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Роль</Label>
                <Badge variant="outline" className="capitalize">{user.role}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Stats */}
        <Card className="rct-card">
          <CardHeader className="rct-card-padding pb-3">
            <CardTitle className="rct-section-title flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Данные
            </CardTitle>
            <CardDescription>Статистика загруженных данных</CardDescription>
          </CardHeader>
          <CardContent className="rct-card-padding pt-0">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rct-stat-box-slate">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Транзакций</div>
                <div className="text-xl font-bold text-foreground mt-2 tracking-tight">{txnCount}</div>
              </div>
              <div className="rct-stat-box-slate">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Клиентов</div>
                <div className="text-xl font-bold text-foreground mt-2 tracking-tight">{custCount}</div>
              </div>
              <div className="rct-stat-box-slate">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Счетов</div>
                <div className="text-xl font-bold text-foreground mt-2 tracking-tight">{invCount}</div>
              </div>
              <div className="rct-stat-box-slate">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Документов</div>
                <div className="text-xl font-bold text-foreground mt-2 tracking-tight">{docCount}</div>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-destructive">Очистить все данные</p>
                <p className="text-xs text-muted-foreground">Удалить все транзакции, клиентов, счета и документы</p>
              </div>
              <Button variant="destructive" size="sm" onClick={handleClearData}>
                <Trash2 className="h-4 w-4 mr-2" />
                Очистить
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="rct-card">
          <CardHeader className="rct-card-padding pb-3">
            <CardTitle className="rct-section-title flex items-center gap-2">
              <BellRing className="h-5 w-5 text-primary" />
              Уведомления по дедлайнам
            </CardTitle>
            <CardDescription>Email-напоминания за 7, 3 дня и в день дедлайна</CardDescription>
          </CardHeader>
          <CardContent className="rct-card-padding pt-0 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Включить уведомления</p>
                <p className="text-xs text-muted-foreground">Система будет проверять дедлайны договоров</p>
              </div>
              <Button
                size="sm"
                variant={notifEnabled ? 'default' : 'outline'}
                onClick={() => setNotifEnabled((prev) => !prev)}
              >
                {notifEnabled ? 'Включено' : 'Выключено'}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Emails получателей (через запятую)</Label>
              <Input
                placeholder="owner@company.com, finance@company.com"
                value={notifEmails}
                onChange={(e) => setNotifEmails(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Когда отправлять</Label>
              <div className="flex gap-2">
                {[7, 3, 0].map((day) => (
                  <Button
                    key={day}
                    type="button"
                    size="sm"
                    variant={notifDays.includes(day) ? 'default' : 'outline'}
                    onClick={() => toggleDay(day)}
                  >
                    {day === 0 ? 'День в день' : `${day} дней`}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSaveNotifications}>
                Сохранить настройки
              </Button>
              <Button variant="outline" onClick={handleRunReminderCheck} disabled={sendingNow}>
                {sendingNow ? 'Проверка...' : 'Проверить сейчас'}
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Последние отправки</p>
              {recentLogs.length === 0 ? (
                <p className="text-xs text-muted-foreground">Логов пока нет</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {recentLogs.map((log) => (
                    <div key={log.id} className="rounded-md border border-border p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-foreground truncate">{log.documentTitle}</p>
                        <Badge
                          variant="outline"
                          className={
                            log.status === 'sent'
                              ? 'text-teal-600 dark:text-teal-400 border-teal-300/60 dark:border-teal-800/40'
                              : log.status === 'queued'
                                ? 'text-yellow-700 dark:text-yellow-400 border-yellow-300/60 dark:border-yellow-800/40'
                                : 'text-rose-600 dark:text-rose-400 border-rose-300/60 dark:border-rose-800/40'
                          }
                        >
                          {log.status}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-1">
                        {log.recipientEmail} • {log.daysBefore === 0 ? 'день в день' : `${log.daysBefore} дней до дедлайна`}
                      </p>
                      <p className="text-muted-foreground/60">
                        {new Date(log.sentAt).toLocaleString('ru-KZ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* About */}
        <Card className="rct-card">
          <CardContent className="py-6 text-center">
            <p className="rct-subsection-title">BizPulse KZ</p>
            <p className="text-xs text-muted-foreground mt-1">
              Весь бизнес на одном экране за 30 секунд
            </p>
            <p className="text-xs text-muted-foreground/60 mt-2">MVP v1.0 · 2026</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
