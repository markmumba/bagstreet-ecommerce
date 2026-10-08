import { describe, expect, test } from 'bun:test';
import { csv, monthSchema, monthWindow } from './compliance.policy';
import { redactAuditSecrets } from '../../lib/audit-redaction';
import { createOrderSchema } from '../orders/orders.schema';
import { POLICY_VERSION, LEGAL_POLICIES } from 'shared/dist';
import { agreementText } from './order-agreement';
import { renderEmailTemplate } from '../../lib/template';

describe('compliance controls', () => {
    test('monthly records use Nairobi boundaries, including year rollover', () => {
        expect(monthWindow('2026-12')).toEqual({ start: '2026-11-30T21:00:00.000Z', end: '2026-12-31T21:00:00.000Z' });
        expect(monthWindow('2024-02').end).toBe('2024-02-29T21:00:00.000Z');
    });
    test('rejects malformed or out-of-range month inputs', () => {
        for (const value of ['2026-00','2026-13','2026-1','2099-12; DROP TABLE users','1800-01']) expect(monthSchema.safeParse(value).success).toBe(false);
    });
    test('CSV escapes quoting, separators and formulas without losing numbers', () => {
        const result = csv([{ name: 'a,"b"', formula: '\t=CMD()', number: -4, reference: '+danger', date: new Date('2026-10-08T00:00:00Z') }], ['name','formula','number','reference','date']);
        expect(result).toContain('"a,""b"""');
        expect(result).toContain('"\'\t=CMD()"');
        expect(result).toContain('"-4"');
        expect(result).toContain('"\'+danger"');
        expect(result).toContain('2026-10-08T00:00:00.000Z');
    });
    test('empty exports retain headers', () => expect(csv([], ['order_number','amount'])).toBe('"order_number","amount"\r\n'));
    test('audit redacts nested credentials but keeps operational evidence', () => {
        expect(redactAuditSecrets({ password_hash: 'hash', items: [{ access_token: 'private', amount: 50 }], metadata: { Authorization: 'Bearer secret', status: 'PAID' } }))
            .toEqual({ password_hash: '[redacted]', items: [{ access_token: '[redacted]', amount: 50 }], metadata: { Authorization: '[redacted]', status: 'PAID' } });
    });
    const order = { items: [{ variant_id: 1, quantity: 1 }], shipping_location_id: 1, phone: '0798123456', email: 'test@example.invalid',
        shipping_address: { full_name: 'Test Customer', address_line1: 'Test Street', city: 'Nairobi', county: 'Nairobi' } };
    test('online checkout requires explicit acceptance of the current version', () => {
        expect(createOrderSchema.safeParse(order).success).toBe(false);
        expect(createOrderSchema.safeParse({ ...order, policy_acceptance: { accepted: false, version: POLICY_VERSION } }).success).toBe(false);
        expect(createOrderSchema.safeParse({ ...order, policy_acceptance: { accepted: true, version: 'old-version' } }).success).toBe(false);
        expect(createOrderSchema.safeParse({ ...order, policy_acceptance: { accepted: true, version: POLICY_VERSION } }).success).toBe(true);
    });
    test('policy archive includes privacy and statutory returns safeguards', () => {
        expect(LEGAL_POLICIES.returns.sections.map(section => section[1]).join(' ')).toContain('do not limit');
        expect(LEGAL_POLICIES.privacy.sections.map(section => section[1]).join(' ')).toContain('separate, optional opt-in');
        expect(LEGAL_POLICIES.cookies.sections.map(section => section[1]).join(' ')).toContain('do not currently use advertising');
    });
    test('agreement copy preserves the original order and escaped policy content, without claiming payment', async () => {
        const agreement = agreementText({ policies: LEGAL_POLICIES, order: {
            number: 'BS-TEST', submitted_at: '2026-10-08T00:00:00Z', customer: '<script>customer</script>', email: 'test@example.invalid',
            address: { full_name: 'Test Customer', city: 'Nairobi' }, notes: null, total: 1100, shipping: 100, discount: 0,
            items: [{ name: 'Test tote', sku: 'TOTE', size: null, color: 'Black', quantity: 1, unit_price: 1000 }],
        } }, POLICY_VERSION);
        expect(agreement).toContain('Total: KES 1,100.00');
        expect(agreement).toContain('not proof of payment');
        expect(agreement).toContain('24 hours of dispatch');
        const html = await renderEmailTemplate('order-agreement', { title: 'Copy', preheader: 'Agreement', year: '2026', storefrontUrl: 'https://example.com', orderRef: 'BS-TEST', agreement });
        expect(html).toContain('&lt;script&gt;customer&lt;/script&gt;');
        expect(html).not.toContain('<script>');
        expect(html).not.toMatch(/\{\{\w+\}\}/);
    });
});
