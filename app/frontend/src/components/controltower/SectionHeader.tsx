import { Badge } from '@/components/ui/badge';
import MetricHelpIcon from './MetricHelpIcon';
import type { MetricHelpKey } from '@/lib/metricHelp';
import { cn } from '@/lib/utils';

export interface SectionHeaderProps {
  title: string;
  helpKey?: MetricHelpKey;
  badge?: string;
  description?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  trailing?: React.ReactNode;
}

export default function SectionHeader({
  title,
  helpKey,
  badge,
  description,
  className,
  size = 'md',
  trailing,
}: SectionHeaderProps) {
  const titleClass =
    size === 'sm'
      ? 'rct-subsection-title'
      : size === 'lg'
        ? 'text-lg font-semibold'
        : 'rct-section-title';

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className={cn(titleClass, 'leading-tight')}>{title}</h3>
        {helpKey ? <MetricHelpIcon helpKey={helpKey} size={size === 'sm' ? 'sm' : 'md'} /> : null}
        {badge ? (
          <Badge variant="outline" className="text-xs font-medium">
            {badge}
          </Badge>
        ) : null}
        {trailing ? <div className="ml-auto">{trailing}</div> : null}
      </div>
      {description ? (
        <p className="rct-body-micro">{description}</p>
      ) : null}
    </div>
  );
}
