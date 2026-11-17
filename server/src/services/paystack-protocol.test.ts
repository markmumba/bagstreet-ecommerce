import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import {
    PROMPT_LIFETIME_MS,
    chargeReference,
    failureReason,
    isValidWebhookSignature,
    outcomeOfTransaction,
    paystackPhone,
    toSubunits,
} from './paystack-protocol';

describe('toSubunits', () => {
    test('cents, from whole shillings (M-Pesa takes no cents)', () => {
        expect(toSubunits(4000)).toBe(400000);
        expect(toSubunits(4139.4)).toBe(413900);
        expect(toSubunits(0.2)).toBe(100);
    });
});

test('paystackPhone adds the plus', () => {
    expect(paystackPhone('254712345678')).toBe('+254712345678');
    expect(paystackPhone('+254712345678')).toBe('+254712345678');
});

test('chargeReference is unique per attempt and uses allowed characters only', () => {
    const a = chargeReference('BS-0F5C1D15', 1_700_000_000_000);
    const b = chargeReference('BS-0F5C1D15', 1_700_000_000_001);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^BS-0F5C1D15-[a-z0-9]+$/);
    expect(chargeReference('BS 1/2')).toMatch(/^BS12-/);
});

describe('outcomeOfTransaction', () => {
    test('success: amount back in shillings, with receipt when given', () => {
        expect(outcomeOfTransaction({ status: 'success', amount: 400000, currency: 'KES', receipt_number: 'TKA1B2C3D4' }, 0))
            .toEqual({ state: 'paid', amount: 4000, currency: 'KES', receipt: 'TKA1B2C3D4' });
        expect(outcomeOfTransaction({ status: 'success', amount: 400000, currency: 'KES', receipt_number: null }, 0))
            .toMatchObject({ receipt: null });
    });
    test('failed and reversed are failures with a readable reason', () => {
        expect(outcomeOfTransaction({ status: 'failed', gateway_response: 'Request cancelled by user' }, 0))
            .toEqual({ state: 'failed', reason: 'The payment request was cancelled on your phone.' });
        expect(outcomeOfTransaction({ status: 'reversed', gateway_response: 'Reversed' }, 0)).toMatchObject({ state: 'failed' });
    });
    test('abandoned is pending until the customer\'s time is up', () => {
        expect(outcomeOfTransaction({ status: 'abandoned' }, 60_000)).toEqual({ state: 'pending' });
        expect(outcomeOfTransaction({ status: 'abandoned' }, PROMPT_LIFETIME_MS + 1)).toMatchObject({ state: 'failed' });
    });
    test('ongoing and pending are pending', () => {
        expect(outcomeOfTransaction({ status: 'ongoing' }, 0)).toEqual({ state: 'pending' });
        expect(outcomeOfTransaction({ status: 'pending' }, 0)).toEqual({ state: 'pending' });
    });
    test('nonsense is not understood', () => {
        expect(outcomeOfTransaction(null, 0)).toBeNull();
        expect(outcomeOfTransaction({ status: 'success', amount: 'x' }, 0)).toBeNull();
    });
});

test('failureReason falls back to Paystack\'s text, then a generic one', () => {
    expect(failureReason('Insufficient balance')).toBe('Your M-Pesa balance was too low for this payment.');
    expect(failureReason('Something odd')).toBe('Something odd');
    expect(failureReason(undefined)).toBe('The M-Pesa payment was not completed.');
});

describe('isValidWebhookSignature', () => {
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'BS-1-abc' } });
    const now = 1_800_000_000;
    const signingSecret = 'whsec_test_secret';
    const secretKey = 'sk_test_secret';
    const signed = (t: number, secret = signingSecret) =>
        `t=${t},v1=whk_1:${createHmac('sha512', secret).update(`${t}.${body}`).digest('hex')}`;
    const legacy = createHmac('sha512', secretKey).update(body).digest('hex');

    test('timestamped signature', () => {
        expect(isValidWebhookSignature({ rawBody: body, signatureHeader: signed(now), signingSecret, nowSeconds: now })).toBe(true);
    });
    test('a rotated key: any v1 may match', () => {
        const header = `${signed(now)},v1=whk_0:${'ab'.repeat(64)}`;
        expect(isValidWebhookSignature({ rawBody: body, signatureHeader: header, signingSecret, nowSeconds: now })).toBe(true);
    });
    test('too old, wrong secret, or altered body is rejected', () => {
        expect(isValidWebhookSignature({ rawBody: body, signatureHeader: signed(now - 301), signingSecret, nowSeconds: now })).toBe(false);
        expect(isValidWebhookSignature({ rawBody: body, signatureHeader: signed(now, 'whsec_other'), signingSecret, nowSeconds: now })).toBe(false);
        expect(isValidWebhookSignature({ rawBody: `${body} `, signatureHeader: signed(now), signingSecret, nowSeconds: now })).toBe(false);
    });
    test('legacy x-paystack-signature', () => {
        expect(isValidWebhookSignature({ rawBody: body, legacySignatureHeader: legacy, secretKey })).toBe(true);
        expect(isValidWebhookSignature({ rawBody: body, legacySignatureHeader: legacy, secretKey: 'sk_test_other' })).toBe(false);
    });
    test('no secrets configured: nothing is accepted', () => {
        expect(isValidWebhookSignature({ rawBody: body, signatureHeader: signed(now), legacySignatureHeader: legacy, nowSeconds: now })).toBe(false);
    });
});
