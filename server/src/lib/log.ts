/**
 * Application logging: one JSON object per line on stdout/stderr, so `docker compose logs api`
 * can be filtered with jq. In development the same entries print as short readable lines.
 *
 * Every entry written while a request is being handled carries that request's id (see
 * middleware/request-log.ts), so one customer's "it failed" can be traced to its log lines.
 *
 * Keep personal data out of `fields`: log ids (order_id, user_id), not phone numbers or emails.
 *
 * Reads process.env directly (not config/env) so config loading can log too.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

type RequestScope = { requestId: string; fields: LogFields };

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const requestScope = new AsyncLocalStorage<RequestScope>();

function configuredLevel(): LogLevel {
    const level = process.env.LOG_LEVEL?.toLowerCase();
    return level && level in LEVELS ? (level as LogLevel) : 'info';
}

function useJson(): boolean {
    const format = process.env.LOG_FORMAT?.toLowerCase();
    if (format === 'json') return true;
    if (format === 'pretty') return false;
    return process.env.NODE_ENV === 'production';
}

/** An Error (or anything thrown) as plain fields, stack included. */
export function serializeError(err: unknown): LogFields {
    if (!(err instanceof Error)) return { message: String(err) };
    const anyErr = err as any;
    const out: LogFields = { name: err.name, message: err.message };
    if (anyErr.code !== undefined) out.code = anyErr.code;
    if (anyErr.statusCode !== undefined) out.status = anyErr.statusCode;
    if (err.stack) out.stack = err.stack;
    if (err.cause !== undefined) out.cause = serializeError(err.cause);
    return out;
}

/** Builds the entry written for a log call. Exported for tests. */
export function buildEntry(level: LogLevel, msg: string, fields: LogFields = {}, now = new Date()): LogFields {
    const scope = requestScope.getStore();
    const entry: LogFields = { time: now.toISOString(), level, msg };
    if (scope) entry.request_id = scope.requestId;
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        entry[key] = key === 'err' ? serializeError(value) : value;
    }
    return entry;
}

function safeStringify(entry: LogFields): string {
    try {
        return JSON.stringify(entry);
    } catch {
        return JSON.stringify({ time: entry.time, level: entry.level, msg: entry.msg, log_error: 'fields not serializable' });
    }
}

function pretty(entry: LogFields): string {
    const { time, level, msg, request_id, err, ...rest } = entry as LogFields & { err?: LogFields };
    const clock = String(time).slice(11, 19);
    const id = request_id ? ` ${String(request_id).slice(0, 8)}` : '';
    const extras = Object.keys(rest).length ? ` ${safeStringify(rest)}` : '';
    const stack = err ? `\n  ${err.stack ?? err.message}` : '';
    return `${clock} ${String(level).toUpperCase().padEnd(5)}${id} ${msg}${extras}${stack}`;
}

function write(level: LogLevel, msg: string, fields?: LogFields) {
    if (LEVELS[level] < LEVELS[configuredLevel()]) return;
    const entry = buildEntry(level, msg, fields);
    const line = useJson() ? safeStringify(entry) : pretty(entry);
    if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
}

export const log = {
    debug: (msg: string, fields?: LogFields) => write('debug', msg, fields),
    info: (msg: string, fields?: LogFields) => write('info', msg, fields),
    warn: (msg: string, fields?: LogFields) => write('warn', msg, fields),
    /** Pass the thrown value as `err` to get its stack trace. */
    error: (msg: string, fields?: LogFields) => write('error', msg, fields),
};

/** Runs `fn` with log entries tagged by this request id. */
export function withRequestScope<T>(requestId: string, fn: () => T): T {
    return requestScope.run({ requestId, fields: {} }, fn);
}

/** The id of the request being handled, if any. */
export function currentRequestId(): string | undefined {
    return requestScope.getStore()?.requestId;
}

/** Adds fields to the current request's summary line (for example the error code it ended with). */
export function annotateRequest(fields: LogFields) {
    const scope = requestScope.getStore();
    if (scope) Object.assign(scope.fields, fields);
}

/** Fields added with annotateRequest during the current request. */
export function requestAnnotations(): LogFields {
    return requestScope.getStore()?.fields ?? {};
}
