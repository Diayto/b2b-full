// ============================================================
// BizPulse KZ — Login / Register Page
// ============================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { login, register } from '@/lib/store';
import { Building2, Lock, Mail, User, BarChart3, Shield, Zap, TrendingUp } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

const LOGO_URL = 'https://mgx-backend-cdn.metadl.com/generate/images/977836/2026-02-19/f1c5daa3-2ffc-4a82-83e6-9033cda8f303.png';

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCompany, setRegCompany] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      login(loginEmail, loginPassword);
      toast.success('Добро пожаловать!');
      navigate('/dashboard');
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
    setLoading(true);
    try {
      register(regEmail, regPassword, regName, regCompany);
      toast.success('Компания создана! Добро пожаловать!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: <BarChart3 className="h-4 w-4" />, text: 'Дашборд с KPI и трендами выручки' },
    { icon: <TrendingUp className="h-4 w-4" />, text: 'Воронка от маркетинга до оплаты' },
    { icon: <Shield className="h-4 w-4" />, text: 'Сигналы о рисках и просрочках' },
    { icon: <Zap className="h-4 w-4" />, text: 'Рекомендации: что делать прямо сейчас' },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-[45%] relative items-center justify-center p-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,50%,22%)] via-[hsl(220,45%,28%)] to-[hsl(235,40%,32%)] dark:from-[hsl(220,30%,12%)] dark:via-[hsl(225,25%,16%)] dark:to-[hsl(235,20%,18%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.08)_0%,_transparent_60%)]" />

        <div className="relative z-10 text-white max-w-sm">
          <div className="flex items-center gap-3 mb-10">
            <img src={LOGO_URL} alt="BizPulse" className="h-11 w-11 rounded-xl shadow-lg" />
            <div>
              <span className="text-xl font-bold tracking-tight">BizPulse</span>
              <p className="text-xs text-white/50 tracking-wide">Revenue Control Tower</p>
            </div>
          </div>

          <h1 className="text-3xl font-bold leading-tight tracking-tight mb-3">
            Контроль выручки<br />
            <span className="text-white/70 font-normal text-2xl">на одном экране</span>
          </h1>

          <p className="text-sm text-white/60 leading-relaxed mb-8">
            Маркетинг, лиды, сделки, счета, оплаты — вся цепочка денег.
            Видите риски, понимаете причины, действуете быстрее.
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
            <p className="text-xs text-white/30">BizPulse KZ · 2026</p>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex flex-col min-h-screen">
        <div className="flex items-center justify-between p-4 lg:p-6">
          <div className="lg:hidden flex items-center gap-2.5">
            <img src={LOGO_URL} alt="BizPulse" className="h-9 w-9 rounded-xl" />
            <div>
              <span className="text-base font-bold text-foreground">BizPulse</span>
              <p className="text-[10px] text-muted-foreground leading-tight">Revenue Control Tower</p>
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
                      <Button type="submit" className="w-full" disabled={loading}>
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
                    <CardDescription>Зарегистрируйте компанию в BizPulse</CardDescription>
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
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? 'Создание...' : 'Создать аккаунт'}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <p className="text-center text-xs text-muted-foreground mt-8">
              BizPulse KZ © 2026
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
