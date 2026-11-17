// src/middleware/error-handler.ts
import type { AppContext } from '@server/lib/hono';
import { AppError } from '../lib/errors';
import { error } from '../lib/response';
import { env } from '../config/env';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { annotateRequest, currentRequestId, log } from '../lib/log';

export function errorHandler(err: Error, c: AppContext) {
  const isDev = env.NODE_ENV === 'development';

  if (err instanceof AppError) {
    // Expected outcomes (not found, validation, conflict): the request line records the code.
    annotateRequest({ error_code: err.code });
    if (err.statusCode >= 500) log.error('request failed', { err, method: c.req.method, path: c.req.path });
    return error(c, err.message, err.statusCode as unknown as ContentfulStatusCode, err.code);
  }

  const anyErr = err as any;
  const known = isKnownError(anyErr);
  annotateRequest({ error_code: known ?? 'INTERNAL_ERROR' });
  // Anything not mapped to a client error is a bug or an outage: keep the whole stack.
  if (!known || known === 'SERVICE_UNAVAILABLE') {
    log.error('request failed', { err, method: c.req.method, path: c.req.path });
  }

  // Network / service connectivity
  if (
    anyErr.code === 'ECONNREFUSED'
    || anyErr.code === 'ENOTFOUND'
    || anyErr.code === 'SERVICE_UNAVAILABLE'
    || anyErr.code === 'TIMEOUT'
  ) {
    const msg = isDev ? `Service unavailable: ${err.message}` : 'A backend service is unavailable';
    return error(c, msg, 503, 'SERVICE_UNAVAILABLE');
  }

  // Postgres constraint errors
  if (anyErr.code === '23505') {
    const field = anyErr.constraint_name?.replace('_key', '').replace('categories_', '');
    return error(c, `${field || 'Resource'} already exists`, 409, 'CONFLICT');
  }
  if (anyErr.code === '23503') {
    return error(c, 'Related resource not found', 400, 'INVALID_REFERENCE');
  }
  if (anyErr.code === '23502') {
    return error(c, `Required field missing: ${anyErr.column_name}`, 400, 'VALIDATION_ERROR');
  }
  if (anyErr.code === '23514') {
    return error(c, 'Invalid data: constraint violation', 400, 'VALIDATION_ERROR');
  }

  if (err.name === 'ZodError') {
    return c.json({ success: false, error: { message: 'Validation failed', code: 'VALIDATION_ERROR', details: anyErr.errors } }, 400);
  }

  const msg = isDev ? err.message : `Internal server error (reference ${currentRequestId() ?? 'unknown'})`;
  return error(c, msg, 500, 'INTERNAL_ERROR');
}

/** The response code for errors mapped below, or null for an unexpected error. */
function isKnownError(anyErr: any): string | null {
  if (['ECONNREFUSED', 'ENOTFOUND', 'SERVICE_UNAVAILABLE', 'TIMEOUT'].includes(anyErr.code)) return 'SERVICE_UNAVAILABLE';
  if (anyErr.code === '23505') return 'CONFLICT';
  if (anyErr.code === '23503') return 'INVALID_REFERENCE';
  if (anyErr.code === '23502' || anyErr.code === '23514' || anyErr.name === 'ZodError') return 'VALIDATION_ERROR';
  return null;
}
