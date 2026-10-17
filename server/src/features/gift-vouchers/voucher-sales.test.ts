import { describe, expect, test } from 'bun:test';
import { voucherSaleEmails } from './voucher-sales';

const order = { id: 42, order_number: 'BS-TEST', customer_name: 'Wanjiku', customer_email: 'wanjiku@example.invalid' };
const voucher = { code: 'BGST-2345-6789-ABCD-EFGH', amount: 5000, expiresAt: new Date('2027-10-17T00:00:00Z') };
const toFriend = { deliver_to: 'RECIPIENT' as const, recipient_name: 'Amani', recipient_email: 'amani@example.invalid', message: 'Happy birthday' };

describe('voucherSaleEmails', () => {
    test('sent to a recipient: they get the code, the buyer a receipt without it', () => {
        const [code, receipt, ...rest] = voucherSaleEmails(toFriend, order, voucher);
        expect(rest).toEqual([]);
        expect(code).toMatchObject({ dedupeKey: 'gift-voucher:42', job: { type: 'GIFT_VOUCHER', to: 'amani@example.invalid', name: 'Amani', fromName: 'Wanjiku', forBuyer: false, message: 'Happy birthday' } });
        expect(receipt).toMatchObject({ dedupeKey: 'gift-voucher-receipt:42', job: { type: 'GIFT_VOUCHER_RECEIPT', to: 'wanjiku@example.invalid', recipient: 'Amani (amani@example.invalid)' } });
        expect(JSON.stringify(receipt)).not.toContain('BGST');
    });
    test('"email it to me": only the buyer gets the code', () => {
        const emails = voucherSaleEmails({ ...toFriend, deliver_to: 'BUYER' }, order, voucher);
        expect(emails).toHaveLength(1);
        expect(emails[0]).toMatchObject({ job: { type: 'GIFT_VOUCHER', to: 'wanjiku@example.invalid', forBuyer: true, fromName: null } });
    });
    test('the code never goes to two addresses', () => {
        for (const deliver_to of ['RECIPIENT', 'BUYER'] as const) {
            const withCode = voucherSaleEmails({ ...toFriend, deliver_to }, order, voucher).filter((e) => JSON.stringify(e).includes('BGST'));
            expect(withCode).toHaveLength(1);
        }
    });
});
