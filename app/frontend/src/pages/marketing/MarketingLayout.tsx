import { Outlet, NavLink, useLocation, Navigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import AppLayout from '@/components/AppLayout';
import { isAcceleratorDemoMode } from '@/lib/chronaDemoPreview';

export default function MarketingLayout() {
  const location = useLocation();
  const isMain = location.pathname === '/marketing';
  const accelerator = isAcceleratorDemoMode();

  if (accelerator && location.pathname !== '/marketing') {
    return <Navigate to="/marketing" replace />;
  }

  return (
    <AppLayout>
      <div className="flex flex-col min-h-full">
        <header className="chrona-tier-1 mb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="rct-page-title">Маркетинг и выручка</h1>
              <p className="rct-body-micro mt-1 text-muted-foreground">
                Каналы и воронка в одной логике с продажами и деньгами на главном экране.
              </p>
            </div>
          </div>
        </header>

        {!accelerator ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/50 pb-3 mb-4 text-xs">
            <NavLink
              to="/marketing"
              className={cn(
                'font-medium pb-0.5 border-b-2 transition-colors',
                isMain ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground',
              )}
            >
              Обзор
            </NavLink>
            <NavLink
              to="/marketing/reports"
              className={cn(
                'text-muted-foreground hover:text-foreground pb-0.5 border-b-2 border-transparent',
                location.pathname.startsWith('/marketing/reports') && 'text-foreground border-primary font-medium',
              )}
            >
              Отчёты
            </NavLink>
            <NavLink
              to="/marketing/data"
              className={cn(
                'text-muted-foreground hover:text-foreground pb-0.5 border-b-2 border-transparent',
                location.pathname.startsWith('/marketing/data') && 'text-foreground border-primary font-medium',
              )}
            >
              Данные и Instagram
            </NavLink>
          </div>
        ) : null}

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </AppLayout>
  );
}
