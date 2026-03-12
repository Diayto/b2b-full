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
        'bp_marketing_spend', 'bp_documents', 'bp_uploads', 'bp_signals',
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
      <div className="p-4 lg:p-6 space-y-6 max-w-[800px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Настройки</h1>
          <p className="text-sm text-slate-500 mt-1">Управление аккаунтом и компанией</p>
        </div>

        {/* Company Info */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#1E3A5F]" />
              Компания
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-slate-500">Название</Label>
                <p className="text-sm font-medium text-slate-900">{company.name}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Валюта</Label>
                <p className="text-sm font-medium text-slate-900">{company.currency} (₸)</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">ID компании</Label>
                <p className="text-xs font-mono text-slate-500">{company.id}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Создана</Label>
                <p className="text-sm text-slate-600">
                  {new Date(company.createdAt).toLocaleDateString('ru-KZ')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Info */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-5 w-5 text-[#1E3A5F]" />
              Профиль
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-slate-500">Имя</Label>
                <p className="text-sm font-medium text-slate-900">{user.name}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Email</Label>
                <p className="text-sm font-medium text-slate-900">{user.email}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Роль</Label>
                <Badge variant="outline" className="capitalize">{user.role}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Stats */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-5 w-5 text-[#1E3A5F]" />
              Данные
            </CardTitle>
            <CardDescription>Статистика загруженных данных</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">{txnCount}</p>
                <p className="text-xs text-slate-500">Транзакций</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">{custCount}</p>
                <p className="text-xs text-slate-500">Клиентов</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">{invCount}</p>
                <p className="text-xs text-slate-500">Счетов</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">{docCount}</p>
                <p className="text-xs text-slate-500">Документов</p>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600">Очистить все данные</p>
                <p className="text-xs text-slate-500">Удалить все транзакции, клиентов, счета и документы</p>
              </div>
              <Button variant="destructive" size="sm" onClick={handleClearData}>
                <Trash2 className="h-4 w-4 mr-2" />
                Очистить
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BellRing className="h-5 w-5 text-[#1E3A5F]" />
              Уведомления по дедлайнам
            </CardTitle>
            <CardDescription>Email-напоминания за 7, 3 дня и в день дедлайна</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Включить уведомления</p>
                <p className="text-xs text-slate-500">Если включено, система будет проверять дедлайны договоров</p>
              </div>
              <Button
                size="sm"
                variant={notifEnabled ? 'default' : 'outline'}
                onClick={() => setNotifEnabled((prev) => !prev)}
                className={notifEnabled ? 'bg-[#1E3A5F] hover:bg-[#1E3A5F]/90' : ''}
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
                    className={notifDays.includes(day) ? 'bg-[#1E3A5F] hover:bg-[#1E3A5F]/90' : ''}
                  >
                    {day === 0 ? 'День в день' : `${day} дней`}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSaveNotifications} className="bg-[#1E3A5F] hover:bg-[#1E3A5F]/90">
                Сохранить настройки
              </Button>
              <Button variant="outline" onClick={handleRunReminderCheck} disabled={sendingNow}>
                {sendingNow ? 'Проверка...' : 'Проверить сейчас'}
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900">Последние отправки</p>
              {recentLogs.length === 0 ? (
                <p className="text-xs text-slate-500">Логов пока нет</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {recentLogs.map((log) => (
                    <div key={log.id} className="rounded-md border border-slate-200 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-slate-800 truncate">{log.documentTitle}</p>
                        <Badge
                          variant="outline"
                          className={
                            log.status === 'sent'
                              ? 'text-emerald-700 border-emerald-300'
                              : log.status === 'queued'
                                ? 'text-amber-700 border-amber-300'
                                : 'text-red-700 border-red-300'
                          }
                        >
                          {log.status}
                        </Badge>
                      </div>
                      <p className="text-slate-600 mt-1">
                        {log.recipientEmail} • {log.daysBefore === 0 ? 'день в день' : `${log.daysBefore} дней до дедлайна`}
                      </p>
                      <p className="text-slate-400">
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
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-6 text-center">
            <p className="text-sm font-semibold text-slate-900">BizPulse KZ</p>
            <p className="text-xs text-slate-500 mt-1">
              Весь бизнес на одном экране за 30 секунд
            </p>
            <p className="text-xs text-slate-400 mt-2">MVP v1.0 · 2026 · Казахстан 🇰🇿</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
