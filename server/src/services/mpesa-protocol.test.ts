import { describe, expect, test } from 'bun:test';
import {
    accountReference,
    darajaTimestamp,
    isMpesaNumber,
    maskPhone,
    outcomeOf,
    parseStkCallback,
    parseStkQuery,
    stkAmount,
    stkPassword,
} from './mpesa-protocol';

describe('darajaTimestamp', () => {
    test('is Kenyan time (UTC+3), crossing midnight', () => {
        expect(darajaTimestamp(new Date('2026-10-27T22:15:09Z'))).toBe('20261028011509');
    });
});

describe('stkPassword', () => {
    test('base64 of shortcode + passkey + timestamp', () => {
        expect(Buffer.from(stkPassword('174379', 'key', '20261027120000'), 'base64').toString()).toBe('174379key20261027120000');
    });
});

describe('stkAmount', () => {
    test('whole shillings, within the ±0.5 the payment check allows', () => {
        expect(stkAmount(4139.1)).toBe(4139);
        expect(stkAmount(4139.5)).toBe(4140);
        expect(stkAmount(0.2)).toBe(1);
    });
});

describe('phones', () => {
    test('only Safaricom-style mobile numbers can be prompted', () => {
        expect(isMpesaNumber('254712345678')).toBe(true);
        expect(isMpesaNumber('254112345678')).toBe(true);
        expect(isMpesaNumber('254202345678')).toBe(false);
        expect(isMpesaNumber('25471234567')).toBe(false);
    });
    test('masked for the payment screen', () => {
        expect(maskPhone('254712345678')).toBe('0712 ••• 678');
    });
});

test('accountReference fits Daraja\'s 12 characters', () => {
    expect(accountReference('BS-1A2B3C4D')).toBe('BS-1A2B3C4D');
    expect(accountReference('BS-1A2B3C4D5E6F').length).toBe(12);
});

describe('outcomeOf', () => {
    test('0 is paid, number or string', () => {
        expect(outcomeOf(0)).toEqual({ state: 'paid' });
        expect(outcomeOf('0')).toEqual({ state: 'paid' });
    });
    test('known failure gets a customer-facing reason', () => {
        expect(outcomeOf(1032, 'Request cancelled by user')).toEqual({
            state: 'failed', resultCode: '1032', reason: 'The payment request was cancelled on your phone.',
        });
    });
    test('unknown failure falls back to Safaricom\'s description', () => {
        expect(outcomeOf('9999', 'Something odd')).toMatchObject({ state: 'failed', reason: 'Something odd' });
    });
    test('missing code is pending', () => {
        expect(outcomeOf(undefined)).toEqual({ state: 'pending' });
    });
});

describe('parseStkCallback', () => {
    test('successful payment with metadata', () => {
        const cb = parseStkCallback({
            Body: {
                stkCallback: {
                    MerchantRequestID: '29115-34620561-1',
                    CheckoutRequestID: 'ws_CO_191220191020363925',
                    ResultCode: 0,
                    ResultDesc: 'The service request is processed successfully.',
                    CallbackMetadata: {
                        Item: [
                            { Name: 'Amount', Value: 1.0 },
                            { Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
                            { Name: 'TransactionDate', Value: 20191219102115 },
                            { Name: 'PhoneNumber', Value: 254708374149 },
                        ],
                    },
                },
            },
        });
        expect(cb).toMatchObject({
            checkoutRequestId: 'ws_CO_191220191020363925',
            outcome: { state: 'paid' },
            amount: 1,
            receipt: 'NLJ7RT61SV',
            phone: '254708374149',
        });
    });
    test('cancelled: no metadata', () => {
        const cb = parseStkCallback({
            Body: { stkCallback: { MerchantRequestID: 'm', CheckoutRequestID: 'ws_CO_1', ResultCode: 1032, ResultDesc: 'Request cancelled by user' } },
        });
        expect(cb).toMatchObject({ outcome: { state: 'failed', resultCode: '1032' }, amount: null, receipt: null });
    });
    test('not a callback', () => {
        expect(parseStkCallback({ hello: 1 })).toBeNull();
        expect(parseStkCallback(null)).toBeNull();
    });
});

describe('parseStkQuery', () => {
    test('still on the PIN screen is pending, not a failure', () => {
        expect(parseStkQuery({ requestId: 'x', errorCode: '500.001.1001', errorMessage: 'The transaction is being processed' }))
            .toMatchObject({ outcome: { state: 'pending' } });
    });
    test('4999 "still under processing" is pending — Safaricom says it even after the paid callback', () => {
        expect(parseStkQuery({ ResponseCode: '0', ResultCode: '4999', ResultDesc: 'The transaction is still under processing' }))
            .toMatchObject({ outcome: { state: 'pending' } });
    });
    test('result', () => {
        expect(parseStkQuery({ ResponseCode: '0', ResultCode: '0', ResultDesc: 'ok' })).toMatchObject({ outcome: { state: 'paid' } });
        expect(parseStkQuery({ ResponseCode: '0', ResultCode: '2001', ResultDesc: 'wrong pin' }))
            .toMatchObject({ outcome: { state: 'failed', resultCode: '2001' } });
    });
    test('other errors are not understood', () => {
        expect(parseStkQuery({ errorCode: '400.002.02', errorMessage: 'Bad Request - Invalid CheckoutRequestID' })).toBeNull();
    });
});
