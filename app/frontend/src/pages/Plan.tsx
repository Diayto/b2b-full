import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  high: 'text-red-700 border-red-300',
  medium: 'text-amber-700 border-amber-300',
  low: 'text-blue-700 border-blue-300',
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
      <div className="p-4 lg:p-6 space-y-6 max-w-[1200px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">План на следующий месяц</h1>
          <p className="text-sm text-slate-500 mt-1">
            Прогноз и конкретный план действий по данным компании за период {plan.period}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">Прогноз выручки</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-600">{formatKZT(plan.forecastRevenue)}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">Прогноз расходов</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">{formatKZT(plan.forecastExpenses)}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">Прогноз прибыли</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${plan.forecastProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatKZT(plan.forecastProfit)}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Сильные стороны</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              {plan.strengths.length > 0 ? plan.strengths.map((item) => (
                <p key={item}>• {item}</p>
              )) : <p>Пока недостаточно данных для вывода сильных сторон.</p>}
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Слабые места</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              {plan.weaknesses.length > 0 ? plan.weaknesses.map((item) => (
                <p key={item}>• {item}</p>
              )) : <p>Критичных слабых зон не выявлено по текущим данным.</p>}
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Риски</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              {plan.risks.length > 0 ? plan.risks.map((item) => (
                <p key={item}>• {item}</p>
              )) : <p>Критичных рисков на следующий месяц не выявлено.</p>}
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">План действий</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {plan.actions.map((action) => (
              <div key={action.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant="outline">{areaLabel[action.area]}</Badge>
                  <Badge variant="outline" className={priorityClass[action.priority]}>
                    {priorityLabel[action.priority]}
                  </Badge>
                </div>
                <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                <p className="text-sm text-slate-600 mt-1">{action.rationale}</p>
                <p className="text-xs text-slate-500 mt-2">Цель: {action.target}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
