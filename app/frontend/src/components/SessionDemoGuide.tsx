import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileSpreadsheet } from 'lucide-react';

export default function SessionDemoGuide() {
  return (
    <Alert className="border-primary/30 bg-primary/5">
      <FileSpreadsheet className="h-4 w-4" />
      <AlertTitle className="text-sm">Загрузка таблицы → главный экран</AlertTitle>
      <AlertDescription className="text-xs leading-relaxed space-y-1.5 mt-1">
        <p>
          <strong>1.</strong> Выберите CSV/Excel ниже (шаблон:{' '}
          <a href="/session-demo-template.csv" download className="font-medium text-primary underline">
            session-demo-template.csv
          </a>
          ).
        </p>
        <p>
          <strong>2.</strong> Сопоставьте колонки → <strong>«Сохранить и открыть дашборд»</strong>.
        </p>
        <p>
          <strong>3.</strong> Instagram — блок выше на этой же странице.
        </p>
      </AlertDescription>
    </Alert>
  );
}
