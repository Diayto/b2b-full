// ============================================================
// BizPulse KZ — App Layout with Sidebar Navigation
// ============================================================

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/ThemeToggle';
import {
  LayoutDashboard, Upload, FileText, Settings, LogOut,
  ChevronLeft, ChevronRight, Building2, Menu, ClipboardList,
  Megaphone,
  DollarSign,
} from 'lucide-react';
import { clearSession, getCurrentUser, getCompany } from '@/lib/store';

const LOGO_URL = 'https://mgx-backend-cdn.metadl.com/generate/images/977836/2026-02-19/f1c5daa3-2ffc-4a82-83e6-9033cda8f303.png';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

type NavGroup = { label?: string; items: NavItem[] };
const navGroups: NavGroup[] = [
  {
    items: [
      { label: 'Дашборд', path: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
      { label: 'Маркетинг', path: '/marketing', icon: <Megaphone className="h-5 w-5" /> },
      { label: 'Продажи и Cash', path: '/sales-cash', icon: <DollarSign className="h-5 w-5" /> },
    ],
  },
  {
    label: 'Данные',
    items: [
      { label: 'Загрузки', path: '/uploads', icon: <Upload className="h-5 w-5" /> },
      { label: 'Документы', path: '/documents', icon: <FileText className="h-5 w-5" /> },
    ],
  },
  {
    items: [
      { label: 'План', path: '/plan', icon: <ClipboardList className="h-5 w-5" /> },
      { label: 'Настройки', path: '/settings', icon: <Settings className="h-5 w-5" /> },
    ],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const user = getCurrentUser();
  const company = user ? getCompany(user.companyId) : null;

  const handleLogout = () => {
    clearSession();
    navigate('/');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
        <img src={LOGO_URL} alt="BizPulse" className="h-8 w-8 rounded-lg" />
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">BizPulse</h1>
          </div>
        )}
      </div>

      {/* Company */}
      {company && !collapsed && (
        <div className="px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{company.name}</span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label ?? 'main'} className="space-y-1">
            {group.label && !collapsed && (
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const isActive =
                location.pathname === item.path ||
                (item.path === '/marketing' && location.pathname.startsWith('/marketing'));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border-l-[3px]',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm border-l-primary'
                      : 'border-l-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  {item.icon}
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Theme + User + Logout */}
      <div className="px-3 py-4 border-t border-border">
        <div className="mb-2">
          <ThemeToggle collapsed={collapsed} />
        </div>
        {user && !collapsed && (
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400 capitalize">
              {user.role}
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span>Выйти</span>}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col bg-card border-r border-border transition-all duration-300 relative',
          collapsed ? 'w-[72px]' : 'w-[260px]'
        )}
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-8 bg-card border border-border rounded-full p-1 shadow-sm hover:bg-accent transition-colors"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[260px] bg-card z-50 shadow-xl">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3.5 bg-card border-b border-border shadow-sm">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} className="rounded-lg">
            <Menu className="h-5 w-5 text-muted-foreground" />
          </Button>
          <img src={LOGO_URL} alt="BizPulse" className="h-8 w-8 rounded-lg shadow-sm" />
          <div>
            <span className="font-bold text-foreground text-base">BizPulse</span>
            <p className="text-[11px] text-muted-foreground leading-tight">Контроль выручки</p>
          </div>
          <div className="ml-auto">
            <ThemeToggle collapsed />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
