const MAX_QUESTION_LEN = 2000;
const MIN_QUESTION_LEN = 10;

const OFF_TOPIC_PATTERNS = [
  /\b(погод|рецепт|анекдот|стихотвор|стих\b|песн[яи]|фильм|сериал|игр[аыу]|minecraft|fortnite)\b/i,
  /^(привет|здравств|hello|hi\b|как дела|who are you|ты кто)/i,
  /\b(напиши код|javascript|python\b|react\b|sql запрос|html css)\b/i,
  /\b(политик|выбор|президент|войн[аы]|крипт[ао]|биткоин|nft)\b/i,
  /\b(гороскоп|астrolog|секс\b|18\+)\b/i,
];

const BUSINESS_PATTERNS = [
  /лид|сделк|воронк|бюджет|расход|выруч|кэш|денег|канал|маркет|продаж|конвер|cpl|romi|instagram|реклам|клиент|оплат|период|бизнес|команд|менедж|контент|ролик|видео|квалиф|созвон|встреч|цел|план|действ|проблем|узк|отвал|трафик|заявк|сч[её]т|дебитор|follow|звонк|скрипт|оффер|стаж|курс|студент/i,
  /что делать|почему|стоит ли|где\b|как улучш|какой|сколько|когда|нужно ли|можно ли|главн|первую очередь|масштаб|сократ|увелич|перераспредел|проверить|гипотез|метрик|показател|romi|cpl/i,
];

const RESPONSE_STYLES = [
  'Структура ответа: «Вывод» (1 предложение с цифрой из контекста) → «Почему» → «3 шага на неделю» (маркированный список).',
  'Ответ в 2 абзаца: диагноз, затем что делать и чего не делать. Без одинаковых вступлений вроде «Исходя из данных».',
  'Формат: «Сделать» (2 пункта), «Не делать» (1 пункт), «Проверить в цифрах» (1–2 метрики из JSON).',
  'Короткий ответ: сначала прямой ответ на вопрос, потом 2–4 конкретных действия с привязкой к метрикам периода.',
];

export { MAX_QUESTION_LEN, MIN_QUESTION_LEN };

export function validateOwnerQuestion(question) {
  const q = String(question ?? '').trim();

  if (!q) {
    return { ok: false, code: 'question_required', error: 'Введите вопрос' };
  }
  if (q.length < MIN_QUESTION_LEN) {
    return {
      ok: false,
      code: 'question_too_short',
      error: 'Вопрос слишком короткий — опишите, что хотите понять по бизнесу (лиды, бюджет, воронка, каналы).',
    };
  }
  if (q.length > MAX_QUESTION_LEN) {
    return { ok: false, code: 'question_too_long', error: 'Вопрос слишком длинный' };
  }

  if (OFF_TOPIC_PATTERNS.some((re) => re.test(q))) {
    return {
      ok: false,
      code: 'question_off_topic',
      error:
        'Отвечаю только по вашему бизнес-периоду: лиды, продажи, бюджет, каналы, кэш. Задайте вопрос про метрики или действия.',
    };
  }

  const hasBusinessSignal = BUSINESS_PATTERNS.some((re) => re.test(q));
  if (!hasBusinessSignal) {
    return {
      ok: false,
      code: 'question_off_topic',
      error:
        'Вопрос не про управление периодом. Примеры: «Стоит ли увеличить бюджет?», «Где узкое место воронки?», «Какой канал сильнее?»',
    };
  }

  return { ok: true };
}

export function detectQuestionTopic(question) {
  const q = String(question).toLowerCase();
  if (/бюджет|расход|реклам|cpl|romi|вливан|кампан/i.test(q)) return 'budget';
  if (/канал|instagram|meta|контент|ролик|видео|organic|ads/i.test(q)) return 'channels';
  if (/кэш|денег|оплат|сч[её]т|дебитор|приток|отток/i.test(q)) return 'cash';
  if (/воронк|конвер|лид.*сделк|сделк.*лид|отвал|узк/i.test(q)) return 'funnel';
  if (/недел|первую очередь|план|шаг|действ|гипотез/i.test(q)) return 'priority';
  if (/продаж|менедж|звонк|скрипт|follow/i.test(q)) return 'sales';
  return 'general';
}

export function pickResponseStyleHint() {
  return RESPONSE_STYLES[Math.floor(Math.random() * RESPONSE_STYLES.length)];
}

export const SYSTEM_PROMPT = `Ты — бизнес-ассистент Chrona (Revenue Control Tower) для владельца малого и среднего бизнеса.

ЖЁСТКИЕ ПРАВИЛА:
- Отвечай ТОЛЬКО на вопросы об управлении бизнесом в контексте переданного JSON (лиды, сделки, расход, выручка, кэш, каналы, контент, вывод системы).
- Если вопрос не про бизнес-период — вежливо откажись одним предложением и предложи переформулировать.
- Опирайся ТОЛЬКО на JSON. Не выдумывай цифры, клиентов, кампании.
- Если isDemoPreview=true — упомяни, что это демо-снимок, и советуй загрузить реальную таблицу на «Данных».
- Язык: русский. Без англицизмов leverage/optimize.
- Длина: 4–10 предложений или список до 5 пунктов — в зависимости от стиля в подсказке.
- Каждый ответ должен отличаться формулировками: не начинай два ответа одинаково; цитируй хотя бы одну конкретную цифру из JSON.
- Давай практику: что сделать на неделе, чего не делать, на какую метрику смотреть.`;
