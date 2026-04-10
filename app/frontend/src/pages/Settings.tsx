// Chrona — minimal owner profile (MVP shell)

import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Building2, User, Trash2 } from 'lucide-react';
import { getSession, getCurrentUser, getCompany, clearCompanyLocalStorageData } from '@/lib/store';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { clearSupabaseCompanyData } from '@/lib/supabaseClearCompanyData';
import { CHRONA_OWNER_DEMO_SESSION_KEY } from '@/lib/chronaDemoPreview';
import { useState } from 'react';

export default function SettingsPage() {
  const navigate = useNavigate();
  const session = getSession();
  const user = getCurrentUser();
  const company = session ? getCompany(session.companyId) : null;
  const companyDisplayName = session?.companyName ?? company?.name ?? '—';
  const companyDisplayCurrency = company?.currency ?? 'KZT';
  const companyId = session?.companyId ?? '';
  const [clearingData, setClearingData] = useState(false);

  const handleClearData = async () => {
    const supabaseOn = isSupabaseConfigured();
    const msg = supabaseOn
      ? 'Удалить метрики и инсайты в Supabase для этого аккаунта и локальные данные в браузере? Вход и профиль остаются.'
      : 'Удалить только локальные данные в браузере?';

    if (!window.confirm(msg)) return;

    setClearingData(true);
    try {
      let cloudOk = true;
      if (supabaseOn) {
        const cloud = await clearSupabaseCompanyData();
        cloudOk = cloud.ok;
        if (!cloud.ok) {
          toast.error(`Облако: ${cloud.errors.join('; ')}`);
        }
      }

      try {
        sessionStorage.removeItem(CHRONA_OWNER_DEMO_SESSION_KEY);
      } catch {
        /* ignore */
      }

      clearCompanyLocalStorageData(companyId);

      if (supabaseOn && cloudOk) {
        toast.success('Данные очищены');
      } else if (supabaseOn && !cloudOk) {
        toast.warning('Локально очищено; облако — см. ошибку выше');
      } else {
        toast.success('Локальные данные очищены');
      }
      window.location.reload();
    } finally {
      setClearingData(false);
    }
  };

  if (!session || !user) {
    navigate('/');
    return null;
  }

  return (
    <AppLayout>
      <div className="chrona-page max-w-lg space-y-6">
        <div className="chrona-tier-1">
          <h1 className="rct-page-title">Профиль</h1>
          <p className="rct-body-micro mt-1 text-muted-foreground">Аккаунт и сброс данных</p>
        </div>

        <Card className="chrona-surface">
          <CardHeader className="pb-3">
            <CardTitle className="chrona-section-title flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-primary" />
              Компания
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">Название</Label>
              <p className="font-medium text-foreground">{companyDisplayName}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Валюта</Label>
              <p className="font-medium text-foreground">{companyDisplayCurrency}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="chrona-surface">
          <CardHeader className="pb-3">
            <CardTitle className="chrona-section-title flex items-center gap-2 text-base">
              <User className="h-5 w-5 text-primary" />
              Вы
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">Имя</Label>
              <p className="font-medium text-foreground">{user.name}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <p className="font-medium text-foreground">{user.email}</p>
            </div>
            <Badge variant="outline" className="capitalize w-fit">
              {user.role}
            </Badge>
          </CardContent>
        </Card>

        <Card className="chrona-surface border-destructive/20">
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm font-medium text-destructive">Сброс данных</p>
            <p className="text-xs text-muted-foreground">
              Очищает облачные метрики/инсайты (если Supabase подключён), локальные импорты и флаг демо-сценария в этой
              вкладке.
            </p>
            <Button variant="destructive" size="sm" onClick={() => void handleClearData()} disabled={clearingData}>
              <Trash2 className="h-4 w-4 mr-2" />
              {clearingData ? 'Очистка…' : 'Очистить данные'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
