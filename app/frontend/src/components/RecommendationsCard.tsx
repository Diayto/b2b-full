import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import CompactInsightCard from '@/components/controltower/CompactInsightCard';
import SectionHeader from '@/components/controltower/SectionHeader';
import type { MetricHelpKey } from '@/lib/metricHelp';
import type { RecommendationItem } from '@/lib/recommendations';

export default function RecommendationsCard(props: {
  title: string;
  description?: string;
  items: RecommendationItem[];
  helpKey?: MetricHelpKey;
  compact?: boolean;
  className?: string;
}) {
  const { title, description, items, helpKey, compact = true, className } = props;

  return (
    <Card className={cn('rct-card', className)}>
      <CardHeader className="rct-card-padding pb-2">
        <SectionHeader title={title} helpKey={helpKey} description={description} />
      </CardHeader>
      <CardContent className="rct-card-padding pt-0">
        {items.length === 0 ? (
          <p className="rct-body-micro">Пока нет рекомендаций по данным в этом периоде.</p>
        ) : (
          <div className="space-y-3">
            {items.map((it) => (
              <CompactInsightCard key={it.id} item={it} className={compact ? 'p-3' : 'p-4'} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

