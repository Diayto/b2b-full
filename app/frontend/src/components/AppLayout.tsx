// ============================================================
// Chrona — Premium App Layout with Sidebar Navigation
// ============================================================

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/ThemeToggle';
import ChronaMark from '@/components/ChronaMark';
import {
  LayoutDashboard, Upload, FileText, Settings, LogOut,
  ChevronLeft, ChevronRight, Menu, ClipboardList,
  Megaphone, DollarSign, Sparkles,
} from 'lucide-react';
import { clearSession, getCurrentUser } from '@/lib/store';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

type NavGroup = { label?: string; items: NavItem[] };
const navGroups: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard className="h-5 w-5 shrink-0" /> },
      { label: 'Marketing', path: '/marketing', icon: <Megaphone className="h-5 w-5 shrink-0" /> },
      { label: 'Sales/Cash', path: '/sales-cash', icon: <DollarSign className="h-5 w-5 shrink-0" /> },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Uploads', path: '/uploads', icon: <Upload className="h-5 w-5 shrink-0" /> },
      { label: 'Documents', path: '/documents', icon: <FileText className="h-5 w-5 shrink-0" /> },
    ],
  },
  {
    items: [
      { label: 'Plan', path: '/plan', icon: <ClipboardList className="h-5 w-5 shrink-0" /> },
      { label: 'Settings', path: '/settings', icon: <Settings className="h-5 w-5 shrink-0" /> },
    ],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const user = getCurrentUser();

  const handleLogout = () => {
    clearSession();
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
          <p className="chrona-sidebar-meta mt-0.5 truncate whitespace-nowrap">Revenue Control OS</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label ?? 'main'} className="space-y-1">
            {group.label && !collapsed && (
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/45">
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
                  className={cn('chrona-nav-item', isActive && 'chrona-nav-item-active')}
                >
                  {item.icon}
                  <span
                    className={cn(
                      'overflow-hidden whitespace-nowrap transition-all duration-250 ease-out',
                      collapsed ? 'max-w-0 opacity-0' : 'max-w-[150px] opacity-100 delay-75'
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
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
            <p className="text-[11px] text-muted-foreground leading-tight">Revenue Control OS</p>
          </div>
          <div className="ml-auto">
            <ThemeToggle collapsed />
          </div>
        </header>

        <header className="hidden lg:flex items-center justify-between px-6 py-3 chrona-topbar">
          <div className="flex items-center gap-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold tracking-tight text-foreground">Chrona Workspace</span>
            <span className="chrona-topbar-chip">Founder Mode</span>
          </div>
          <div />
        </header>

        <main className="chrona-workspace">{children}</main>
      </div>
    </div>
  );
}
