import { Instagram } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CHRONA_DEMO_INSTAGRAM_SIGNAL } from '@/lib/chronaSourceCredibility';

/** Believable Instagram snapshot for Data page when demo / preview is on. */
export default function DataInstagramPreviewCard() {
  const s = CHRONA_DEMO_INSTAGRAM_SIGNAL;
  return (
    <Card className="border-border/80 overflow-hidden bg-gradient-to-r from-violet-500/5 to-transparent">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-fuchsia-500 to-orange-400 flex items-center justify-center">
            <Instagram className="h-4 w-4 text-white" />
          </div>
          <div>
            <CardTitle className="text-base">Instagram как источник</CardTitle>
            <CardDescription>Так канал выглядит в связке с главным экраном</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Аккаунт </span>
            <span className="font-semibold">{s.handle}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Подписчики </span>
            <span className="font-medium tabular-nums">{s.followersLabel}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Охват </span>
            <span className="font-medium tabular-nums">{s.reachLabel}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Вовлечённость </span>
            <span className="font-medium tabular-nums">{s.engagementRateLabel}</span>
          </div>
        </div>
        <p className="text-xs text-foreground/90 leading-relaxed">{s.interpretation}</p>
      </CardContent>
    </Card>
  );
}
