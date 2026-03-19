// Trust indicator: exact / fallback / incomplete — consistent across product

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type TrustLevel = 'exact' | 'fallback' | 'incomplete';

const TRUST_LABELS: Record<TrustLevel, string> = {
  exact: 'Точные данные',
  fallback: 'По неполным связям',
  incomplete: 'Неполные данные',
};

const TRUST_CLASSES: Record<TrustLevel, string> = {
  exact: 'text-teal-600 dark:text-teal-400 border-teal-300/60',
  fallback: 'text-amber-600 dark:text-amber-400 border-amber-300/60',
  incomplete: 'text-rose-600 dark:text-rose-400 border-rose-300/60',
};

interface TrustBadgeProps {
  level: TrustLevel;
  tooltip?: string;
  className?: string;
  size?: 'xs' | 'sm';
}

export default function TrustBadge({ level, tooltip, className, size = 'xs' }: TrustBadgeProps) {
  const label = TRUST_LABELS[level];
  const content = (
    <Badge
      variant="outline"
      className={cn(
        'font-medium',
        size === 'xs' ? 'text-[10px] px-1.5' : 'text-xs px-2',
        TRUST_CLASSES[level],
        className
      )}
    >
      {label}
    </Badge>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 cursor-help">
              {content}
              <Info className={cn('text-muted-foreground', size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px]">
            <p className="text-xs">{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}

/** Map CalculationMode (exact|fallback) to TrustLevel */
export function calculationModeToTrust(mode: 'exact' | 'fallback'): TrustLevel {
  return mode === 'fallback' ? 'fallback' : 'exact';
}
