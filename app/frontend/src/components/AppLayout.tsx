// ============================================================
// Chrona — Owner MVP shell (4 surfaces only)
// ============================================================

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/ThemeToggle';
import ChronaMark from '@/components/ChronaMark';
import {
  LayoutDashboard,
  Upload,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  Lightbulb,
  User,
} from 'lucide-react';
import { clearSession, getCurrentUser } from '@/lib/store';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { signOutSupabase } from '@/lib/supabaseAuth';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

/** Visible product: Data → Dashboard → Breakdown → Profile */
const ownerNav: NavItem[] = [
  { label: 'Главный экран', path: '/dashboard', icon: <LayoutDashboard className="h-5 w-5 shrink-0" /> },
  { label: 'Данные', path: '/uploads', icon: <Upload className="h-5 w-5 shrink-0" /> },
  { label: 'Разбор', path: '/insights', icon: <Lightbulb className="h-5 w-5 shrink-0" /> },
  { label: 'Профиль', path: '/settings', icon: <User className="h-5 w-5 shrink-0" /> },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const user = getCurrentUser();

  const handleLogout = async () => {
    try {
      if (isSupabaseConfigured()) {
        await signOutSupabase();
      } else {
        clearSession();
      }
    } catch {
      clearSession();
    }
    navigate('/');
  };
  const userInitials = (user?.name || user?.email || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <ChronaMark compact className="h-8 w-8 min-h-8 min-w-8 shrink-0 flex-none rounded-xl" />
        <div
          className={cn(
            'min-w-0 overflow-hidden transition-all duration-300 ease-out',
            collapsed ? 'max-w-0 opacity-0 -translate-x-1' : 'max-w-[170px] opacity-100 translate-x-0 delay-75'
          )}
        >
          <h1 className="text-lg chrona-sidebar-brand truncate whitespace-nowrap">Chrona</h1>
          <p className="chrona-sidebar-meta mt-0.5 truncate whitespace-nowrap">Одна картина · решение</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {!collapsed && (
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">Навигация</p>
        )}
        {ownerNav.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path === '/uploads' && location.pathname.startsWith('/uploads'));
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={cn('chrona-nav-item', isActive && 'chrona-nav-item-active')}
            >
              {item.icon}
              <span
                className={cn(
                  'overflow-hidden whitespace-nowrap transition-all duration-250 ease-out',
                  collapsed ? 'max-w-0 opacity-0' : 'max-w-[170px] opacity-100 delay-75',
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <div className="mb-2">
          <ThemeToggle collapsed={collapsed} />
        </div>
        {user && (
          <div
            className={cn(
              'mb-2 w-full transition-all duration-300 ease-out',
              collapsed
                ? 'flex justify-center'
                : 'rounded-xl bg-white/5 border border-white/10 px-3 py-2'
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 min-h-8 min-w-8 shrink-0 flex-none rounded-full bg-white/15 border border-white/20 text-white text-xs font-semibold flex items-center justify-center">
                {userInitials}
              </div>
              <div
                className={cn(
                  'overflow-hidden transition-all duration-300 ease-out',
                  collapsed ? 'max-w-0 opacity-0 -translate-x-1' : 'max-w-[170px] opacity-100 translate-x-0 delay-75'
                )}
              >
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                <p className="text-xs text-white/60 truncate">{user.email}</p>
                <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-white/10 text-white/80 capitalize">
                  {user.role}
                </span>
              </div>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-white/70 hover:text-rose-200 hover:bg-rose-500/15"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span>Выйти</span>}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="chrona-app-shell">
      <aside
        className={cn(
          'hidden lg:flex flex-col chrona-sidebar transition-all duration-300 relative',
          collapsed ? 'w-[72px]' : 'w-[272px]'
        )}
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-8 bg-background border border-border rounded-full p-1.5 shadow-md hover:bg-accent transition-colors text-foreground"
          aria-label={collapsed ? 'Развернуть сайдбар' : 'Свернуть сайдбар'}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[272px] chrona-sidebar z-50 shadow-xl">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="chrona-canvas">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3.5 chrona-topbar">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} className="rounded-lg">
            <Menu className="h-5 w-5 text-muted-foreground" />
          </Button>
          <ChronaMark compact className="h-8 w-8 rounded-lg" />
          <div>
            <span className="font-bold text-foreground text-base">Chrona</span>
            <p className="text-[11px] text-muted-foreground leading-tight">Одна картина · решение</p>
          </div>
          <div className="ml-auto">
            <ThemeToggle collapsed />
          </div>
        </header>

        <main className="chrona-workspace">{children}</main>
      </div>
    </div>
  );
}
