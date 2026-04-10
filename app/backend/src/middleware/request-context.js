import { randomUUID } from 'node:crypto';

export function requestContext(req, _res, next) {
  const requestId = req.header('X-Request-Id') || randomUUID();
  req.context = {
    requestId,
    startedAtMs: Date.now(),
  };
  next();
}

