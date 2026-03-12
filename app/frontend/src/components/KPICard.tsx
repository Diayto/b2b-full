// ============================================================
// BizPulse KZ — KPI Card Component
// ============================================================

import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: number; // percentage change
  icon?: React.ReactNode;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}

export default function KPICard({ title, value, subtitle, trend, icon, variant = 'default' }: KPICardProps) {
  const variantStyles = {
    default: 'border-slate-200',
    success: 'border-emerald-200 bg-emerald-50/50',
    danger: 'border-red-200 bg-red-50/50',
    warning: 'border-amber-200 bg-amber-50/50',
  };

  const trendColor = trend === undefined || trend === 0
    ? 'text-slate-400'
    : trend > 0
      ? 'text-emerald-600'
      : 'text-red-600';

  const TrendIcon = trend === undefined || trend === 0
    ? Minus
    : trend > 0
      ? TrendingUp
      : TrendingDown;

  return (
    <div className={cn(
      'bg-white rounded-xl border p-5 shadow-sm hover:shadow-md transition-shadow',
      variantStyles[variant]
    )}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        {icon && <div className="text-slate-400">{icon}</div>}
      </div>
      <p className="text-2xl font-bold text-slate-900 mb-1">{value}</p>
      <div className="flex items-center gap-2">
        {trend !== undefined && (
          <span className={cn('flex items-center gap-1 text-xs font-medium', trendColor)}>
            <TrendIcon className="h-3 w-3" />
            {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
          </span>
        )}
        {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
      </div>
    </div>
  );
}