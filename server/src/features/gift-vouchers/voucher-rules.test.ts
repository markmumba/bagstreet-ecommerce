import { describe, expect, test } from 'bun:test';
import {
    VOUCHER_CODE_LENGTH, evaluateVoucher, expiryAfterGiveBack, formatVoucherCode, generateVoucherCode,
    hashVoucherCode, normaliseVoucherCode, voucherExpiryFrom, voucherStatus,
} from './voucher-rules';

const day = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 14, 9, 0, 0);
const live = { balance: 5000, expires_at: new Date(now + 30 * day), voided_at: null };

describe('voucher codes', () => {
    test('a new code is BGST plus 16 random characters in groups of four', () => {
        const code = generateVoucherCode();
        expect(code).toMatch(/^BGST(-[2-9A-HJ-NP-Z]{4}){4}$/);
        expect(normaliseVoucherCode(code)).toHaveLength(VOUCHER_CODE_LENGTH);
    });

    test('codes are random', () => {
        const codes = new Set(Array.from({ length: 200 }, () => generateVoucherCode()));
        expect(codes.size).toBe(200);
    });

    test('a code typed with spaces, lower case or without the prefix is the same code', () => {
        const code = generateVoucherCode();
        const bare = normaliseVoucherCode(code)!;
        expect(normaliseVoucherCode(code.toLowerCase())).toBe(bare);
        expect(normaliseVoucherCode(code.replaceAll('-', ' '))).toBe(bare);
        expect(normaliseVoucherCode(bare)).toBe(bare);
        expect(formatVoucherCode(bare)).toBe(code);
    });

    test('anything that is not a voucher code is rejected before it reaches the database', () => {
        expect(normaliseVoucherCode('')).toBeNull();
        expect(normaliseVoucherCode('SUMMER10')).toBeNull();
        expect(normaliseVoucherCode('BGST-0000-1111-OOOO-IIII')).toBeNull();
    });

    test('the stored hash is stable and never the code itself', () => {
        const bare = normaliseVoucherCode(generateVoucherCode())!;
        expect(hashVoucherCode(bare)).toBe(hashVoucherCode(bare));
        expect(hashVoucherCode(bare)).not.toContain(bare);
        expect(hashVoucherCode(bare)).toHaveLength(64);
    });
});

describe('voucher status', () => {
    test('active while it has a balance and has not expired', () => {
        expect(voucherStatus(live, now)).toBe('active');
    });
    test('used up at zero balance', () => {
        expect(voucherStatus({ ...live, balance: 0 }, now)).toBe('used');
    });
    test('expired after its expiry date', () => {
        expect(voucherStatus({ ...live, expires_at: new Date(now - 1) }, now)).toBe('expired');
    });
    test('voided wins over everything else', () => {
        expect(voucherStatus({ ...live, voided_at: new Date(now - day), expires_at: new Date(now - 1) }, now)).toBe('voided');
    });
});

describe('evaluateVoucher', () => {
    test('an unknown code is refused', () => {
        expect(evaluateVoucher(undefined, now)).toEqual({ ok: false, reason: 'Gift voucher not found' });
    });
    test('a live voucher offers its whole balance', () => {
        expect(evaluateVoucher(live, now)).toEqual({ ok: true, available: 5000 });
    });
    test('a cancelled, expired or empty voucher is refused with the reason', () => {
        expect(evaluateVoucher({ ...live, voided_at: new Date(now) }, now)).toEqual({ ok: false, reason: 'This gift voucher has been cancelled' });
        expect(evaluateVoucher({ ...live, expires_at: new Date(Date.UTC(2026, 9, 1)) }, now)).toEqual({ ok: false, reason: 'This gift voucher expired on 1 Oct 2026' });
        expect(evaluateVoucher({ ...live, balance: '0.00' }, now)).toEqual({ ok: false, reason: 'This gift voucher has no balance left' });
    });
});

describe('expiry', () => {
    test('a voucher is valid for one year from issue', () => {
        expect(voucherExpiryFrom(new Date(Date.UTC(2026, 9, 14))).toISOString()).toBe('2027-10-14T00:00:00.000Z');
    });
    test('money given back to an expired voucher keeps it usable for 30 more days', () => {
        expect(expiryAfterGiveBack(new Date(now - day), now).getTime()).toBe(now + 30 * day);
    });
    test('a voucher with plenty of time left keeps its expiry', () => {
        const later = new Date(now + 200 * day);
        expect(expiryAfterGiveBack(later, now).getTime()).toBe(later.getTime());
    });
});
