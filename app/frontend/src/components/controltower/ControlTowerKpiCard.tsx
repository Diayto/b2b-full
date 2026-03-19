import type React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, MoreHorizontal } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type KpiStatus = 'default' | 'success' | 'warning' | 'danger';

export interface KpiDelta {
  value: string;
  direction: 'up' | 'down' | 'flat';
  sentiment: 'positive' | 'negative' | 'neutral';
}

export interface KpiDetail {
  what: string;
  why: string;
}

function Sparkline({ data, stroke }: { data: number[]; stroke: string }) {
  const cleaned = data.filter((v) => Number.isFinite(v));
  if (cleaned.length < 2) return null;

  const min = Math.min(...cleaned);
  const max = Math.max(...cleaned);
  const span = max - min || 1;

  const width = 90;
  const height = 28;
  const pad = 1;

  const points = cleaned.map((v, i) => {
    const x = pad + (i * (width - pad * 2)) / (cleaned.length - 1);
    const y = pad + (height - pad * 2) * (1 - (v - min) / span);
    return { x, y };
  });

  const lineD = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');

  const fillD = `${lineD} L ${points[points.length - 1].x.toFixed(2)} ${height} L ${points[0].x.toFixed(2)} ${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={`spark-${stroke.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.2" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#spark-${stroke.replace('#', '')})`} />
      <path d={lineD} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeltaBadge({ delta }: { delta: KpiDelta }) {
  const Icon = delta.direction === 'up' ? TrendingUp : delta.direction === 'down' ? TrendingDown : Minus;

  const sentimentClass =
    delta.sentiment === 'positive'
      ? 'text-teal-600 dark:text-teal-400'
      : delta.sentiment === 'negative'
        ? 'text-rose-500 dark:text-rose-400'
        : 'text-muted-foreground';

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', sentimentClass)}>
      <Icon className="h-3 w-3" />
      {delta.value}
    </span>
  );
}

function DetailPopover({ detail }: { detail: KpiDetail }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center justify-center rounded-md h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Подробнее"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" side="bottom" align="end">
        <div className="space-y-2">
          <p className="rct-tooltip-title">{detail.what}</p>
          <p className="rct-tooltip-body">
            <span className="font-medium text-foreground">Почему важно:</span> {detail.why}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const statusConfig: Record<KpiStatus, { border: string; dot: string; stroke: string }> = {
  default: {
    border: 'border-border',
    dot: 'bg-muted-foreground',
    stroke: '#7B8699',
  },
  success: {
    border: 'border-teal-200/50 dark:border-teal-900/40',
    dot: 'bg-teal-600 dark:bg-teal-400',
    stroke: '#5A9E94',
  },
  warning: {
    border: 'border-yellow-200/50 dark:border-yellow-900/30',
    dot: 'bg-yellow-600 dark:bg-yellow-400',
    stroke: '#A89768',
  },
  danger: {
    border: 'border-rose-200/50 dark:border-rose-900/30',
    dot: 'bg-rose-500 dark:bg-rose-400',
    stroke: '#B86B7A',
  },
};

export default function ControlTowerKpiCard(props: {
  title: string;
  value: string;
  delta?: KpiDelta;
  subtitle?: string;
  icon?: React.ReactNode;
  status?: KpiStatus;
  sparkline?: number[];
  detail?: KpiDetail;
}) {
  const { title, value, delta, subtitle, icon, status = 'default', sparkline, detail } = props;
  const cfg = statusConfig[status];

  return (
    <div
      className={cn(
        'rct-card px-5 py-4 relative overflow-hidden group',
        'hover:shadow-[0_2px_8px_-2px_rgb(0_0_0/0.08)]',
        cfg.border
      )}
    >
      {status !== 'default' && (
        <span className={cn('absolute top-3.5 left-3.5 h-1.5 w-1.5 rounded-full', cfg.dot)} />
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground tracking-wide truncate">{title}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="rct-kpi-value">{value}</p>
            {delta && <DeltaBadge delta={delta} />}
          </div>
          {subtitle ? <p className="mt-1.5 rct-kpi-meta">{subtitle}</p> : null}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {detail ? (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <DetailPopover detail={detail} />
            </div>
          ) : icon ? (
            <div className="text-muted-foreground">{icon}</div>
          ) : null}
        </div>
      </div>

      {sparkline && sparkline.length > 1 ? (
        <div className="mt-2.5 flex justify-end">
          <Sparkline data={sparkline} stroke={cfg.stroke} />
        </div>
      ) : null}
    </div>
  );
}
