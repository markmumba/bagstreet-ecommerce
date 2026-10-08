import { formatEmailMoney, renderOrderItems } from '../lib/email-format';
import type { EmailTemplateName } from '../lib/template';
import { renderRecoveryItems } from '../lib/recovery-email-format';

export interface EmailPreview {
    filename: string;
    template: EmailTemplateName;
    label: string;
    vars: Record<string, string>;
    trustedHtml?: Record<string, string>;
}

// Fictional recipients and nonfunctional tokens only. This module never sends email.
const customerOrder: EmailPreview = {
    filename: 'order-confirmation',
    template: 'order-confirmation',
    label: 'Customer order confirmation',
    vars: {
        title: 'Your BagStreet order BS-EXAMPLE is confirmed',
        preheader: 'Payment received. Your order summary and delivery details are inside.',
        name: 'Amani',
        orderRef: 'BS-EXAMPLE',
        totalAmount: formatEmailMoney(11500),
        shippingName: 'Amani Wanjiku',
        shippingAddress: 'Kenyatta Avenue, Apartment 4B',
        shippingCity: 'Nairobi, Kenya',
        confirmReceivedUrl: 'https://example.com/orders/confirm-received?token=preview-only-not-a-real-token',
    },
    trustedHtml: {
        itemsHtml: renderOrderItems([
            { product_name: 'Coach Terri Shoulder Bag', variant_color: 'Black', quantity: 2, unit_price: 3700, subtotal: 7400 },
            { product_name: 'Cashmere Wrap Scarf', variant_color: 'Forest green', quantity: 1, unit_price: 3600, subtotal: 3600 },
        ]),
    },
};

const lowStock: EmailPreview = {
    filename: 'low-stock-alert',
    template: 'low-stock-alert',
    label: 'Low stock alert',
    vars: {
        title: 'Low stock: Coach Terri Shoulder Bag',
        preheader: 'Coach Terri Shoulder Bag, Black: 3 units remaining. Threshold: 5.',
        name: 'BagStreet team',
        productName: 'Coach Terri Shoulder Bag',
        variantLabel: 'Normal / Black',
        stock: '3',
        threshold: '5',
        stockLabel: 'Low stock',
        actionHint: 'Restock soon, or review the threshold if this variant is intentionally limited.',
        productUrl: 'https://example.com/admin/products',
    },
};

export const emailPreviews: EmailPreview[] = [
    { filename: 'order-agreement', template: 'order-agreement', label: 'Submitted order and agreement copy',
        vars: { title: 'Your submitted order BS-EXAMPLE', preheader: 'Your order details and accepted policies. Payment confirmation follows separately.',
            orderRef: 'BS-EXAMPLE', agreement: 'ORDER BS-EXAMPLE\nCustomer: Amani\nTotal: KES 11,500.00\n\nPayment not yet confirmed.\n\nAccepted terms of sale, returns and delivery policies are included here in the actual email.' } },
    {
        filename: 'cart-recovery', template: 'cart-recovery', label: 'Saved bag reminder',
        vars: {
            title: 'Your BagStreet bag is worth another look', preheader: 'Review your items at current prices and availability.',
            eyebrow: 'Saved for another look', intro: "You left a few things in your bag. Take another look whenever you're ready.",
            recoveryUrl: 'https://example.com/recover-bag?token=preview-only-not-a-real-token',
            unsubscribeUrl: 'https://example.com/email-preferences?id=preview&token=preview-only-not-a-real-token',
        },
        trustedHtml: { itemsHtml: renderRecoveryItems({
            lines: [
                { variant_id: 1, requested_quantity: 2, purchasable_quantity: 1, status: 'insufficient_stock', unit_price: 3700, compare_at_price: null, line_total: 3700, stock: 1, product_id: '1', product_slug: 'coach-terri', product_name: 'Coach Terri Shoulder Bag', image_url: null, size: null, color: 'Black' },
                { variant_id: 2, requested_quantity: 1, purchasable_quantity: 0, status: 'out_of_stock', unit_price: 3900, compare_at_price: null, line_total: 0, stock: 0, product_id: '2', product_slug: 'cashmere', product_name: 'Cashmere Wrap Scarf', image_url: null, size: null, color: 'Forest green' },
            ], subtotal: 3700, item_count: 1, free_delivery_threshold: 0, amount_to_free_delivery: 0, can_checkout: false,
        }) },
    },
    customerOrder,
    {
        filename: 'admin-order-confirmed',
        template: 'admin-order-confirmed',
        label: 'Staff order confirmation',
        vars: {
            title: 'Order BS-EXAMPLE is ready for fulfilment',
            preheader: 'BS-EXAMPLE: KES 11,500.00 received. Open the order to arrange fulfilment.',
            name: 'BagStreet team',
            orderRef: 'BS-EXAMPLE',
            customerName: 'Amani Wanjiku',
            customerPhone: '+254712000000',
            itemCount: '3',
            totalAmount: formatEmailMoney(11500),
            adminOrderUrl: 'https://example.com/admin/orders?order_id=BS-EXAMPLE',
        },
    },
    lowStock,
    {
        ...lowStock,
        filename: 'out-of-stock-alert',
        label: 'Out of stock alert',
        vars: {
            ...lowStock.vars,
            title: 'Out of stock: Coach Terri Shoulder Bag',
            preheader: 'Coach Terri Shoulder Bag, Black: 0 units remaining. Threshold: 5.',
            stock: '0',
            stockLabel: 'Out of stock',
            actionHint: 'Deactivate the variant if it cannot be restocked immediately, or restock before selling again.',
        },
    },
    {
        filename: 'customer-account-setup',
        template: 'customer-account-setup',
        label: 'Customer account setup',
        vars: {
            title: 'Set up your BagStreet account',
            preheader: 'Your account is one step away. Choose a password to get started.',
            name: 'Amani',
            setupUrl: 'https://example.com/setup-account?token=preview-only-not-a-real-token',
        },
    },
    {
        filename: 'invite',
        template: 'invite',
        label: 'Staff invitation',
        vars: {
            title: "You've been invited to BagStreet",
            preheader: 'Join the team. Set your password to activate your staff account.',
            name: 'Amani',
            inviteUrl: 'https://example.com/admin/accept-invite?token=preview-only-not-a-real-token',
        },
    },
    {
        filename: 'password-reset',
        template: 'password-reset',
        label: 'Password reset',
        vars: {
            title: 'Reset your BagStreet password',
            preheader: 'Choose a new password. This secure link expires in one hour.',
            name: 'Amani',
            resetUrl: 'https://example.com/reset-password?token=preview-only-not-a-real-token',
        },
    },
    {
        filename: 'payment-failed',
        template: 'payment-failed',
        label: 'Payment not confirmed',
        vars: {
            title: 'Payment not confirmed for BS-EXAMPLE',
            preheader: "Let's check your payment. If you already paid, contact us before trying again.",
            name: 'Amani',
            orderRef: 'BS-EXAMPLE',
            reason: 'The payment provider has not confirmed a successful payment.',
            supportUrl: 'https://wa.me/254748096887?text=Help%20with%20order%20BS-EXAMPLE',
        },
    },
];

export const emailPreviewContext = {
    year: String(new Date().getFullYear()),
    storefrontUrl: 'https://example.com/shop',
};
