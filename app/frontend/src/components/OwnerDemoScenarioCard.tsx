import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, XCircle } from 'lucide-react';
import { seedDemoData } from '@/lib/store';
import { isOwnerDemoSessionActive, setOwnerDemoSessionActive } from '@/lib/chronaDemoPreview';

type Props = {
  companyId: string;
};

/**
 * One-shot owner demo: local chain (bp_*) + session flag so dashboard/breakdown use the same packaged cloud demo.
 */
export default function OwnerDemoScenarioCard({ companyId }: Props) {
  const active = isOwnerDemoSessionActive();

  const enable = () => {
    if (!companyId) return;
    seedDemoData(companyId);
    setOwnerDemoSessionActive(true);
    window.location.reload();
  };

  const disable = () => {
    setOwnerDemoSessionActive(false);
    window.location.reload();
  };

  return (
    <Card className="chrona-surface border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Демо-сценарий
        </CardTitle>
        <CardDescription>
          Заполняет локальную цепочку (лиды, сделки, оплаты) и включает единую демонстрацию на главном экране и в разборе —
          как будто данные уже сошлись. Для сброса нажмите «Выключить» или очистите данные в профиле.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 pt-0">
        {active ? (
          <>
            <BadgeMuted text="Демо включено в этой вкладке браузера" />
            <Button type="button" variant="outline" size="sm" onClick={disable}>
              <XCircle className="h-4 w-4 mr-1.5" />
              Выключить демо
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" onClick={enable} disabled={!companyId}>
            Включить демо-сценарий
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function BadgeMuted({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
      {text}
    </span>
  );
}
