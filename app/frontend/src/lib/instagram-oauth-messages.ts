export function formatIgOAuthReason(reason: string | null): string {
  if (!reason) return 'Подключение Instagram не завершено.';
  const map: Record<string, string> = {
    oauth_denied: 'Вход в Meta отменён.',
    state_invalid: 'Неверное состояние OAuth — попробуйте снова.',
    state_expired: 'Сессия OAuth истекла — подключите снова.',
    callback_invalid: 'Некорректный ответ Meta — попробуйте снова.',
    token_exchange_failed: 'Ошибка обмена токена (проверьте META_* на сервере).',
    no_instagram_business: 'Нет Instagram Business, привязанного к Facebook.',
    graph_error: 'Ошибка Meta Graph при получении аккаунта.',
    upsert_failed: 'Не удалось сохранить источник.',
    token_persist_failed: 'Не удалось сохранить токен на сервере.',
    disabled: 'OAuth Instagram отключён на сервере.',
    config: 'На сервере не настроен OAuth (META_*, ключ шифрования).',
  };
  return map[reason] ?? `Ошибка подключения (${reason}).`;
}
