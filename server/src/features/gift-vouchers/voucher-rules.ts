/**
 * Gift voucher rules (CONTEXT.md › Gift vouchers). Pure: codes, status and whether a voucher can
 * pay. The database side (balances, holds, movements) lives in gift-vouchers.queries.ts.
 */
import { createHash, randomInt } from 'node:crypto';
import { roundMoney } from '../../lib/pricing';

/** No 0/O or 1/I, so a code read off a card can't be mistyped into another valid code. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const PREFIX = 'BGST';
/** Random characters per code: 32^16 = 2^80, far too many to guess or to brute-force from the hashes. */
export const VOUCHER_CODE_LENGTH = 16;
/**
 * Paid vouchers are valid for one year, stated before purchase and on the voucher (owner decision,
 * 14 Oct 2026; counsel to confirm under Kenyan consumer law). Free promotional codes are discount codes.
 */
export const VOUCHER_VALID_MONTHS = 12;
/** Money given back to a voucher that has (nearly) expired stays usable at least this long. */
export const VOUCHER_GIVE_BACK_DAYS = 30;

export interface VoucherRuleRow {
    balance: number | string;
    expires_at: string | Date;
    voided_at: string | Date | null;
}

export type VoucherStatus = 'active' | 'used' | 'expired' | 'voided';

export const VOUCHER_NOT_FOUND = 'Gift voucher not found';

export type VoucherVerdict =
    | { ok: true; available: number }
    | { ok: false; reason: string };

/** A new code, formatted for printing: `BGST-XXXX-XXXX-XXXX-XXXX`. */
export function generateVoucherCode(): string {
    let bare = '';
    for (let i = 0; i < VOUCHER_CODE_LENGTH; i++) bare += ALPHABET[randomInt(ALPHABET.length)];
    return formatVoucherCode(bare);
}

/**
 * The 16 random characters of a typed code, however it was typed (lower case, spaces, with or
 * without dashes or the BGST prefix); null when it can't be a voucher code.
 */
export function normaliseVoucherCode(input: string): string | null {
    let bare = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (bare.length === PREFIX.length + VOUCHER_CODE_LENGTH && bare.startsWith(PREFIX)) bare = bare.slice(PREFIX.length);
    if (bare.length !== VOUCHER_CODE_LENGTH) return null;
    for (const char of bare) if (!ALPHABET.includes(char)) return null;
    return bare;
}

export function formatVoucherCode(bare: string): string {
    return [PREFIX, ...bare.match(/.{4}/g)!].join('-');
}

/** What the database stores and looks codes up by. */
export function hashVoucherCode(bare: string): string {
    return createHash('sha256').update(`gift-voucher:${bare}`).digest('hex');
}

export function voucherStatus(voucher: VoucherRuleRow, now: number = Date.now()): VoucherStatus {
    if (voucher.voided_at) return 'voided';
    if (new Date(voucher.expires_at).getTime() <= now) return 'expired';
    if (roundMoney(Number(voucher.balance)) <= 0) return 'used';
    return 'active';
}

/** Can this voucher pay right now, and how much? */
export function evaluateVoucher(voucher: VoucherRuleRow | undefined, now: number = Date.now()): VoucherVerdict {
    if (!voucher) return { ok: false, reason: VOUCHER_NOT_FOUND };
    switch (voucherStatus(voucher, now)) {
        case 'voided': return { ok: false, reason: 'This gift voucher has been cancelled' };
        case 'expired': return { ok: false, reason: `This gift voucher expired on ${formatDate(voucher.expires_at)}` };
        case 'used': return { ok: false, reason: 'This gift voucher has no balance left' };
        case 'active': return { ok: true, available: roundMoney(Number(voucher.balance)) };
    }
}

/** A voucher issued now is valid for one year. */
export function voucherExpiryFrom(issuedAt: Date): Date {
    const expiry = new Date(issuedAt);
    expiry.setUTCMonth(expiry.getUTCMonth() + VOUCHER_VALID_MONTHS);
    return expiry;
}

/**
 * The expiry after money goes back onto a voucher (a refund, or an order cancelled after it was
 * paid): never less than 30 days away, so the customer can actually spend it.
 */
export function expiryAfterGiveBack(expiresAt: string | Date, now: number = Date.now()): Date {
    const floor = now + VOUCHER_GIVE_BACK_DAYS * 24 * 60 * 60 * 1000;
    return new Date(Math.max(new Date(expiresAt).getTime(), floor));
}

function formatDate(value: string | Date): string {
    return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' });
}
