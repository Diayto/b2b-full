import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export interface CollapsibleSectionProps {
  title: string;
  summary?: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  variant?: 'card' | 'inline';
  className?: string;
  children: React.ReactNode;
}

export default function CollapsibleSection({
  title,
  summary,
  badge,
  defaultOpen = false,
  variant = 'card',
  className,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const wrapperClass =
    variant === 'card'
      ? 'rct-card overflow-hidden'
      : 'border-b border-border';

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn(wrapperClass, className)}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'flex items-center justify-between gap-3 w-full text-left transition-colors group/trigger',
            variant === 'card'
              ? 'px-5 py-3.5 hover:bg-accent/40'
              : 'py-3 hover:bg-accent/30'
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <h3 className="rct-subsection-title truncate">{title}</h3>
            {badge && (
              typeof badge === 'string'
                ? <Badge variant="outline" className="text-[10px] font-medium shrink-0">{badge}</Badge>
                : <span className="shrink-0">{badge}</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {!open && summary && (
              <span className="text-[11px] text-muted-foreground truncate max-w-[200px] hidden sm:inline">
                {summary}
              </span>
            )}
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200',
                open && 'rotate-180'
              )}
            />
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
        {variant === 'card' && (
          <div className="mx-5 border-t border-border/50" />
        )}
        <div className={cn(variant === 'card' ? 'px-5 pb-5 pt-3' : 'pb-3 pt-2')}>
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
