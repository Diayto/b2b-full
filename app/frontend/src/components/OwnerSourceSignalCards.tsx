import { Instagram, Table2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { InstagramSourceSignal, TableSourceSignal } from '@/lib/chronaSourceCredibility';
import { cn } from '@/lib/utils';

type Props = {
  instagram: InstagramSourceSignal | null;
  table: TableSourceSignal;
};

export default function OwnerSourceSignalCards({ instagram, table }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Откуда картина периода</p>
      <div className={cn('grid grid-cols-1 gap-3', instagram ? 'md:grid-cols-2' : 'md:grid-cols-1')}>
        {instagram ? (
          <Card className="border-border/80 bg-gradient-to-br from-violet-500/5 via-card to-card shadow-sm overflow-hidden">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400 flex items-center justify-center shrink-0 shadow-inner">
                  <Instagram className="h-5 w-5 text-white" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{instagram.handle}</p>
                  <p className="text-xs text-muted-foreground">Instagram</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-background/80 border border-border/50 py-2">
                  <p className="text-[10px] text-muted-foreground">Подписчики</p>
                  <p className="text-sm font-semibold tabular-nums">{instagram.followersLabel}</p>
                </div>
                <div className="rounded-md bg-background/80 border border-border/50 py-2">
                  <p className="text-[10px] text-muted-foreground">Охват</p>
                  <p className="text-sm font-semibold tabular-nums">{instagram.reachLabel}</p>
                </div>
                <div className="rounded-md bg-background/80 border border-border/50 py-2">
                  <p className="text-[10px] text-muted-foreground">Вовлечённость</p>
                  <p className="text-sm font-semibold tabular-nums">{instagram.engagementRateLabel}</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Заявок с канала в модели: <span className="font-medium text-foreground">{instagram.leadsAttributed}</span>
              </p>
              <p className="text-xs text-foreground/90 leading-relaxed border-t border-border/50 pt-2">{instagram.interpretation}</p>
            </CardContent>
          </Card>
        ) : null}

        <Card className={cn('border-border/80 bg-card shadow-sm', !instagram && 'md:max-w-xl')}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Table2 className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{table.title}</p>
                <p className="text-xs text-muted-foreground">{table.subtitle}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-muted/30 border border-border/40 py-2">
                <p className="text-[10px] text-muted-foreground">Лиды</p>
                <p className="text-sm font-semibold tabular-nums">{table.leadsInSvod}</p>
              </div>
              <div className="rounded-md bg-muted/30 border border-border/40 py-2">
                <p className="text-[10px] text-muted-foreground">Сделки</p>
                <p className="text-sm font-semibold tabular-nums">{table.dealsInSvod}</p>
              </div>
              <div className="rounded-md bg-muted/30 border border-border/40 py-2">
                <p className="text-[10px] text-muted-foreground">Выручка</p>
                <p className="text-sm font-semibold tabular-nums leading-tight">{table.revenueLabel}</p>
              </div>
            </div>
            <p className="text-xs text-foreground/90 leading-relaxed border-t border-border/50 pt-2">{table.interpretation}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
