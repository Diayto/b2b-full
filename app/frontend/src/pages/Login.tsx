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
import { Building2, Lock, Mail, User } from 'lucide-react';

const HERO_URL = 'https://mgx-backend-cdn.metadl.com/generate/images/977836/2026-02-19/7e81c5ca-7010-4533-a0e3-18ead7000436.png';
const LOGO_URL = 'https://mgx-backend-cdn.metadl.com/generate/images/977836/2026-02-19/f1c5daa3-2ffc-4a82-83e6-9033cda8f303.png';

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form
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

  return (
    <div className="min-h-screen flex">
      {/* Left - Hero */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#1E3A5F] items-center justify-center p-12">
        <div className="absolute inset-0 opacity-20">
          <img src={HERO_URL} alt="" className="w-full h-full object-cover" />
        </div>
        <div className="relative z-10 text-white max-w-md">
          <img src={LOGO_URL} alt="BizPulse" className="h-16 w-16 rounded-2xl mb-8 shadow-lg" />
          <h1 className="text-4xl font-bold mb-4">
            Весь бизнес<br />на одном экране
          </h1>
          <p className="text-lg text-white/80 mb-6">
            Контролируйте финансы, отслеживайте метрики и получайте сигналы о рисках — за 30 секунд.
          </p>
          <div className="space-y-3">
            {[
              'Финансовый дашборд с KPI',
              'Инвесторские метрики (LTV, CAC)',
              'Умные сигналы о рисках',
              'Загрузка Excel/CSV/PDF/DOCX',
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-white/90">{feature}</span>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-white/50">Сделано для казахстанского SMB 🇰🇿</p>
        </div>
      </div>

      {/* Right - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-[#F8FAFC]">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <img src={LOGO_URL} alt="BizPulse" className="h-10 w-10 rounded-xl" />
            <div>
              <h1 className="text-xl font-bold text-slate-900">BizPulse</h1>
              <p className="text-xs text-slate-500">Весь бизнес на одном экране</p>
            </div>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Вход</TabsTrigger>
              <TabsTrigger value="register">Регистрация</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">Вход в систему</CardTitle>
                  <CardDescription>Введите данные для входа в BizPulse</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
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
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
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
                    <Button
                      type="submit"
                      className="w-full bg-[#1E3A5F] hover:bg-[#1E3A5F]/90"
                      disabled={loading}
                    >
                      {loading ? 'Вход...' : 'Войти'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="register">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">Создать аккаунт</CardTitle>
                  <CardDescription>Зарегистрируйте компанию в BizPulse</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reg-name">Ваше имя</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
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
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
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
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
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
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
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
                    <Button
                      type="submit"
                      className="w-full bg-[#1E3A5F] hover:bg-[#1E3A5F]/90"
                      disabled={loading}
                    >
                      {loading ? 'Создание...' : 'Создать аккаунт'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <p className="text-center text-xs text-slate-400 mt-6">
            BizPulse KZ © 2026 · Для казахстанского бизнеса
          </p>
        </div>
      </div>
    </div>
  );
}