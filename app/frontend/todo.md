# Chrona — Revenue Control Tower

Продукт для владельца: **один снимок периода** (маркетинг · продажи · деньги) → **главная проблема** → **следующее действие**.

## Архитектура

- **Auth и данные:** Supabase (`profiles`, `processed_metrics`, `insights`, `connected_sources`)
- **Сессия UI:** in-memory (`src/lib/session.ts`), без business-data в localStorage
- **Таблица:** `MvpSupabaseUploadCard` на `/uploads` — агрегат в облако
- **Instagram:** `InstagramConnectCard` на `/uploads` + backend OAuth (`VITE_API_BASE_URL`)

## Экраны (5)

1. `/dashboard` — главный экран, KPI, инсайт
2. `/uploads` — Instagram + загрузка сводной таблицы
3. `/marketing` — CPL, воронка, каналы, топ контента (+ CSV разбивка)
4. `/insights` — разбор правил
5. `/settings` — профиль, сброс данных в облаке

## ИИ-ассистент («Разбор»)

- `POST /api/ai/owner-assistant` на бэкенде, контекст = метрики + инсайт из Supabase
- `OPENAI_API_KEY` в `app/backend/.env` (не во фронт)

## Env (frontend)

См. `app/frontend/.env.example`

## Legacy

Старый BizPulse (localStorage, маркетинг-раздел, детальный импорт) удалён из UI. Ключи `bp_*` в браузере при сбросе в профиле только очищаются как мусор.
