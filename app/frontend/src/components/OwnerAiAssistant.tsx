import { useMemo, useState } from 'react';
import { Sparkles, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { askOwnerAssistant, isOwnerAssistantAvailable } from '@/lib/ownerAssistantApi';
import { buildAssistantSuggestions } from '@/lib/ownerAssistantSuggestions';
import type { OwnerAssistantContext } from '@/lib/ownerAssistantContext';

type Props = {
  context: OwnerAssistantContext | null;
};

export default function OwnerAiAssistant({ context }: Props) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apiReady = isOwnerAssistantAvailable();
  const suggestions = useMemo(() => buildAssistantSuggestions(context), [context]);

  const submit = async (text?: string) => {
    const q = (text ?? question).trim();
    if (!q) {
      toast.error('Введите вопрос');
      return;
    }
    if (!context) {
      toast.error('Сначала загрузите данные на странице «Данные»');
      return;
    }
    if (!apiReady) {
      toast.error('Нужен запущенный бэкенд и VITE_API_BASE_URL');
      return;
    }

    setBusy(true);
    setAnswer(null);
    try {
      const result = await askOwnerAssistant(q, context);
      if (!result.ok || !result.answer) {
        toast.error(result.error || 'Не удалось получить ответ');
        return;
      }
      setAnswer(result.answer);
      if (!text) setQuestion(q);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="chrona-surface border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          ИИ-ассистент по бизнесу
        </CardTitle>
        <CardDescription className="text-sm">
          Вопросы про лиды, бюджет, воронку, каналы и кэш — по цифрам периода. Off-topic (погода, код, общие темы)
          не обрабатываются.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!context ? (
          <p className="text-xs text-muted-foreground">
            Загрузите сводную таблицу или включите демо на «Данных», чтобы задать вопрос.
          </p>
        ) : null}

        {context?.isDemoPreview ? (
          <p className="text-xs text-amber-700 dark:text-amber-400/90">
            Демо-снимок{context.scenarioLabel ? ` · ${context.scenarioLabel}` : ''} — ответы опираются на сгенерированные
            цифры, не на ваш бизнес.
          </p>
        ) : null}

        {!apiReady ? (
          <p className="text-xs text-muted-foreground">
            Запустите <span className="font-mono">app/backend</span> и укажите{' '}
            <span className="font-mono">OPENAI_API_KEY</span> в <span className="font-mono">.env</span> бэкенда. На
            Vercel — <span className="font-mono">VITE_API_BASE_URL</span> на задеплоенный API.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <Button
              key={s}
              type="button"
              variant="outline"
              size="sm"
              className="h-auto py-1.5 text-xs whitespace-normal text-left max-w-full"
              disabled={busy || !context || !apiReady}
              onClick={() => void submit(s)}
            >
              {s}
            </Button>
          ))}
        </div>

        <Textarea
          placeholder="Например: стоит ли сейчас увеличить бюджет Meta Ads или усилить organic?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          disabled={busy || !context}
          className="resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">Ctrl+Enter · мин. 10 символов · только бизнес-вопросы</p>
          <Button
            type="button"
            size="sm"
            disabled={busy || !context || !apiReady || question.trim().length < 10}
            onClick={() => void submit()}
          >
            <Send className="h-4 w-4 mr-1.5" />
            {busy ? 'Думаю…' : 'Спросить'}
          </Button>
        </div>

        {answer ? (
          <div className="rounded-lg border border-border/80 bg-muted/30 p-4 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {answer}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
