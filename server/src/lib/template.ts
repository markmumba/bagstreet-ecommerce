import layout from './templates/email-layout.html' with { type: 'text' };
import orderConfirmation from './templates/order-confirmation.html' with { type: 'text' };
import adminOrderConfirmed from './templates/admin-order-confirmed.html' with { type: 'text' };
import lowStockAlert from './templates/low-stock-alert.html' with { type: 'text' };
import invite from './templates/invite.html' with { type: 'text' };
import customerAccountSetup from './templates/customer-account-setup.html' with { type: 'text' };
import passwordReset from './templates/password-reset.html' with { type: 'text' };
import paymentFailed from './templates/payment-failed.html' with { type: 'text' };
import cartRecovery from './templates/cart-recovery.html' with { type: 'text' };
import orderAgreement from './templates/order-agreement.html' with { type: 'text' };

// Text imports embed the templates in production bundles as well as loading them in dev.
const templates = {
    'email-layout': layout,
    'order-confirmation': orderConfirmation,
    'admin-order-confirmed': adminOrderConfirmed,
    'low-stock-alert': lowStockAlert,
    'invite': invite,
    'customer-account-setup': customerAccountSetup,
    'password-reset': passwordReset,
    'payment-failed': paymentFailed,
    'cart-recovery': cartRecovery,
    'order-agreement': orderAgreement,
};

export type EmailTemplateName = Exclude<keyof typeof templates, 'email-layout'>;

export function escapeHtml(value: string | number | null | undefined): string {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

/**
 * Interpolates trusted values in a single pass; replacement text is never parsed as a template.
 */
export async function renderTemplate(
    name: keyof typeof templates,
    vars: Record<string, string>
): Promise<string> {
    return String(templates[name]).replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
        if (!Object.hasOwn(vars, key)) throw new Error(`Missing ${key} in email template ${name}`);
        return vars[key]!;
    });
}

export async function renderEmailTemplate(
    name: EmailTemplateName,
    vars: Record<string, string>,
    trustedHtml: Record<string, string> = {},
): Promise<string> {
    const escaped = Object.fromEntries(Object.entries(vars).map(([key, value]) => [key, escapeHtml(value)]));
    const content = await renderTemplate(name, { ...escaped, ...trustedHtml });
    return renderTemplate('email-layout', { ...escaped, content });
}
