import { cn } from '@/lib/utils';

export default function ChronaMark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center rounded-xl border border-white/25',
        'bg-[radial-gradient(circle_at_30%_20%,hsl(275_90%_72%/.95),hsl(258_70%_54%/.92)_55%,hsl(242_42%_28%/.9))]',
        'shadow-[0_10px_28px_-14px_hsl(262_70%_62%/.85)] text-white font-semibold tracking-tight',
        compact ? 'h-8 w-8 text-sm' : 'h-11 w-11 text-base',
        className
      )}
      aria-label="Chrona"
    >
      C
      <span className="absolute inset-[3px] rounded-[10px] border border-white/20 pointer-events-none" />
    </div>
  );
}
