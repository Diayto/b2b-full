const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_QUESTION_LEN = 2000;

const SYSTEM_PROMPT = `Ты — бизнес-ассистент Chrona (Revenue Control Tower) для владельца малого и среднего бизнеса.
Отвечай на русском языке, кратко и по делу (3–8 предложений, при необходимости маркированный список до 5 пунктов).
Опирайся ТОЛЬКО на переданный JSON с метриками периода и выводом системы. Не выдумывай цифры.
Если данных мало или это демо-превью — скажи честно и предложи загрузить сводную таблицу на странице «Данные».
Давай практические рекомендации: что сделать на этой неделе, чего не делать, на что смотреть в цифрах.
Не используй англицизмы вроде leverage/optimize без необходимости.`;

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
    if (!question) {
      return { ok: false, statusCode: 400, error: 'Question is required', code: 'question_required' };
    }
    if (question.length > MAX_QUESTION_LEN) {
      return { ok: false, statusCode: 400, error: 'Question is too long', code: 'question_too_long' };
    }

    const context = input?.context && typeof input.context === 'object' ? input.context : {};

    const model = this.env.OPENAI_MODEL || DEFAULT_MODEL;
    const body = {
      model,
      temperature: 0.4,
      max_tokens: 800,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Контекст бизнеса (JSON):\n${JSON.stringify(context, null, 2)}\n\nВопрос владельца:\n${question}`,
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
        const msg =
          data?.error?.message || data?.error || `OpenAI API error HTTP ${res.status}`;
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
