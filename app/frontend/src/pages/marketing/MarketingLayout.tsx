import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import AppLayout from '@/components/AppLayout';

const marketingTabs = [
  { path: '/marketing', label: 'Дашборд' },
  { path: '/marketing/reports', label: 'Отчёты' },
  { path: '/marketing/data', label: 'Данные' },
];

export default function MarketingLayout() {
  const location = useLocation();

  return (
    <AppLayout>
      <div className="flex flex-col min-h-full">
        <header className="chrona-tier-1 mb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="rct-page-title">Marketing Workspace</h1>
              <p className="rct-body-micro mt-1">Где внимание превращается в выручку</p>
            </div>
            <span className="chrona-topbar-chip">Chrona Marketing</span>
          </div>
        </header>

        <Tabs value={location.pathname} className="mb-4">
          <TabsList className="justify-start h-auto bg-transparent px-0 gap-2">
            {marketingTabs.map((tab) => (
              <TabsTrigger
                key={tab.path}
                value={tab.path}
                className={cn(
                  'rounded-full border border-border/70 bg-card/60 px-4 py-2.5',
                  'text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary/40 data-[state=active]:bg-primary/10'
                )}
                asChild
              >
                <NavLink to={tab.path}>{tab.label}</NavLink>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </AppLayout>
  );
}
