import { describe, expect, test } from 'bun:test';
import { emailPreviewContext, emailPreviews } from '../scripts/email-preview-data';
import { escapeHtml, renderEmailTemplate } from './template';
import { formatEmailMoney, renderOrderItems } from './email-format';

describe('transactional email templates', () => {
    for (const preview of emailPreviews) {
        test(`${preview.filename} renders a complete, self-contained email`, async () => {
            const html = await renderEmailTemplate(preview.template, { ...emailPreviewContext, ...preview.vars }, preview.trustedHtml);
            expect(html).toStartWith('<!doctype html>');
            expect(html).toContain('<html lang="en">');
            expect(html).toContain('<title>');
            expect(html).toContain(escapeHtml(preview.vars.preheader));
            expect(html).toContain('max-width:600px');
            expect(html).toContain('WhatsApp: 074 809 6887');
            expect(html).not.toMatch(/\{\{\w+\}\}/);
            expect(html).not.toContain('<script');
            expect(html).not.toContain('fonts.googleapis.com');
            expect(html).not.toMatch(/style="[^"]*\{\{/);
        });
    }

    test('escapes text and attribute values without double escaping', async () => {
        const preview = emailPreviews.find((item) => item.template === 'customer-account-setup')!;
        const html = await renderEmailTemplate(preview.template, {
            ...emailPreviewContext,
            ...preview.vars,
            name: 'Amani & <img src=x onerror=alert(1)>',
            setupUrl: 'https://example.com/setup?token=test&next=shop',
        });
        expect(html).toContain('Amani &amp; &lt;img src=x onerror=alert(1)&gt;');
        expect(html).not.toContain('<img');
        expect(html).toContain('href="https://example.com/setup?token=test&amp;next=shop"');
        expect(html).not.toContain('&amp;amp;');
    });

    test('does not interpret replacement patterns or placeholders in customer text', async () => {
        const preview = emailPreviews.find((item) => item.template === 'invite')!;
        const html = await renderEmailTemplate(preview.template, {
            ...emailPreviewContext, ...preview.vars, name: '$& {{inviteUrl}}',
        });
        expect(html).toContain('Hi $&amp; {{inviteUrl}},');
    });

    test('fails explicitly when a template variable is missing', async () => {
        await expect(renderEmailTemplate('invite', { ...emailPreviewContext, name: 'Amani' }))
            .rejects.toThrow('Missing inviteUrl in email template invite');
    });

    test('preserves trusted order rows but escapes product and variant data', async () => {
        const rows = renderOrderItems([{
            product_name: '<img src=x> Tote & scarf', variant_color: '<script>red</script>',
            quantity: 2, unit_price: 3700, subtotal: 7400,
        }]);
        const preview = emailPreviews.find(item => item.template === 'order-confirmation')!;
        const html = await renderEmailTemplate('order-confirmation', { ...emailPreviewContext, ...preview.vars }, { itemsHtml: rows });
        expect(html).toContain('<tr>');
        expect(html).toContain('&lt;img src=x&gt; Tote &amp; scarf');
        expect(html).toContain('&lt;script&gt;red&lt;/script&gt;');
        expect(html).toContain('2 &times; KES 3,700.00');
        expect(html).toContain('KES 7,400.00');
        expect(html).not.toContain('<img');
        expect(html).not.toContain('<script>');
    });

    test('formats Kenyan shillings consistently', () => {
        expect(formatEmailMoney(11500)).toBe('KES 11,500.00');
        expect(formatEmailMoney(0)).toBe('KES 0.00');
        expect(formatEmailMoney(3500.5)).toBe('KES 3,500.50');
    });
});
