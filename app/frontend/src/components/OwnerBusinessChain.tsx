import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProcessedMetricsRow } from '@/lib/supabaseMetrics';
import type { InsightRuleId } from '@/lib/insightEngine';
import { chainBottleneckStepId } from '@/lib/chronaSourceCredibility';
import { formatKZT } from '@/lib/metrics';

type Props = {
  row: ProcessedMetricsRow;
  rule: InsightRuleId | null;
};

const steps = [
  { id: 'attention' as const, label: 'Внимание', sub: 'канал' },
  { id: 'leads' as const, label: 'Лиды', sub: 'заявки' },
  { id: 'deals' as const, label: 'Сделки', sub: 'закрытие' },
  { id: 'money' as const, label: 'Деньги', sub: 'кэш' },
];

export default function OwnerBusinessChain({ row, rule }: Props) {
  const raw = (row.raw_data ?? {}) as Record<string, unknown>;
  const weak = chainBottleneckStepId(rule, raw);

  const spend = formatKZT(Number(row.spend) || 0);
  const leads = String(Math.round(Number(row.leads) || 0));
  const deals = String(Math.round(Number(row.deals) || 0));
  const money = formatKZT(Number(row.net_cash) || 0);

  const values: Record<(typeof steps)[number]['id'], string> = {
    attention: spend,
    leads,
    deals,
    money,
  };

  return (
    <div className="rounded-xl border border-border/70 bg-card/40 p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Цепочка периода</p>
      <div className="flex flex-wrap items-stretch gap-1 sm:gap-0 sm:flex-nowrap">
        {steps.map((s, i) => {
          const isWeak = weak === s.id;
          return (
            <div key={s.id} className="flex items-center min-w-0 flex-1 sm:flex-1">
              {i > 0 ? (
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 hidden sm:block mx-0.5" />
              ) : null}
              <div
                className={cn(
                  'rounded-lg border px-3 py-2.5 flex-1 min-w-[5.5rem] transition-colors',
                  isWeak
                    ? 'border-amber-500/60 bg-amber-500/10 dark:bg-amber-500/15'
                    : 'border-border/60 bg-background/60',
                )}
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className="text-sm font-semibold tabular-nums text-foreground truncate">{values[s.id]}</p>
                <p className="text-[10px] text-muted-foreground">{s.sub}</p>
                {isWeak ? (
                  <p className="text-[10px] font-medium text-amber-800 dark:text-amber-200 mt-1">узкое место</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Слева направо — как входы превращаются в деньги; подсветка показывает этап, где система видит главный разрыв.
      </p>
    </div>
  );
}
