import {
  MAX_QUESTION_LEN,
  MIN_QUESTION_LEN,
  SYSTEM_PROMPT,
  detectQuestionTopic,
  pickResponseStyleHint,
  validateOwnerQuestion,
} from './owner-assistant-validate.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

export class OwnerAssistantService {
  constructor({ env }) {
    this.env = env;
  }

  isConfigured() {
    return Boolean(this.env.OPENAI_API_KEY?.trim());
  }

  /**
   * @param {{ question: string, context: Record<string, unknown> }} input
   */
  async ask(input) {
    if (!this.isConfigured()) {
      return {
        ok: false,
        statusCode: 503,
        error: 'OPENAI_API_KEY is not configured on the server',
        code: 'openai_not_configured',
      };
    }

    const question = String(input?.question ?? '').trim();
    const validation = validateOwnerQuestion(question);
    if (!validation.ok) {
      return { ok: false, statusCode: 400, ...validation };
    }

    const context = input?.context && typeof input.context === 'object' ? input.context : {};
    const topic = detectQuestionTopic(question);
    const styleHint = pickResponseStyleHint();

    const model = this.env.OPENAI_MODEL || DEFAULT_MODEL;
    const temperature = 0.55 + Math.random() * 0.15;

    const body = {
      model,
      temperature,
      max_tokens: 900,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            `Контекст бизнеса (JSON):\n${JSON.stringify(context, null, 2)}`,
            `\nТема вопроса (ориентир): ${topic}`,
            `\nСтиль ответа на этот раз: ${styleHint}`,
            `\nВопрос владельца:\n${question}`,
            '\nОтветь по теме вопроса, не пересказывай весь JSON. Если в контексте есть marketing.channels или marketing.content — используй при вопросах о каналах/контенте.',
          ].join('\n'),
        },
      ],
    };

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.env.OPENAI_API_KEY.trim()}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error?.message || data?.error || `OpenAI API error HTTP ${res.status}`;
        return {
          ok: false,
          statusCode: res.status >= 400 && res.status < 600 ? res.status : 502,
          error: String(msg),
          code: 'openai_request_failed',
        };
      }

      const answer = data?.choices?.[0]?.message?.content?.trim();
      if (!answer) {
        return { ok: false, statusCode: 502, error: 'Empty response from OpenAI', code: 'openai_empty' };
      }

      return {
        ok: true,
        statusCode: 200,
        answer,
        model: data?.model || model,
        topic,
      };
    } catch (e) {
      return {
        ok: false,
        statusCode: 502,
        error: e instanceof Error ? e.message : 'OpenAI request failed',
        code: 'openai_network_error',
      };
    }
  }
}

export { MAX_QUESTION_LEN, MIN_QUESTION_LEN, validateOwnerQuestion };
