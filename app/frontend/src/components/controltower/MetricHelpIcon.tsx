import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import type { MetricHelpKey } from '@/lib/metricHelp';
import { METRIC_HELP } from '@/lib/metricHelp';
import { cn } from '@/lib/utils';

export interface MetricHelpIconProps {
  helpKey: MetricHelpKey;
  className?: string;
  size?: 'sm' | 'md';
}

export default function MetricHelpIcon({ helpKey, className, size = 'md' }: MetricHelpIconProps) {
  const content = METRIC_HELP[helpKey];
  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const iconInner = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full border border-border text-muted-foreground bg-card hover:bg-accent hover:text-accent-foreground transition-colors',
            iconSize,
            className
          )}
          role="button"
          tabIndex={0}
          aria-label="Что это?"
        >
          <HelpCircle className={iconInner} />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[320px]">
        <div className="space-y-2">
          <div className="rct-tooltip-title">{content.what}</div>
          <div className="rct-tooltip-body">
            <span className="font-medium text-foreground">Почему:</span> {content.why}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
