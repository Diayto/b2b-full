# BizPulse Backend Stub

Minimal backend for deadline email notifications.

Now includes Slice B1 for durable Instagram/organic content metrics storage via SQLite.

## What it provides

- `POST /api/notifications/deadlines`
- `GET /api/notifications/queue`
- `POST /api/notifications/retry-dead-letter`
- `POST /api/ingestion/content-metrics`
- `POST /api/ingestion/leads`
- `POST /api/ingestion/deals`
- `POST /api/ingestion/content-metrics/jobs`
- `GET /api/ingestion/content-metrics/jobs`
- `GET /api/ingestion/content-metrics/jobs/:jobId`
- `POST /api/actions/from-diagnostics`
- `GET /api/actions`
- `PATCH /api/actions/:actionId`
- `GET /api/content-metrics`
- `GET /api/content-metrics/summary?companyId=...` — агрегаты по строкам content_metrics (для снимков в Supabase)
- `GET /api/content-metrics/diagnostics`
- `GET /api/leads/summary?companyId=...` — число лидов и диапазон дат
- `GET /api/deals/summary?companyId=...` — число сделок и диапазон дат
- `POST /api/content-metrics/linkage/leads/rebuild`
- `POST /api/linkage/leads-deals/rebuild`
- Idempotency by `X-Request-Id` (or `requestId` from body)
- Local persistence for idempotency and request logs
- Durable SQLite persistence for content metrics (`data/app.db`)
- Durable SQLite persistence for leads and deterministic content→lead links (`data/app.db`)
- Durable SQLite persistence for deals and deterministic lead→deal links (`data/app.db`)
- Durable ingestion jobs, per-job stats, and source provenance for content metrics (`data/app.db`)
- Durable action queue with diagnostic traceability (`data/app.db`)
- Provider priority: `Resend -> SMTP -> queued`
- Automatic retries with exponential backoff
- Dead-letter queue (DLQ) for messages that exceeded retry limit
- SQL migrations auto-run on startup (`src/db/migrations`)
- Linkage feature flag: `LEAD_LINKAGE_ENABLED=true|false` (default: `true`)
- Ingestion jobs feature flag: `CONTENT_INGESTION_JOBS_ENABLED=true|false` (default: `true`)
- Instagram OAuth (J4-S1 demo path, optional): `INSTAGRAM_LIVE_OAUTH_ENABLED=true|false` (default: `false`)
  - `GET /api/connectors/instagram/oauth/start?companyId=...` → `302` to Meta (`state` is HMAC-signed, scoped to `companyId`)
  - `GET /api/connectors/instagram/oauth/callback?code=&state=` → token exchange + bind `instagram_sources` + encrypted token row → `302` to frontend (`/marketing/data?ig_oauth=1|0&...`)
  - Env: `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI`, `META_GRAPH_VERSION`, `INSTAGRAM_TOKEN_ENCRYPTION_KEY` (64 hex chars), optional `INSTAGRAM_OAUTH_FRONTEND_REDIRECT_BASE`, `INSTAGRAM_OAUTH_FRONTEND_PATH`
- Instagram live pull (J4-S2): `POST /api/connectors/instagram/sources/:sourceId/live-pull?companyId=...` with optional JSON body `{ "limit": 25 }` (max 50)
  - Requires `INSTAGRAM_LIVE_OAUTH_ENABLED=true`, encrypted OAuth token row, source `active` with `credential_ref=oauth_token:v1`
  - Fetches `GET /{ig-user-id}/media` from Graph (fields: `id`, `caption`, `media_type`, `permalink`, `timestamp`, `like_count`, `comments_count`), maps rows into content-metrics ingestion via existing `ingestWithJob`

## Run

1. Install dependencies:

```bash
pnpm install
```

2. Create `.env` from example:

```bash
cp .env.example .env
```

3. Start backend:

```bash
pnpm run dev
```

Backend runs on `http://localhost:8000` by default.

## Health Check

```bash
curl http://localhost:8000/api/notifications/health
```

## Notes

- If neither Resend nor SMTP are configured, endpoint returns `status: "queued"` and logs the request.
- Files are written to `./data`:
  - `idempotency.json`
  - `deadline-reminders.log`
  - `retry-queue.json`
  - `dead-letter.json`
  - `app.db`

## Provider Setup (Resend)

Set in `.env`:

```bash
RESEND_API_KEY=re_xxx
RESEND_FROM="BizPulse <onboarding@resend.dev>"
```

## Retry Policy

Config in `.env`:

```bash
MAX_RETRY_ATTEMPTS=4
RETRY_BASE_MS=60000
```

Backoff is exponential: `base * 2^(attempt-1)`.

## Content Metrics API

### Ingest

`POST /api/ingestion/content-metrics`

Request:

```json
{
  "companyId": "cmp_123",
  "rows": [
    {
      "contentId": "ig_1001",
      "platform": "instagram",
      "contentTitle": "Reel: April campaign",
      "publishedAt": "2026-03-20",
      "reach": 1200,
      "impressions": 1800,
      "likes": 120,
      "comments": 18,
      "saves": 12,
      "shares": 7,
      "profileVisits": 54,
      "inboundMessages": 9,
      "leadsGenerated": 3,
      "dealsGenerated": 1,
      "paidConversions": 0,
      "sourceUploadId": "upl_001",
      "sourceFileName": "instagram_march.xlsx"
    }
  ]
}
```

### Read

`GET /api/content-metrics?companyId=cmp_123&from=2026-03-01&to=2026-03-31&platform=instagram`

### Diagnostics

`GET /api/content-metrics/diagnostics?companyId=cmp_123&from=2026-03-01&to=2026-03-31&platform=instagram`
