// src/middleware/error-handler.ts
import type { Context } from 'hono';
import { AppError } from '../lib/errors';
import { error } from '../lib/response';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function errorHandler(err: Error, c: Context) {
  console.error(`[${new Date().toISOString()}] Error:`, err);

  if (err instanceof AppError) {
    return error(c, err.message, err.statusCode as unknown as ContentfulStatusCode, err.code);
  }

  // PostgreSQL errors
  const pgError = err as any;
  
  // Unique constraint violation
  if (pgError.code === '23505') {
    const field = pgError.constraint_name?.replace('_key', '').replace('categories_', '');
    return error(c, `${field || 'Resource'} already exists`, 409, 'CONFLICT');
  }

  // Foreign key violation
  if (pgError.code === '23503') {
    return error(c, 'Related resource not found', 400, 'INVALID_REFERENCE');
  }

  // Not null violation
  if (pgError.code === '23502') {
    return error(c, `Required field missing: ${pgError.column_name}`, 400, 'VALIDATION_ERROR');
  }

  // Check constraint violation
  if (pgError.code === '23514') {
    return error(c, 'Invalid data: constraint violation', 400, 'VALIDATION_ERROR');
  }

  // Validation errors from Zod
  if (err.name === 'ZodError') {
    const zodError = err as any;
    return c.json({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: zodError.errors,
      },
    }, 400);
  }

  // Default error
  return error(c, 'Internal server error', 500, 'INTERNAL_ERROR');
}