import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function SkeletonCard(props: {
  variant?: 'kpi' | 'section' | 'list';
  className?: string;
}) {
  const { variant = 'section', className } = props;

  if (variant === 'kpi') {
    return (
      <div className={cn('rct-card p-5', className)}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-32 mt-3" />
        <Skeleton className="h-3 w-20 mt-2" />
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <div className={cn('rct-card p-5 space-y-4', className)}>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5 max-w-[80%]" />
        <Skeleton className="h-3 w-3/5 max-w-[60%]" />
      </div>
    );
  }

  return (
    <div className={cn('rct-card p-5', className)}>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-full mt-4" />
      <Skeleton className="h-4 w-full mt-2" />
      <Skeleton className="h-20 w-full mt-4" />
    </div>
  );
}
