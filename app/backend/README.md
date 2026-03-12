# BizPulse Backend Stub

Minimal backend for deadline email notifications.

## What it provides

- `POST /api/notifications/deadlines`
- `GET /api/notifications/queue`
- `POST /api/notifications/retry-dead-letter`
- Idempotency by `X-Request-Id` (or `requestId` from body)
- Local persistence for idempotency and request logs
- Provider priority: `Resend -> SMTP -> queued`
- Automatic retries with exponential backoff
- Dead-letter queue (DLQ) for messages that exceeded retry limit

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
