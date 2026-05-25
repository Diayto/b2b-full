# Chrona — Revenue Control Tower

Продукт для владельца: **один снимок периода** (маркетинг · продажи · деньги) → **главная проблема** → **следующее действие**.

## Архитектура

- **Auth и данные:** Supabase (`profiles`, `processed_metrics`, `insights`, `connected_sources`)
- **Сессия UI:** in-memory (`src/lib/session.ts`), без business-data в localStorage
- **Таблица:** `MvpSupabaseUploadCard` на `/uploads` — агрегат в облако
- **Instagram:** `InstagramConnectCard` на `/dashboard` + backend OAuth (`VITE_API_BASE_URL`)

## Экраны (4)

1. `/dashboard` — главный экран, KPI, инсайт, Instagram
2. `/uploads` — загрузка сводной таблицы
3. `/insights` — разбор правил
4. `/settings` — профиль, сброс данных в облаке

## Env (frontend)

См. `app/frontend/.env.example`

## Legacy

Старый BizPulse (localStorage, маркетинг-раздел, детальный импорт) удалён из UI. Ключи `bp_*` в браузере при сбросе в профиле только очищаются как мусор.
