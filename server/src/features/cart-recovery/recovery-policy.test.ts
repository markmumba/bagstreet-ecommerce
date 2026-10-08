import { describe, expect, test } from 'bun:test';
import { dueRecoveryStage, FIRST_REMINDER_MS, FOLLOWUP_REMINDER_MS, RECOVERY_TTL_MS, recoverySelectionKey, withinRecoveryBudget } from './recovery-policy';
import { hashRecoveryToken, recoverySourceToken, recoveryToken, unsubscribeToken, verifyRecoverySourceToken } from './recovery-token';

const now = Date.UTC(2026, 9, 8, 12);
const input = { lastActivity: now - FIRST_REMINDER_MS, expiresAt: now + RECOVERY_TTL_MS, stage: 0, optedIn: true, blocked: false, followup: false };

describe('cart recovery policy', () => {
    test('JSONB key and row order do not count as cart activity', () => {
        expect(recoverySelectionKey([{ variant_id: 1, quantity: 2 }, { variant_id: 3, quantity: 1 }]))
            .toBe(recoverySelectionKey([{ quantity: 1, variant_id: 3 }, { quantity: 2, variant_id: 1 }]));
    });
    test('does not send at stock expiry or just before two hours', () => {
        expect(dueRecoveryStage({ ...input, lastActivity: now - 45 * 60_000 }, now)).toBeNull();
        expect(dueRecoveryStage({ ...input, lastActivity: now - FIRST_REMINDER_MS + 1 }, now)).toBeNull();
        expect(dueRecoveryStage(input, now)).toBe(1);
    });
    test('suppresses opt-out, completed/pending checkout and expired snapshots', () => {
        expect(dueRecoveryStage({ ...input, optedIn: false }, now)).toBeNull();
        expect(dueRecoveryStage({ ...input, blocked: true }, now)).toBeNull();
        expect(dueRecoveryStage({ ...input, expiresAt: now }, now)).toBeNull();
    });
    test('24-hour follow-up is optional, once only, and cannot precede the first reminder', () => {
        const second = { ...input, lastActivity: now - FOLLOWUP_REMINDER_MS, stage: 1 };
        expect(dueRecoveryStage(second, now)).toBeNull();
        expect(dueRecoveryStage({ ...second, followup: true }, now)).toBe(2);
        expect(dueRecoveryStage({ ...second, followup: true, stage: 2 }, now)).toBeNull();
        expect(dueRecoveryStage({ ...second, followup: true, stage: 0 }, now)).toBe(1);
    });
    test('new customer activity restarts the inactivity clock', () => {
        expect(dueRecoveryStage({ ...input, lastActivity: now - 1000 }, now)).toBeNull();
    });
    test('caps reminders across devices and spaces sends by two hours', () => {
        expect(withinRecoveryBudget({ windowStart: null, count: 0, lastSent: null }, now)).toBe(true);
        expect(withinRecoveryBudget({ windowStart: now - 1000, count: 2, lastSent: now - FIRST_REMINDER_MS }, now)).toBe(false);
        expect(withinRecoveryBudget({ windowStart: now - RECOVERY_TTL_MS, count: 2, lastSent: now - FIRST_REMINDER_MS }, now)).toBe(true);
        expect(withinRecoveryBudget({ windowStart: now, count: 1, lastSent: now - FIRST_REMINDER_MS + 1 }, now)).toBe(false);
    });
});

describe('opaque recovery tokens', () => {
    const secret = 'a-test-secret-that-is-long-enough-123';
    const id = '79a06622-9f70-4d46-bd4a-9e05b053b727';
    const expires = new Date(now + RECOVERY_TTL_MS).toISOString();
    test('is reproducible for delivery but reveals no account or order identifier', () => {
        const token = recoveryToken(secret, id, 1, expires);
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(token).not.toContain(id);
        expect(hashRecoveryToken(token)).toHaveLength(64);
        expect(recoveryToken(secret, id, 1, expires)).toBe(token);
    });
    test('activity/version changes, expiry, purpose and key rotation invalidate old tokens', () => {
        const token = recoveryToken(secret, id, 1, expires);
        expect(recoveryToken(secret, id, 2, expires)).not.toBe(token);
        expect(recoveryToken(secret, id, 1, new Date(now).toISOString())).not.toBe(token);
        expect(recoveryToken(secret + 'new', id, 1, expires)).not.toBe(token);
        expect(unsubscribeToken(secret, id)).not.toBe(token);
    });
    test('checkout provenance cookie is signed, scoped and expiring', () => {
        const token = recoverySourceToken(secret, 123, now + 60_000);
        expect(verifyRecoverySourceToken(secret, token, now)).toBe(123);
        expect(verifyRecoverySourceToken(secret, token.replace('123.', '124.'), now)).toBeNull();
        expect(verifyRecoverySourceToken(secret, token, now + 60_000)).toBeNull();
        expect(verifyRecoverySourceToken(secret + 'new', token, now)).toBeNull();
        expect(verifyRecoverySourceToken(secret, token + '.extra', now)).toBeNull();
        expect(verifyRecoverySourceToken(secret, undefined, now)).toBeNull();
    });
});
