import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { renderEmailTemplate, type EmailTemplateName } from './template';
import { formatEmailMoney, renderOrderItems, type EmailOrderItem } from './email-format';
import type { RecoveryEmail } from '../features/cart-recovery/recovery.delivery';
import { renderRecoveryItems } from './recovery-email-format';

async function createTransporter() {
    return nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
}

function emailDeliveryConfigured() {
    if (env.EMAIL_PROVIDER === 'resend') return Boolean(env.RESEND_API_KEY);
    return Boolean(env.SMTP_USER && env.SMTP_PASS);
}

async function sendWithSmtp(to: string, subject: string, html: string, text: string) {
    const transporter = await createTransporter();
    await transporter.sendMail({ from: env.EMAIL_FROM, to, subject, html, text });
}

async function sendWithResend(to: string, subject: string, html: string, text: string) {
    if (!env.RESEND_API_KEY) return;

    const response = await fetch(env.RESEND_API_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: env.EMAIL_FROM,
            to: [to],
            subject,
            html,
            text,
        }),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Resend email failed with ${response.status}: ${body.slice(0, 500)}`);
    }

    if (env.NODE_ENV !== 'production') {
        const data = await response.json().catch(() => null) as { id?: string } | null;
        console.log(`[email] Resend accepted ${subject} for ${to}${data?.id ? ` (${data.id})` : ''}`);
    }
}

async function send(to: string, subject: string, html: string, text: string) {
    if (!emailDeliveryConfigured()) return;
    const plainText = `${text}\n\nBagStreet\nWhatsApp: https://wa.me/254748096887\nEmail: bagstreetke@gmail.com\nImenti House, Bemack Exhibition, 1st Floor, Shop M2, Nairobi`;
    if (env.EMAIL_PROVIDER === 'resend') {
        await sendWithResend(to, subject, html, plainText);
        return;
    }
    await sendWithSmtp(to, subject, html, plainText);
}

function renderEmail(name: EmailTemplateName, vars: Record<string, string>, trustedHtml: Record<string, string> = {}) {
    return renderEmailTemplate(name, {
        year: String(new Date().getFullYear()),
        storefrontUrl: env.STOREFRONT_URL,
        ...vars,
    }, trustedHtml);
}

function buildAdminUrl(pathname: string, searchParams?: Record<string, string | number | undefined>) {
    const url = new URL(pathname, env.CLIENT_URL);
    for (const [key, value] of Object.entries(searchParams ?? {})) {
        if (value != null && value !== '') url.searchParams.set(key, String(value));
    }
    return url.toString();
}


export async function sendInviteEmail(to: string, name: string, inviteUrl: string) {
    if (!emailDeliveryConfigured()) {
        console.log(`[DEV] Invite for ${name} <${to}>`);
        console.log(`[DEV] ${inviteUrl}`);
        return;
    }
    const html = await renderEmail('invite', {
        title: "You've been invited to BagStreet",
        preheader: 'Join the team. Set your password to activate your staff account.',
        name,
        inviteUrl,
    });
    const text = `Hi ${name},\n\nYou've been invited to join the BagStreet team. Set your password to activate your staff account:\n${inviteUrl}\n\nThis invitation expires in 7 days and can be used once. If you weren't expecting it, you can safely ignore this email.`;
    await send(to, `You've been invited to Bagstreet`, html, text);
}

export async function sendCustomerAccountSetupEmail(to: string, name: string, setupUrl: string) {
    if (env.NODE_ENV !== 'production') {
        console.log(`[DEV] Customer account setup for ${name} <${to}>`);
        console.log(`[DEV] ${setupUrl}`);
    }

    if (!emailDeliveryConfigured()) return;

    const html = await renderEmail('customer-account-setup', {
        title: 'Set up your BagStreet account',
        preheader: 'Your account is one step away. Choose a password to get started.',
        name,
        setupUrl,
    });
    const text = `Hi ${name},\n\nChoose a password to activate your BagStreet account:\n${setupUrl}\n\nThis secure link expires in 24 hours and can be used once. You can still shop without an account. If you didn't request this account, ignore this email; it won't be activated.`;
    await send(to, `Set up your Bagstreet account`, html, text);
}

export async function sendOrderAgreementEmail(to: string, orderRef: string, agreement: string) {
    if (!emailDeliveryConfigured()) {
        console.log(`[DEV] Order agreement queued for ${orderRef}; configure email delivery before launch.`);
        return;
    }
    const html = await renderEmail('order-agreement', {
        title: `Your submitted order ${orderRef}`, preheader: 'Keep a copy of your order details and accepted policies. Payment confirmation follows separately.',
        orderRef, agreement,
    });
    await send(to, `Your BagStreet order ${orderRef} - agreement copy`, html, agreement);
}


export async function sendOrderConfirmationEmail(
    to: string,
    name: string,
    orderId: number,
    items: EmailOrderItem[],
    totalAmount: number,
    shippingAddress: { full_name: string; address_line1: string; city: string; county?: string; state?: string },
    confirmReceivedUrl: string,
    providedOrderRef?: string
) {
    const orderRef = providedOrderRef ?? `#${String(orderId).padStart(6, '0').toUpperCase()}`;

    const shippingRegion = shippingAddress.county ?? shippingAddress.state;
    const shippingCity = shippingAddress.city + (shippingRegion ? `, ${shippingRegion}` : '');

    if (!emailDeliveryConfigured()) {
        console.log(`[DEV] Order confirmation for ${name} <${to}> — Order ${orderRef}`);
        console.log(`[DEV] Confirm received: ${confirmReceivedUrl}`);
        return;
    }

    const html = await renderEmail('order-confirmation', {
        title: `Your BagStreet order ${orderRef} is confirmed`,
        preheader: `Payment received for ${orderRef}. Your order summary and delivery details are inside.`,
        name,
        orderRef,
        totalAmount: formatEmailMoney(totalAmount),
        shippingName: shippingAddress.full_name,
        shippingAddress: shippingAddress.address_line1,
        shippingCity,
        confirmReceivedUrl,
    }, { itemsHtml: renderOrderItems(items) });

    const itemLines = items.map((item) => {
        const variant = [item.variant_size, item.variant_color].filter(Boolean).join(' / ');
        return `${item.product_name}${variant ? ` (${variant})` : ''}\n${item.quantity} x ${formatEmailMoney(item.unit_price)} = ${formatEmailMoney(item.subtotal)}`;
    }).join('\n\n');
    const text = `Hi ${name},\n\nPayment for order ${orderRef} is confirmed. Our team will be in touch to arrange delivery.\n\n${itemLines}\n\nTotal paid: ${formatEmailMoney(totalAmount)} (includes delivery and any applied discounts).\n\nDelivering to:\n${shippingAddress.full_name}\n${shippingAddress.address_line1}\n${shippingCity}\n\nOnly after your package arrives, confirm you've received it:\n${confirmReceivedUrl}`;
    await send(to, `Your Bagstreet order ${orderRef} is confirmed`, html, text);
}

export async function sendAdminOrderConfirmedEmail(
    to: string,
    name: string,
    orderId: number,
    providedOrderRef: string | undefined,
    customerName: string,
    customerPhone: string,
    totalAmount: number,
    itemCount: number
) {
    const orderRef = providedOrderRef ?? `#${String(orderId).padStart(6, '0').toUpperCase()}`;
    const subject = `Bagstreet order ${orderRef} confirmed`;
    const adminOrderUrl = buildAdminUrl('/orders', { order_id: providedOrderRef ?? orderId });

    if (!emailDeliveryConfigured()) {
        console.log(`[DEV] Admin order confirmation for ${name} <${to}> - ${orderRef}`);
        console.log(`[DEV] Open order: ${adminOrderUrl}`);
        return;
    }

    const html = await renderEmail('admin-order-confirmed', {
        title: `Order ${orderRef} is ready for fulfilment`,
        preheader: `${orderRef}: ${formatEmailMoney(totalAmount)} received. Open the order to arrange fulfilment.`,
        name,
        orderRef,
        customerName: customerName || 'Customer',
        customerPhone: customerPhone || 'No phone provided',
        itemCount: String(itemCount),
        totalAmount: formatEmailMoney(totalAmount),
        adminOrderUrl,
    });

    const text = `Hi ${name},\n\nOrder ${orderRef} is paid and ready for fulfilment.\nPayment received: ${formatEmailMoney(totalAmount)}\nCustomer: ${customerName || 'Customer'}\nPhone: ${customerPhone || 'No phone provided'}\nItems: ${itemCount}\n\nOpen the order for delivery details, items, notes and the payment receipt:\n${adminOrderUrl}\n\nMark it received only after delivery.`;
    await send(to, subject, html, text);
}

export async function sendPaymentFailedEmail(
    to: string,
    name: string,
    orderId: number,
    reason?: string | null,
    providedOrderRef?: string
) {
    const orderRef = providedOrderRef ?? `#${String(orderId).padStart(6, '0').toUpperCase()}`;
    const subject = `Payment not completed for Bagstreet order ${orderRef}`;

    if (!emailDeliveryConfigured()) {
        console.log(`[DEV] Payment failure email for ${name} <${to}> - ${orderRef}`);
        return;
    }

    const supportUrl = new URL('https://wa.me/254748096887');
    supportUrl.searchParams.set('text', `Hi BagStreet, I need help with payment for order ${orderRef}.`);
    const html = await renderEmail('payment-failed', {
        title: `Payment not confirmed for ${orderRef}`,
        preheader: `Let's check payment for ${orderRef}. If you already paid, contact us before trying again.`,
        name,
        orderRef,
        reason: reason || 'The payment provider has not confirmed a successful payment.',
        supportUrl: supportUrl.toString(),
    });

    const text = `Hi ${name},\n\nWe couldn't confirm payment for order ${orderRef}. Your order isn't confirmed yet.\n${reason || 'The payment provider has not confirmed a successful payment.'}\n\nIf you've already paid, don't pay again. Contact us with your order number and payment reference. Otherwise, return to checkout on the same device to review payment status.\n\nGet help with payment:\n${supportUrl.toString()}`;
    await send(to, subject, html, text);
}

export async function sendLowStockEmail(
    to: string,
    name: string,
    productName: string,
    variantLabel: string,
    stock: number,
    threshold: number
) {
    const subject = stock === 0
        ? `Bagstreet stock alert: ${productName} is out of stock`
        : `Bagstreet stock alert: ${productName} is low`;
    const productUrl = buildAdminUrl('/products');
    const stockLabel = stock === 0 ? 'Out of stock' : 'Low stock';
    const actionHint = stock === 0
        ? 'Deactivate the variant if it cannot be restocked immediately, or restock before selling again.'
        : 'Restock soon, or review the threshold if this variant is intentionally limited.';

    if (!emailDeliveryConfigured()) {
        console.log(`[DEV] Low stock email for ${name} <${to}> - ${productName} ${variantLabel}: ${stock}/${threshold}`);
        console.log(`[DEV] Open products: ${productUrl}`);
        return;
    }

    const html = await renderEmail('low-stock-alert', {
        title: `${stockLabel}: ${productName}`,
        preheader: `${productName}, ${variantLabel || 'Default variant'}: ${stock} units remaining. Threshold: ${threshold}.`,
        name,
        productName,
        variantLabel: variantLabel || 'Default variant',
        stock: String(stock),
        threshold: String(threshold),
        stockLabel,
        actionHint,
        productUrl,
    });
    const text = `Hi ${name},\n\n${stockLabel}: ${productName}\nVariant: ${variantLabel || 'Default variant'}\nUnits remaining: ${stock}\nAlert threshold: ${threshold}\n\n${actionHint}\n\nReview inventory:\n${productUrl}\n\nStock may have changed since this alert; check the dashboard before adjusting it.`;
    await send(to, subject, html, text);
}


/** The unpaid order expired and its items were released. */
export async function sendOrderExpiredEmail(to: string, name: string, orderRef: string) {
    if (!emailDeliveryConfigured()) {
        console.log(`[DEV] Order expired email for ${name} <${to}> - ${orderRef}`);
        return;
    }
    const shopUrl = new URL('/shop', env.STOREFRONT_URL).toString();
    const supportUrl = new URL('https://wa.me/254748096887');
    supportUrl.searchParams.set('text', `Hi BagStreet, I have a question about order ${orderRef}.`);
    const html = await renderEmail('order-expired', {
        title: `Your order ${orderRef} has expired`,
        preheader: `We didn't receive payment in time, so ${orderRef} was cancelled. You haven't been charged.`,
        name,
        orderRef,
        shopUrl,
        supportUrl: supportUrl.toString(),
    });
    const text = `Hi ${name},\n\nWe didn't receive payment for order ${orderRef} in time, so it has been cancelled and its items were released. You haven't been charged.\n\nStill want them? Place a new order whenever you're ready:\n${shopUrl}\n\nIf money did leave your account for this order, don't pay again: contact us with your order number.\n${supportUrl.toString()}`;
    await send(to, `Your Bagstreet order ${orderRef} has expired`, html, text);
}

/** A staff alert that needs someone to act (a held or reversed payment, a refund owed). */
export async function sendStaffAlertEmail(to: string, name: string, eyebrow: string, heading: string, message: string, linkPath: string) {
    const actionUrl = buildAdminUrl(linkPath);
    if (!emailDeliveryConfigured()) {
        console.log(`[DEV] Staff alert for ${name} <${to}> - ${heading}: ${message}`);
        return;
    }
    const html = await renderEmail('staff-alert', { title: heading, preheader: message, eyebrow, heading, message, name, actionUrl });
    const text = `Hi ${name},\n\n${heading}\n\n${message}\n\nOpen in the dashboard:\n${actionUrl}`;
    await send(to, `Bagstreet: ${heading}`, html, text);
}

export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string) {
    if (!emailDeliveryConfigured()) {
        console.log(`[DEV] Password reset for ${name} <${to}>`);
        console.log(`[DEV] ${resetUrl}`);
        return;
    }
    const html = await renderEmail('password-reset', {
        title: 'Reset your BagStreet password',
        preheader: 'Choose a new password. This secure link expires in one hour.',
        name,
        resetUrl,
    });
    const text = `Hi ${name},\n\nReset your BagStreet password using this secure link:\n${resetUrl}\n\nIt expires in 1 hour and can be used once. If you didn't request this, your password hasn't changed and you can safely ignore this email.`;
    await send(to, `Reset your Bagstreet password`, html, text);
}

export async function sendCartRecoveryEmail(email: RecoveryEmail) {
    const subject = email.final ? 'One last look at your BagStreet bag' : 'Your BagStreet bag is worth another look';
    const intro = email.checkout
        ? "Your earlier checkout wasn't completed. Your stock reservation has ended, but you can review the items and start a new checkout at today's prices."
        : "You left a few things in your bag. Take another look whenever you're ready.";
    const html = await renderEmail('cart-recovery', {
        title: subject, preheader: 'Review your items at current prices and availability. No pressure, no reservation.',
        eyebrow: email.final ? 'A final reminder' : 'Saved for another look', intro,
        recoveryUrl: email.recoveryUrl, unsubscribeUrl: email.unsubscribeUrl,
    }, { itemsHtml: renderRecoveryItems(email.quote) });
    const items = email.quote.lines.map(line => `${line.product_name ?? 'Unavailable item'}: ${line.purchasable_quantity} available for your bag${line.unit_price === null ? '' : `, ${formatEmailMoney(line.unit_price)} each`}`).join('\n');
    const text = `${intro}\n\n${items}\n\nItems aren't reserved. Prices and availability can change. Delivery and any valid promo code are calculated at checkout.\n\nReview your bag:\n${email.recoveryUrl}\n\nAlready paid? Don't pay again; contact our team.\n\nUnsubscribe from bag reminders (order confirmations and receipts are unaffected):\n${email.unsubscribeUrl}`;
    if (!emailDeliveryConfigured()) {
        console.log('[DEV] Cart recovery email prepared (delivery not configured)');
        return;
    }
    await send(email.to, subject, html, text);
}
