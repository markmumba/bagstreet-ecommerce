import { describe, expect, test } from 'bun:test';
import { REDACTED_CODE, redactDeliveredJob, sendEmailJob, type EmailJob } from './email-jobs';

const voucherEmail: EmailJob = {
    type: 'GIFT_VOUCHER', to: 'amani@example.invalid', name: 'Amani', code: 'BGST-2345-6789-ABCD-EFGH',
    amount: 5000, expiresAt: '2027-10-17T00:00:00.000Z', fromName: 'Wanjiku', message: null, forBuyer: false,
};

describe('redactDeliveredJob', () => {
    test('a sent gift voucher email no longer stores the code', () => {
        const redacted = redactDeliveredJob(voucherEmail);
        expect(redacted).toMatchObject({ type: 'GIFT_VOUCHER', to: 'amani@example.invalid', code: REDACTED_CODE });
        expect(JSON.stringify(redacted)).not.toContain('BGST-2345');
    });
    test('other emails are kept as they are, and redacting twice changes nothing', () => {
        expect(redactDeliveredJob({ type: 'PASSWORD_RESET', to: 'a@example.invalid', name: 'A', resetUrl: 'x' })).toBeNull();
        expect(redactDeliveredJob(redactDeliveredJob(voucherEmail)!)).toBeNull();
    });
    test('a redacted gift voucher email is never sent', async () => {
        await expect(sendEmailJob(redactDeliveredJob(voucherEmail)!)).rejects.toThrow('no longer stored');
    });
});
