import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileSpreadsheet } from 'lucide-react';

export default function SessionDemoGuide() {
  return (
    <Alert className="border-primary/30 bg-primary/5">
      <FileSpreadsheet className="h-4 w-4" />
      <AlertTitle className="text-sm">Загрузка таблицы</AlertTitle>
      <AlertDescription className="text-xs leading-relaxed space-y-1.5 mt-1">
        <p>
          <strong>1.</strong> Выберите свой CSV/Excel в блоке «Загрузка таблицы» ниже.
        </p>
        <p>
          <strong>2.</strong> Если в файле есть колонка <span className="font-mono">block</span> (свод / канал / контент)
          — нажмите «Сохранить» без сопоставления колонок.
        </p>
        <p>
          <strong>3.</strong> Иначе сопоставьте колонки вручную → «Сохранить и открыть дашборд».
        </p>
      </AlertDescription>
    </Alert>
  );
}
