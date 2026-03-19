import { MoreHorizontal } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { MetricHelpKey } from '@/lib/metricHelp';
import { METRIC_HELP } from '@/lib/metricHelp';
import { cn } from '@/lib/utils';

export interface ContextDetailProps {
  helpKey?: MetricHelpKey;
  title?: string;
  description?: string;
  extra?: string;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

export default function ContextDetail({
  helpKey,
  title,
  description,
  extra,
  className,
  side = 'bottom',
  align = 'end',
}: ContextDetailProps) {
  const help = helpKey ? METRIC_HELP[helpKey] : null;
  const displayTitle = title ?? help?.what;
  const displayDesc = description ?? help?.why;

  if (!displayTitle && !displayDesc) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center justify-center rounded-md h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            className
          )}
          aria-label="Подробнее"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" side={side} align={align}>
        <div className="space-y-2.5">
          {displayTitle && <p className="rct-tooltip-title">{displayTitle}</p>}
          {displayDesc && (
            <p className="rct-tooltip-body leading-relaxed">{displayDesc}</p>
          )}
          {extra && (
            <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
              {extra}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
