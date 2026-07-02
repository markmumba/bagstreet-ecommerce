import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { renderTemplate } from './template';

async function createTransporter() {
    return nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
}

async function send(to: string, subject: string, html: string) {
    if (!env.SMTP_USER || !env.SMTP_PASS) return;
    const transporter = await createTransporter();
    await transporter.sendMail({ from: env.EMAIL_FROM, to, subject, html });
}

function escapeHtml(value: string | number | null | undefined) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatMoney(amount: number) {
    return `KES ${amount.toFixed(2)}`;
}

function buildAdminUrl(pathname: string, searchParams?: Record<string, string | number | undefined>) {
    const url = new URL(pathname, env.CLIENT_URL);
    for (const [key, value] of Object.entries(searchParams ?? {})) {
        if (value != null && value !== '') url.searchParams.set(key, String(value));
    }
    return url.toString();
}


export async function sendInviteEmail(to: string, name: string, inviteUrl: string) {
    if (!env.SMTP_USER || !env.SMTP_PASS) {
        console.log(`[DEV] Invite for ${name} <${to}>`);
        console.log(`[DEV] ${inviteUrl}`);
        return;
    }
    const html = await renderTemplate('invite', {
        name,
        inviteUrl,
        year: String(new Date().getFullYear()),
    });
    await send(to, `You've been invited to Bagstreet`, html);
}

export async function sendCustomerAccountSetupEmail(to: string, name: string, setupUrl: string) {
    if (env.NODE_ENV !== 'production') {
        console.log(`[DEV] Customer account setup for ${name} <${to}>`);
        console.log(`[DEV] ${setupUrl}`);
    }

    if (!env.SMTP_USER || !env.SMTP_PASS) return;

    const html = await renderTemplate('customer-account-setup', {
        name,
        setupUrl,
        year: String(new Date().getFullYear()),
    });
    await send(to, `Set up your Bagstreet account`, html);
}


export async function sendOrderConfirmationEmail(
    to: string,
    name: string,
    orderId: number,
    items: {
        product_name: string;
        variant_size?: string | null;
        variant_color?: string | null;
        quantity: number;
        unit_price: number;
        subtotal: number;
    }[],
    totalAmount: number,
    shippingAddress: { full_name: string; address_line1: string; city: string; county?: string; state?: string },
    confirmReceivedUrl: string,
    providedOrderRef?: string
) {
    const orderRef = providedOrderRef ?? `#${String(orderId).padStart(6, '0').toUpperCase()}`;

    const itemsHtml = items.map((item) => {
        const variant = [item.variant_size, item.variant_color].filter(Boolean).join(' / ');
        return `
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #e8e0d5;font-size:13px;color:#3D1A14;">
                ${item.product_name}
                ${variant ? `<span style="color:#9a8a7a;font-size:11px;"> (${variant})</span>` : ''}
                <br/><span style="color:#9a8a7a;font-size:11px;">Qty: ${item.quantity}</span>
              </td>
              <td style="padding:10px 0;border-bottom:1px solid #e8e0d5;text-align:right;font-family:monospace;font-size:13px;color:#3D1A14;">
                KES ${item.subtotal.toFixed(2)}
              </td>
            </tr>`;
    }).join('');

    const shippingRegion = shippingAddress.county ?? shippingAddress.state;
    const shippingCity = shippingAddress.city + (shippingRegion ? `, ${shippingRegion}` : '');

    if (!env.SMTP_USER || !env.SMTP_PASS) {
        console.log(`[DEV] Order confirmation for ${name} <${to}> — Order ${orderRef}`);
        console.log(`[DEV] Confirm received: ${confirmReceivedUrl}`);
        return;
    }

    const html = await renderTemplate('order-confirmation', {
        name,
        orderRef,
        itemsHtml,
        totalAmount: totalAmount.toFixed(2),
        shippingName: shippingAddress.full_name,
        shippingAddress: shippingAddress.address_line1,
        shippingCity,
        confirmReceivedUrl,
        year: String(new Date().getFullYear()),
    });

    await send(to, `Your Bagstreet order ${orderRef} is confirmed`, html);
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

    if (!env.SMTP_USER || !env.SMTP_PASS) {
        console.log(`[DEV] Admin order confirmation for ${name} <${to}> - ${orderRef}`);
        console.log(`[DEV] Open order: ${adminOrderUrl}`);
        return;
    }

    const html = await renderTemplate('admin-order-confirmed', {
        name: escapeHtml(name),
        orderRef: escapeHtml(orderRef),
        customerName: escapeHtml(customerName || 'Customer'),
        customerPhone: escapeHtml(customerPhone || 'No phone provided'),
        itemCount: String(itemCount),
        totalAmount: escapeHtml(formatMoney(totalAmount)),
        adminOrderUrl,
        year: String(new Date().getFullYear()),
    });

    await send(to, subject, html);
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

    if (!env.SMTP_USER || !env.SMTP_PASS) {
        console.log(`[DEV] Payment failure email for ${name} <${to}> - ${orderRef}`);
        return;
    }

    const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#241212;">
          <h2 style="margin:0 0 12px;">Payment not completed</h2>
          <p>Hello ${name},</p>
          <p>We could not confirm payment for <strong>${orderRef}</strong>.</p>
          ${reason ? `<p style="color:#6f5d55;">${reason}</p>` : ''}
          <p>You can return to checkout and try again. If you already paid, please contact support with your payment reference.</p>
        </div>
    `;

    await send(to, subject, html);
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

    if (!env.SMTP_USER || !env.SMTP_PASS) {
        console.log(`[DEV] Low stock email for ${name} <${to}> - ${productName} ${variantLabel}: ${stock}/${threshold}`);
        console.log(`[DEV] Open products: ${productUrl}`);
        return;
    }

    const html = await renderTemplate('low-stock-alert', {
        name: escapeHtml(name),
        productName: escapeHtml(productName),
        variantLabel: escapeHtml(variantLabel || 'Default variant'),
        stock: String(stock),
        threshold: String(threshold),
        stockLabel,
        actionHint: escapeHtml(actionHint),
        productUrl,
        year: String(new Date().getFullYear()),
    });
    await send(to, subject, html);
}


export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string) {
    if (!env.SMTP_USER || !env.SMTP_PASS) {
        console.log(`[DEV] Password reset for ${name} <${to}>`);
        console.log(`[DEV] ${resetUrl}`);
        return;
    }
    const html = await renderTemplate('password-reset', {
        name,
        resetUrl,
        year: String(new Date().getFullYear()),
    });
    await send(to, `Reset your Bagstreet password`, html);
}
