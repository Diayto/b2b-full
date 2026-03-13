// ============================================================
// BizPulse KZ — App Layout with Sidebar Navigation
// ============================================================

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, Upload, FileText, Settings, LogOut,
  ChevronLeft, ChevronRight, Building2, Menu, ClipboardList,
  Megaphone,  // ← добавлена иконка для Маркетинга
} from 'lucide-react';
import { clearSession, getCurrentUser, getCompany } from '@/lib/store';

const LOGO_URL = 'https://mgx-backend-cdn.metadl.com/generate/images/977836/2026-02-19/f1c5daa3-2ffc-4a82-83e6-9033cda8f303.png';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: 'Дашборд', path: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: 'Загрузки', path: '/uploads', icon: <Upload className="h-5 w-5" /> },
  { label: 'Документы', path: '/documents', icon: <FileText className="h-5 w-5" /> },
  { label: 'План', path: '/plan', icon: <ClipboardList className="h-5 w-5" /> },
  { label: 'Настройки', path: '/settings', icon: <Settings className="h-5 w-5" /> },
  // Новый пункт — Маркетинг
  { label: 'Маркетинг', path: '/marketing', icon: <Megaphone className="h-5 w-5" /> },
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
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-200">
        <img src={LOGO_URL} alt="BizPulse" className="h-8 w-8 rounded-lg" />
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 truncate">BizPulse</h1>
          </div>
        )}
      </div>

      {/* Company */}
      {company && !collapsed && (
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{company.name}</span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          // Улучшаем активное состояние для /marketing/* (чтобы подсвечивалось на всех вложенных страницах)
          const isActive = location.pathname === item.path || 
                          (item.path === '/marketing' && location.pathname.startsWith('/marketing'));
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-[#1E3A5F] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User & Logout */}
      <div className="px-3 py-4 border-t border-slate-200">
        {user && !collapsed && (
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700 capitalize">
              {user.role}
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-slate-500 hover:text-red-600 hover:bg-red-50"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span>Выйти</span>}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#F8FAFC]">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col bg-white border-r border-slate-200 transition-all duration-300 relative',
          collapsed ? 'w-[72px]' : 'w-[260px]'
        )}
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-8 bg-white border border-slate-200 rounded-full p-1 shadow-sm hover:bg-slate-50"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[260px] bg-white z-50 shadow-xl">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <img src={LOGO_URL} alt="BizPulse" className="h-7 w-7 rounded-lg" />
          <span className="font-bold text-slate-900">BizPulse</span>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}