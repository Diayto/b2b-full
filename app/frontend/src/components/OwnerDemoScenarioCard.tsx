import { useNavigate } from 'react-router-dom';
import { Sparkles, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isOwnerDemoSessionActive, setOwnerDemoSessionActive } from '@/lib/chronaDemoPreview';

type Props = { companyId: string };

/** Включает упакованный демо-снимок на главном экране (без localStorage и без файла). */
export default function OwnerDemoScenarioCard({ companyId }: Props) {
  const navigate = useNavigate();
  const active = isOwnerDemoSessionActive();

  const enable = () => {
    if (!companyId) return;
    setOwnerDemoSessionActive(true);
    navigate('/dashboard', { replace: true });
  };

  const disable = () => {
    setOwnerDemoSessionActive(false);
    navigate('/dashboard', { replace: true });
  };

  return (
    <Card className="chrona-surface border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Демо-сценарий
        </CardTitle>
        <CardDescription>
          Готовая картина на главном экране и в разборе — без загрузки таблицы. Для живой сессии с Excel используйте
          блок ниже.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 pt-0">
        {active ? (
          <>
            <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
              Демо включено
            </span>
            <Button type="button" variant="outline" size="sm" onClick={disable}>
              <XCircle className="h-4 w-4 mr-1.5" />
              Выключить
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
