// src/middleware/error-handler.ts
import type { AppContext } from '@server/lib/hono';
import { AppError } from '../lib/errors';
import { error } from '../lib/response';
import { env } from '../config/env';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function errorHandler(err: Error, c: AppContext) {
  const isDev = env.NODE_ENV === 'development';
  console.error(`[${new Date().toISOString()}] ${c.req.method} ${c.req.path} →`, err.message);
  if (isDev) console.error(err.stack);

  if (err instanceof AppError) {
    return error(c, err.message, err.statusCode as unknown as ContentfulStatusCode, err.code);
  }

  const anyErr = err as any;

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

  const msg = isDev ? err.message : 'Internal server error';
  return error(c, msg, 500, 'INTERNAL_ERROR');
}
