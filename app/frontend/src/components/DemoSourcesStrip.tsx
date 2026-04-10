import { Link } from 'react-router-dom';
import { Table2, Instagram, CheckCircle2 } from 'lucide-react';
import { allowChronaDemoFallback } from '@/lib/chronaDemoPreview';
import { cn } from '@/lib/utils';

/**
 * Presents a credible “connected sources” narrative for demos when preview mode is on,
 * or a compact grounded hint always (no overclaim).
 */
export default function DemoSourcesStrip() {
  const preview = allowChronaDemoFallback();
  const dataDeepLink = '/uploads';

  if (preview) {
    return (
      <div className="rounded-xl border border-border/70 bg-card/50 p-4 mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Источники в одну картину</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/60 p-3">
            <Table2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Сводные таблицы</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                CSV / Excel с колонками расходов, лидов, сделок и денег — типичный путь владельца.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/60 p-3">
            <Instagram className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Instagram</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Контент и заявки уходят в единую модель; подключение настраивается вместе с загрузками.
              </p>
              <Link to={dataDeepLink} className="text-xs font-medium text-primary hover:underline mt-2 inline-block">
                Подключение источников →
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-border/50 bg-muted/20 px-4 py-3 mb-5',
        'text-xs text-muted-foreground',
      )}
    >
      <span className="font-medium text-foreground">Источники данных:</span> сводные таблицы (блок ниже) и при необходимости{' '}
      <Link to={dataDeepLink} className="text-primary font-medium hover:underline">
        Instagram / API
      </Link>{' '}
      — всё сводится в один снимок на главном экране.
    </div>
  );
}
