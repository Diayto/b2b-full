export function notFound(_req, res) {
  res.status(404).json({
    ok: false,
    error: 'Not found',
  });
}

export function errorHandler(err, req, res, _next) {
  const status = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
  const message = err?.message || 'Internal server error';

  console.error('Unhandled error:', {
    requestId: req?.context?.requestId,
    message,
    stack: err?.stack,
  });

  res.status(status).json({
    ok: false,
    error: message,
    requestId: req?.context?.requestId,
  });
}

