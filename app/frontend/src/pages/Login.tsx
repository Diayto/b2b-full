// ============================================================
// BizPulse KZ — Login / Register Page
// ============================================================

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useAuth } from '@/components/AuthProvider';
import { signInWithEmailPassword, signUpWithProfile } from '@/lib/supabaseAuth';
import { Building2, Lock, Mail, User, BarChart3, Shield, Target, TrendingUp } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import ChronaMark from '@/components/ChronaMark';

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, supabaseReady } = useAuth();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user && supabaseReady) {
      navigate('/dashboard', { replace: true });
    }
  }, [authLoading, user, supabaseReady, navigate]);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCompany, setRegCompany] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseReady) {
      toast.error('Задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailPassword(loginEmail, loginPassword);
      toast.success('Добро пожаловать!');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regEmail || !regPassword || !regCompany) {
      toast.error('Заполните все поля');
      return;
    }
    if (!supabaseReady) {
      toast.error('Задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local');
      return;
    }
    setLoading(true);
    try {
      const { emailConfirmationRequired } = await signUpWithProfile({
        email: regEmail,
        password: regPassword,
        name: regName,
        companyName: regCompany,
      });
      if (emailConfirmationRequired) {
        toast.success('Аккаунт создан. Подтвердите email по ссылке из письма, затем войдите.');
        return;
      }
      toast.success('Компания создана! Добро пожаловать!');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: <BarChart3 className="h-4 w-4" />, text: 'Сводные метрики: маркетинг, продажи, деньги' },
    { icon: <TrendingUp className="h-4 w-4" />, text: 'Одна цепочка от расхода до кассы' },
    { icon: <Shield className="h-4 w-4" />, text: 'Риски и просрочки в одном срезе' },
    { icon: <Target className="h-4 w-4" />, text: 'Главная проблема периода и следующий шаг' },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-[45%] relative items-center justify-center p-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,50%,22%)] via-[hsl(220,45%,28%)] to-[hsl(235,40%,32%)] dark:from-[hsl(220,30%,12%)] dark:via-[hsl(225,25%,16%)] dark:to-[hsl(235,20%,18%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.08)_0%,_transparent_60%)]" />

        <div className="relative z-10 text-white max-w-sm">
          <div className="flex items-center gap-3 mb-10">
            <ChronaMark className="h-11 w-11 rounded-xl shadow-lg" />
            <div>
              <span className="text-xl font-bold tracking-tight">Chrona</span>
              <p className="text-xs text-white/50 tracking-wide">Revenue Control Tower</p>
            </div>
          </div>

          <h1 className="text-3xl font-bold leading-tight tracking-tight mb-3">
            Контроль выручки<br />
            <span className="text-white/70 font-normal text-2xl">на одном экране</span>
          </h1>

          <p className="text-sm text-white/60 leading-relaxed mb-8">
            Соединяем маркетинг, продажи и денежный поток в одной логике: где узкое место, что сделать дальше, какой эффект
            для бизнеса.
          </p>

          <div className="space-y-3">
            {features.map((f) => (
              <div key={f.text} className="flex items-center gap-3 text-sm">
                <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/10 text-white/80 shrink-0">
                  {f.icon}
                </div>
                <span className="text-white/80">{f.text}</span>
              </div>
            ))}
          </div>

          <div className="mt-12 pt-6 border-t border-white/10">
            <p className="text-xs text-white/30">Chrona · 2026</p>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex flex-col min-h-screen">
        <div className="flex items-center justify-between p-4 lg:p-6">
          <div className="lg:hidden flex items-center gap-2.5">
            <ChronaMark compact className="h-9 w-9 rounded-xl" />
            <div>
              <span className="text-base font-bold text-foreground">Chrona</span>
              <p className="text-[10px] text-muted-foreground leading-tight">Маркетинг · Продажи · Деньги</p>
            </div>
          </div>
          <div className="hidden lg:block" />
          <ThemeToggle collapsed />
        </div>

        <div className="flex-1 flex items-center justify-center px-6 pb-8">
          <div className="w-full max-w-[400px]">
            <div className="mb-8">
              <h2 className="text-xl font-bold text-foreground tracking-tight">Добро пожаловать</h2>
              <p className="text-sm text-muted-foreground mt-1">Войдите или создайте аккаунт для начала работы</p>
            </div>

            {!supabaseReady && (
              <Alert variant="destructive" className="mb-6">
                <AlertTitle>Нет подключения к Supabase</AlertTitle>
                <AlertDescription>
                  Скопируйте <span className="font-mono">.env.example</span> в{' '}
                  <span className="font-mono">.env.local</span> и укажите{' '}
                  <span className="font-mono">VITE_SUPABASE_URL</span> и{' '}
                  <span className="font-mono">VITE_SUPABASE_ANON_KEY</span>. Выполните SQL-миграцию из{' '}
                  <span className="font-mono">supabase/migrations/</span> в консоли проекта Supabase.
                </AlertDescription>
              </Alert>
            )}

            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Вход</TabsTrigger>
                <TabsTrigger value="register">Регистрация</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <Card className="border-border bg-card shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg text-card-foreground">Вход в систему</CardTitle>
                    <CardDescription>Введите email и пароль</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="login-email">Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="login-email"
                            type="email"
                            placeholder="admin@company.kz"
                            className="pl-10"
                            value={loginEmail}
                            onChange={e => setLoginEmail(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="login-password">Пароль</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="login-password"
                            type="password"
                            placeholder="••••••••"
                            className="pl-10"
                            value={loginPassword}
                            onChange={e => setLoginPassword(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <Button type="submit" className="w-full" disabled={loading || authLoading || !supabaseReady}>
                        {loading ? 'Вход...' : 'Войти'}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="register">
                <Card className="border-border bg-card shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg text-card-foreground">Создать аккаунт</CardTitle>
                    <CardDescription>Зарегистрируйте компанию в Chrona</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="reg-name">Ваше имя</Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="reg-name"
                            placeholder="Алмас Касымов"
                            className="pl-10"
                            value={regName}
                            onChange={e => setRegName(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-email">Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="reg-email"
                            type="email"
                            placeholder="admin@company.kz"
                            className="pl-10"
                            value={regEmail}
                            onChange={e => setRegEmail(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-password">Пароль</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="reg-password"
                            type="password"
                            placeholder="Минимум 6 символов"
                            className="pl-10"
                            value={regPassword}
                            onChange={e => setRegPassword(e.target.value)}
                            required
                            minLength={6}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-company">Название компании</Label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="reg-company"
                            placeholder='ТОО "Моя Компания"'
                            className="pl-10"
                            value={regCompany}
                            onChange={e => setRegCompany(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <Button type="submit" className="w-full" disabled={loading || authLoading || !supabaseReady}>
                        {loading ? 'Создание...' : 'Создать аккаунт'}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <p className="text-center text-xs text-muted-foreground mt-8">
              Chrona © 2026
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
