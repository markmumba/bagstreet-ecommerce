import { describe, expect, test } from 'bun:test';
import { judgeRefreshToken } from './refresh-policy';

describe('judgeRefreshToken', () => {
    test('an unknown token is refused', () => {
        expect(judgeRefreshToken(undefined)).toBe('invalid');
    });

    test('an expired token is refused, used or not', () => {
        expect(judgeRefreshToken({ expired: true, used: false, recentlyUsed: false })).toBe('invalid');
        expect(judgeRefreshToken({ expired: true, used: true, recentlyUsed: false })).toBe('invalid');
    });

    test('first use rotates', () => {
        expect(judgeRefreshToken({ expired: false, used: false, recentlyUsed: false })).toBe('rotate');
    });

    test('a second use moments later is the same browser (two tabs)', () => {
        expect(judgeRefreshToken({ expired: false, used: true, recentlyUsed: true })).toBe('concurrent');
    });

    test('a used token presented again later is reuse', () => {
        expect(judgeRefreshToken({ expired: false, used: true, recentlyUsed: false })).toBe('reuse');
    });
});
