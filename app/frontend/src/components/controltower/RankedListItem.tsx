import { cn } from '@/lib/utils';

export type RankedBarColor = 'emerald' | 'amber' | 'rose' | 'slate' | 'navy';

const barColorMap: Record<RankedBarColor, string> = {
  emerald: 'bg-teal-600/70 dark:bg-teal-500/60',
  amber: 'bg-yellow-600/60 dark:bg-yellow-500/50',
  rose: 'bg-rose-500/70 dark:bg-rose-400/60',
  slate: 'bg-slate-500/50 dark:bg-slate-400/40',
  navy: 'bg-primary/70',
};

export default function RankedListItem(props: {
  label: string;
  sublabel?: string;
  value: string;
  progressPct: number;
  barColor?: RankedBarColor;
  className?: string;
}) {
  const { label, sublabel, value, progressPct, barColor = 'emerald', className } = props;
  const clamped = Math.max(0, Math.min(100, progressPct));
  const barClass = barColorMap[barColor];

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{label}</p>
          {sublabel ? <p className="text-xs text-muted-foreground mt-0.5 truncate">{sublabel}</p> : null}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-foreground whitespace-nowrap">{value}</p>
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-[width]', barClass)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
