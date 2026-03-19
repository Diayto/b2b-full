import { Badge } from '@/components/ui/badge';
import type { RecommendationItem } from '@/lib/recommendations';
import { cn } from '@/lib/utils';
import { AlertTriangle, ArrowRight, Info } from 'lucide-react';

function priorityBadgeClass(priority: RecommendationItem['priority']): string {
  if (priority === 'high') return 'text-rose-600 border-rose-300/60 dark:text-rose-400 dark:border-rose-800/40';
  if (priority === 'medium') return 'text-yellow-700 border-yellow-300/60 dark:text-yellow-400 dark:border-yellow-800/40';
  return 'text-primary border-primary/30';
}

function kindIcon(kind: RecommendationItem['kind']) {
  switch (kind) {
    case 'risk':
      return <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />;
    case 'action':
      return <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />;
    case 'insight':
      return <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
    default:
      return null;
  }
}

function kindLabel(kind: RecommendationItem['kind']): string {
  switch (kind) {
    case 'risk':
      return 'риск';
    case 'action':
      return 'действие';
    case 'insight':
      return 'инсайт';
    default:
      return kind;
  }
}

export interface CompactInsightCardProps {
  item: RecommendationItem;
  className?: string;
}

/**
 * UX pattern: WHAT is wrong → WHY it matters → WHAT to do
 */
export default function CompactInsightCard({ item, className }: CompactInsightCardProps) {
  const isHighPriority = item.priority === 'high';

  return (
    <div
      className={cn(
        'rct-card-inset p-4 hover:bg-muted/50 transition-colors',
        isHighPriority && 'border-l-[3px] border-l-rose-400/70',
        className,
      )}
    >
      {/* Header: icon + title + badges */}
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{kindIcon(item.kind)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <Badge variant="outline" className={cn('text-[10px] font-medium', priorityBadgeClass(item.priority))}>
              {item.priority === 'high' ? 'Высокий' : item.priority === 'medium' ? 'Средний' : 'Низкий'}
            </Badge>
            <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">
              {kindLabel(item.kind)}
            </Badge>
            {item.tags?.slice(0, 2).map((t) => (
              <Badge key={t} variant="outline" className="text-[10px] text-muted-foreground/70 border-border/60">
                {t}
              </Badge>
            ))}
          </div>
          <p className="text-sm font-semibold text-foreground">{item.title}</p>
        </div>
      </div>

      {/* Structured content: What → Why → Next */}
      <div className="mt-2.5 ml-5.5 space-y-1.5 leading-snug">
        {/* WHAT is wrong (shown first per UX principles) */}
        <div className="flex items-start gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 shrink-0 mt-0.5 w-[52px]">
            Что
          </span>
          <p className="text-xs text-foreground">{item.what}</p>
        </div>

        {/* WHY it matters */}
        <div className="flex items-start gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 w-[52px]">
            Почему
          </span>
          <p className="text-xs text-muted-foreground">{item.why}</p>
        </div>

        {/* WHAT to do */}
        <div className="flex items-start gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 shrink-0 mt-0.5 w-[52px]">
            Делать
          </span>
          <p className="text-xs text-muted-foreground">{item.next}</p>
        </div>
      </div>
    </div>
  );
}
