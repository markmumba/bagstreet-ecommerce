import { describe, expect, test } from 'bun:test';
import { afterFailure, describeError, MAX_ATTEMPTS, RETRY_DELAYS_MS } from './email-outbox-policy';

const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);

describe('afterFailure', () => {
    test('first failure → retry in 1 minute', () => {
        const r = afterFailure(1, NOW);
        expect(r.status).toBe('PENDING');
        expect(r.status === 'PENDING' && r.nextAttemptAt.getTime() - NOW).toBe(60_000);
    });
    test('delays grow with each failure', () => {
        const delays = [1, 2, 3, 4, 5].map((n) => {
            const r = afterFailure(n, NOW);
            return r.status === 'PENDING' ? r.nextAttemptAt.getTime() - NOW : -1;
        });
        expect(delays).toEqual([...RETRY_DELAYS_MS]);
    });
    test('gives up after the last attempt', () => {
        expect(afterFailure(MAX_ATTEMPTS, NOW).status).toBe('FAILED');
        expect(afterFailure(MAX_ATTEMPTS + 3, NOW).status).toBe('FAILED');
    });
    test('six attempts in total, spread over roughly seven and a half hours', () => {
        expect(MAX_ATTEMPTS).toBe(6);
        expect(RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)).toBe((1 + 5 + 15 + 60 + 360) * 60_000);
    });
});

describe('describeError', () => {
    test('keeps the error type and message', () => {
        expect(describeError(new Error('SMTP 421 try later'))).toBe('Error: SMTP 421 try later');
    });
    test('masks anything that looks like a credential', () => {
        expect(describeError(new Error('auth failed password=hunter2 token=abc'))).toBe('Error: auth failed password=*** token=***');
    });
    test('trims very long errors', () => {
        expect(describeError('x'.repeat(5000))).toHaveLength(1000);
    });
});
