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
      <div className="flex flex-col min-h-full bg-background">
        <header className="border-b border-border bg-card sticky top-0 z-10">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-bold text-foreground">Маркетинг</h1>
          </div>
        </header>

        <Tabs value={location.pathname} className="border-b border-border bg-card">
          <TabsList className="justify-start rounded-none h-auto bg-transparent px-6">
            {marketingTabs.map((tab) => (
              <TabsTrigger
                key={tab.path}
                value={tab.path}
                className={cn(
                  'rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent pb-3 px-6',
                  'text-muted-foreground data-[state=active]:text-primary data-[state=active]:font-medium'
                )}
                asChild
              >
                <NavLink to={tab.path}>{tab.label}</NavLink>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <main className="flex-1 px-6 py-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </AppLayout>
  );
}
