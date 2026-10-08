import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { env } from '../config/env';
import {
    sendInviteEmail, sendCustomerAccountSetupEmail, sendPasswordResetEmail,
    sendOrderConfirmationEmail, sendAdminOrderConfirmedEmail, sendLowStockEmail, sendPaymentFailedEmail, sendCartRecoveryEmail, sendOrderAgreementEmail,
} from './email';

describe('email senders', () => {
    const original = { provider: env.EMAIL_PROVIDER, key: env.RESEND_API_KEY, nodeEnv: env.NODE_ENV };
    const messages: { html: string; text: string; subject: string; to: string[] }[] = [];
    let fetchMock: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;

    beforeAll(() => {
        env.EMAIL_PROVIDER = 'resend';
        env.RESEND_API_KEY = 'preview-test-key-not-a-real-key';
        env.NODE_ENV = 'production';
        fetchMock = spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
            messages.push(JSON.parse(String(init?.body)));
            return Response.json({ id: 'test-only' });
        });
    });
    beforeEach(() => { messages.length = 0; });
    afterAll(() => {
        fetchMock.mockRestore();
        env.EMAIL_PROVIDER = original.provider;
        env.RESEND_API_KEY = original.key;
        env.NODE_ENV = original.nodeEnv;
    });

    function emailHtml() {
        expect(messages).toHaveLength(1);
        const html = messages[0]!.html;
        expect(html).toStartWith('<!doctype html>');
        expect(html).not.toMatch(/\{\{\w+\}\}/);
        expect(html).toContain('bagstreetke@gmail.com');
        expect(messages[0]!.text).toContain('bagstreetke@gmail.com');
        expect(messages[0]!.text).not.toMatch(/\{\{\w+\}\}/);
        return html;
    }

    test('invitation keeps its secure link and escapes the recipient', async () => {
        await sendInviteEmail('staff@example.com', 'Amani & <b>team</b>', 'https://example.com/invite?token=test');
        const html = emailHtml();
        expect(html).toContain('Amani &amp; &lt;b&gt;team&lt;/b&gt;');
        expect(html).toContain('href="https://example.com/invite?token=test"');
        expect(html).toContain('7 days');
        expect(messages[0]!.text).toContain('https://example.com/invite?token=test');
    });

    test('account setup includes the actual 24-hour expiry', async () => {
        await sendCustomerAccountSetupEmail('customer@example.com', 'Amani', 'https://example.com/setup?token=test');
        expect(emailHtml()).toContain('24 hours');
    });

    test('password reset retains the correct link and expiry', async () => {
        await sendPasswordResetEmail('customer@example.com', 'Amani', 'https://example.com/reset?token=test');
        const html = emailHtml();
        expect(html).toContain('href="https://example.com/reset?token=test"');
        expect(html).toContain('1 hour');
    });
    test('agreement email includes the accepted copy in HTML and text, without claiming payment', async () => {
        await sendOrderAgreementEmail('customer@example.invalid', 'BS-TEST', 'Original policies\nTotal KES 3,700.00\nCustomer <script>name</script>');
        const html = emailHtml();
        expect(html).toContain('not a payment receipt');
        expect(html).toContain('Original policies');
        expect(html).toContain('&lt;script&gt;name&lt;/script&gt;');
        expect(html).not.toContain('<script>');
        expect(messages[0]!.text).toContain('Original policies\nTotal KES 3,700.00');
    });

    test('order confirmation includes items, formatted totals and the signed receipt-confirmation link', async () => {
        await sendOrderConfirmationEmail('customer@example.com', 'Amani', 8, [{
            product_name: 'Tote <b>bag</b>', variant_color: 'Black', quantity: 2, unit_price: 3700, subtotal: 7400,
        }], 7900, { full_name: 'Amani', address_line1: 'Apartment 4B & 4C', city: 'Nairobi', state: 'Nairobi' },
        'https://example.com/orders/confirm-received?token=test', 'BS-EXAMPLE');
        const html = emailHtml();
        expect(html).toContain('Tote &lt;b&gt;bag&lt;/b&gt;');
        expect(html).toContain('Apartment 4B &amp; 4C');
        expect(html).toContain('KES 7,900.00');
        expect(html).toContain('href="https://example.com/orders/confirm-received?token=test"');
        expect(messages[0]!.text).toContain('https://example.com/orders/confirm-received?token=test');
        expect(messages[0]!.text).toContain('Total paid: KES 7,900.00');
    });

    test('staff email deep-links to the order on the configured admin host', async () => {
        await sendAdminOrderConfirmedEmail('staff@example.com', 'Team', 8, 'BS-EXAMPLE', 'Amani', '+254712000000', 7900, 2);
        const url = new URL('/orders', env.CLIENT_URL);
        url.searchParams.set('order_id', 'BS-EXAMPLE');
        expect(emailHtml()).toContain(`href="${url.toString()}"`);
    });

    test('low-stock and sold-out alerts render the right state', async () => {
        await sendLowStockEmail('staff@example.com', 'Team', 'Tote & scarf', 'Black', 3, 5);
        expect(emailHtml()).toContain('Low stock');
        expect(emailHtml()).toContain('Tote &amp; scarf');
        messages.length = 0;
        await sendLowStockEmail('staff@example.com', 'Team', 'Tote', 'Black', 0, 5);
        expect(emailHtml()).toContain('Out of stock');
        expect(emailHtml()).toContain('Alert threshold: 5 units');
    });

    test('payment failure escapes the provider reason and offers support rather than another charge', async () => {
        await sendPaymentFailedEmail('customer@example.com', 'Amani', 8, '<b>Provider declined</b>', 'BS-EXAMPLE');
        const html = emailHtml();
        expect(html).toContain('&lt;b&gt;Provider declined&lt;/b&gt;');
        expect(html).toContain("don't pay again");
        expect(html).toContain('https://wa.me/254748096887?text=');
        expect(html).toContain('BS-EXAMPLE');
    });

    test('recovery uses live item data, disclaims reservation and includes unsubscribe in HTML and text', async () => {
        await sendCartRecoveryEmail({
            to: 'customer@example.com', checkout: true, final: false,
            recoveryUrl: 'https://example.com/recover-bag?token=test', unsubscribeUrl: 'https://example.com/email-preferences?token=test&id=test',
            quote: {
                lines: [{ variant_id: 1, requested_quantity: 2, purchasable_quantity: 1, status: 'insufficient_stock', unit_price: 4000, compare_at_price: null, line_total: 4000, stock: 1, product_id: '1', product_slug: 'tote', product_name: '<b>Tote</b>', image_url: 'https://example.com/tote.webp', size: null, color: 'Black' }],
                subtotal: 4000, item_count: 1, free_delivery_threshold: 0, amount_to_free_delivery: 0, can_checkout: false,
            },
        });
        const html = emailHtml();
        expect(html).toContain('&lt;b&gt;Tote&lt;/b&gt;');
        expect(html).toContain('KES 4,000.00');
        expect(html).toContain('Only 1 available');
        expect(html).toContain("Your items aren't reserved");
        expect(html).toContain('https://example.com/tote.webp');
        expect(html).toContain('https://example.com/email-preferences?token=test&amp;id=test');
        expect(messages[0]!.text).toContain('Unsubscribe');
        expect(messages[0]!.text).toContain('stock reservation has ended');
    });
});
