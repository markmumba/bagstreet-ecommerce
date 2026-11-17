import { describe, expect, test } from 'bun:test';
import { isMpesaNumber, maskPhone, mpesaPhone } from './prompt-phone';

describe('phones', () => {
    test('only Safaricom-style mobile numbers can be prompted', () => {
        expect(isMpesaNumber('254712345678')).toBe(true);
        expect(isMpesaNumber('254112345678')).toBe(true);
        expect(isMpesaNumber('254202345678')).toBe(false);
        expect(isMpesaNumber('25471234567')).toBe(false);
    });
    test('typed numbers are normalised first', () => {
        expect(mpesaPhone('0712 345 678')).toBe('254712345678');
        expect(mpesaPhone('020 222 3333')).toBeNull();
        expect(mpesaPhone(undefined)).toBeNull();
    });
    test('masked for the payment screen', () => {
        expect(maskPhone('254712345678')).toBe('0712 ••• 678');
    });
});
