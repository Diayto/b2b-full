import { Badge } from '@/components/ui/badge';
import type { RecommendationItem } from '@/lib/recommendations';
import { cn } from '@/lib/utils';

function priorityBadgeClass(priority: RecommendationItem['priority']): string {
  if (priority === 'high') return 'text-rose-600 border-rose-300/60 dark:text-rose-400 dark:border-rose-800/40';
  if (priority === 'medium') return 'text-yellow-700 border-yellow-300/60 dark:text-yellow-400 dark:border-yellow-800/40';
  return 'text-primary border-primary/30';
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

export default function CompactInsightCard({ item, className }: CompactInsightCardProps) {
  return (
    <div
      className={cn(
        'rct-card-inset p-4 hover:bg-muted/50',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Badge variant="outline" className="text-xs font-medium text-muted-foreground border-border">
          {kindLabel(item.kind)}
        </Badge>
        <Badge variant="outline" className={cn('text-xs font-medium', priorityBadgeClass(item.priority))}>
          {item.priority === 'high' ? 'Высокий' : item.priority === 'medium' ? 'Средний' : 'Низкий'}
        </Badge>
        {item.tags?.slice(0, 2).map((t) => (
          <Badge key={t} variant="outline" className="text-xs text-muted-foreground border-border">
            {t}
          </Badge>
        ))}
      </div>
      <p className="rct-subsection-title">{item.title}</p>
      <div className="mt-2 space-y-1 leading-snug">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Проблема:</span> {item.what}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Влияние:</span> {item.why}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Следующий шаг:</span> {item.next}
        </p>
      </div>
    </div>
  );
}
