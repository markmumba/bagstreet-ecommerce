import { describe, expect, test } from 'bun:test';
import { isTrustedRequest, requestOrigin } from './origin-guard';

const allowed = ['https://shop.example.com', 'https://admin.example.com'];

describe('requestOrigin', () => {
    test('prefers the Origin header', () => {
        expect(requestOrigin('https://shop.example.com', 'https://evil.example/x')).toBe('https://shop.example.com');
    });
    test('falls back to the origin of Referer', () => {
        expect(requestOrigin(undefined, 'https://shop.example.com/checkout?x=1')).toBe('https://shop.example.com');
    });
    test('treats the opaque "null" origin and junk referers as unknown', () => {
        expect(requestOrigin('null', 'https://shop.example.com/')).toBeNull();
        expect(requestOrigin(undefined, 'not a url')).toBeNull();
        expect(requestOrigin(undefined, undefined)).toBeNull();
    });
});

describe('isTrustedRequest', () => {
    test('lets safe methods through from anywhere', () => {
        expect(isTrustedRequest('GET', { origin: 'https://evil.example' }, allowed)).toBe(true);
        expect(isTrustedRequest('OPTIONS', {}, allowed)).toBe(true);
    });
    test('allows writes from an allowed origin', () => {
        expect(isTrustedRequest('POST', { origin: 'https://admin.example.com' }, allowed)).toBe(true);
        expect(isTrustedRequest('post', { referer: 'https://shop.example.com/login' }, allowed)).toBe(true);
    });
    test('rejects writes from a foreign or look-alike origin', () => {
        expect(isTrustedRequest('POST', { origin: 'https://evil.example' }, allowed)).toBe(false);
        expect(isTrustedRequest('POST', { origin: 'https://shop.example.com.evil.example' }, allowed)).toBe(false);
        expect(isTrustedRequest('POST', { origin: 'http://shop.example.com' }, allowed)).toBe(false);
    });
    test('rejects writes with no usable origin', () => {
        expect(isTrustedRequest('POST', {}, allowed)).toBe(false);
        expect(isTrustedRequest('DELETE', { origin: 'null' }, allowed)).toBe(false);
    });
});
