# Deadline Notifications API

Endpoint for sending contract deadline reminders (`7/3/1` or custom schedule).

## Endpoint

- Method: `POST`
- Path: `/api/notifications/deadlines`
- Headers:
  - `Content-Type: application/json`
  - `X-Request-Id: <requestId>` (idempotency key)

## Request Body

```json
{
  "requestId": "company:doc:2026-03-20:7:owner@company.com",
  "companyId": "cmp_123",
  "documentId": "doc_777",
  "documentTitle": "Договор поставки №54",
  "deadlineDate": "2026-03-20",
  "daysBefore": 7,
  "recipientEmail": "owner@company.com",
  "subject": "Дедлайн через 7 дн.: Договор поставки №54",
  "html": "<!doctype html>..."
}
```

## Response Body

```json
{
  "status": "accepted",
  "messageId": "mail_abc123",
  "provider": "resend"
}
```

`status` values:
- `accepted` - request accepted by backend queue
- `queued` - queued for retry
- `sent` - sent synchronously
- `failed` - hard failure (no retry)

## Backend Requirements

- Must be idempotent by `requestId` (or `X-Request-Id`).
- If same `requestId` comes twice, return previous result (do not send duplicate email).
- Validate:
  - `deadlineDate` in `YYYY-MM-DD`
  - `daysBefore` non-negative integer
  - `recipientEmail` valid email

## FastAPI Example

```python
from fastapi import FastAPI, Header
from pydantic import BaseModel, EmailStr

app = FastAPI()
idempotency_store = {}

class ReminderIn(BaseModel):
    requestId: str
    companyId: str
    documentId: str
    documentTitle: str
    deadlineDate: str
    daysBefore: int
    recipientEmail: EmailStr
    subject: str
    html: str

@app.post("/api/notifications/deadlines")
async def send_deadline_reminder(payload: ReminderIn, x_request_id: str | None = Header(None)):
    key = x_request_id or payload.requestId
    if key in idempotency_store:
        return idempotency_store[key]

    # call email provider here
    result = {"status": "accepted", "messageId": f"mail_{key[-8:]}", "provider": "smtp"}
    idempotency_store[key] = result
    return result
```

## Express Example

```js
import express from "express";
const app = express();
app.use(express.json({ limit: "1mb" }));

const idempotencyStore = new Map();

app.post("/api/notifications/deadlines", async (req, res) => {
  const key = req.header("X-Request-Id") || req.body.requestId;
  if (!key) return res.status(400).json({ status: "failed", error: "Missing requestId" });
  if (idempotencyStore.has(key)) return res.json(idempotencyStore.get(key));

  // send via provider (SES/Resend/SendGrid/SMTP)
  const result = { status: "accepted", messageId: `mail_${Date.now()}`, provider: "resend" };
  idempotencyStore.set(key, result);
  return res.json(result);
});
```
