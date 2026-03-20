import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import { getSession, getTransactions, getCustomers, getInvoices, getMarketingSpend, getDocuments } from '@/lib/store';
import { formatKZT, generateMonthlyBusinessPlan } from '@/lib/metrics';
import type { PlanArea, PlanPriority } from '@/lib/types';

const areaLabel: Record<PlanArea, string> = {
  revenue: 'Выручка',
  cost: 'Расходы',
  cashflow: 'Cashflow',
  operations: 'Операции',
};

const priorityLabel: Record<PlanPriority, string> = {
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
};

const priorityClass: Record<PlanPriority, string> = {
  high: 'text-rose-600 dark:text-rose-400 border-rose-300/60 dark:border-rose-800/40',
  medium: 'text-yellow-700 dark:text-yellow-400 border-yellow-300/60 dark:border-yellow-800/40',
  low: 'text-primary border-primary/30',
};

export default function PlanPage() {
  const navigate = useNavigate();
  const session = getSession();
  const companyId = session?.companyId || '';

  const transactions = useMemo(() => getTransactions(companyId), [companyId]);
  const customers = useMemo(() => getCustomers(companyId), [companyId]);
  const invoices = useMemo(() => getInvoices(companyId), [companyId]);
  const marketingSpend = useMemo(() => getMarketingSpend(companyId), [companyId]);
  const documents = useMemo(() => getDocuments(companyId), [companyId]);

  const plan = useMemo(
    () => generateMonthlyBusinessPlan(transactions, customers, invoices, marketingSpend, documents),
    [transactions, customers, invoices, marketingSpend, documents]
  );

  if (!session) {
    navigate('/');
    return null;
  }

  return (
    <AppLayout>
      <div className="chrona-page">
        <div className="chrona-tier-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="rct-page-title">Strategic Plan</h1>
              <p className="rct-body-micro mt-1">
                Прогноз и план действий за период {plan.period}
              </p>
            </div>
            <span className="chrona-topbar-chip">Planning Surface</span>
          </div>
        </div>

        {/* Forecast KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="chrona-surface">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Прогноз выручки</div>
            <div className="text-xl font-bold mt-2 tracking-tight text-foreground">{formatKZT(plan.forecastRevenue)}</div>
          </div>
          <div className="chrona-surface">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Прогноз расходов</div>
            <div className="text-xl font-bold mt-2 tracking-tight text-foreground">{formatKZT(plan.forecastExpenses)}</div>
          </div>
          <div className="chrona-surface">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Прогноз прибыли</div>
            <div className="text-xl font-bold mt-2 tracking-tight text-foreground">{formatKZT(plan.forecastProfit)}</div>
          </div>
        </div>

        {/* SWOT cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="chrona-surface space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-teal-500 dark:bg-teal-400 shrink-0" />
              <h3 className="chrona-section-title">Сильные стороны</h3>
            </div>
            {plan.strengths.length > 0 ? plan.strengths.map((item) => (
              <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-teal-400 dark:bg-teal-500 shrink-0" />
                {item}
              </div>
            )) : <p className="text-sm text-muted-foreground">Пока недостаточно данных.</p>}
          </div>

          <div className="chrona-surface space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-yellow-500 dark:bg-yellow-400 shrink-0" />
              <h3 className="chrona-section-title">Слабые места</h3>
            </div>
            {plan.weaknesses.length > 0 ? plan.weaknesses.map((item) => (
              <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-yellow-400 dark:bg-yellow-500 shrink-0" />
                {item}
              </div>
            )) : <p className="text-sm text-muted-foreground">Критичных слабых зон не выявлено.</p>}
          </div>

          <div className="chrona-surface space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-rose-500 dark:bg-rose-400 shrink-0" />
              <h3 className="chrona-section-title">Риски</h3>
            </div>
            {plan.risks.length > 0 ? plan.risks.map((item) => (
              <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-rose-400 dark:bg-rose-500 shrink-0" />
                {item}
              </div>
            )) : <p className="text-sm text-muted-foreground">Критичных рисков не выявлено.</p>}
          </div>
        </div>

        {/* Action plan */}
        <div className="chrona-hero space-y-4">
          <h2 className="chrona-section-title">План действий</h2>
          <div className="space-y-3">
            {plan.actions.map((action) => (
              <div key={action.id} className="chrona-muted-surface transition-colors hover:bg-muted/50">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs font-medium text-muted-foreground">
                    {areaLabel[action.area]}
                  </Badge>
                  <Badge variant="outline" className={`text-xs font-medium ${priorityClass[action.priority]}`}>
                    {priorityLabel[action.priority]}
                  </Badge>
                </div>
                <p className="rct-subsection-title">{action.title}</p>
                <p className="text-sm text-muted-foreground mt-1 leading-snug">{action.rationale}</p>
                <p className="text-xs text-muted-foreground/70 mt-2 font-medium">Цель: {action.target}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
