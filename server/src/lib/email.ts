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
    shippingAddress: { full_name: string; address_line1: string; city: string; county?: string }
) {
    const orderRef = `#${String(orderId).padStart(6, '0').toUpperCase()}`;

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

    const shippingCity = shippingAddress.city + (shippingAddress.county ? `, ${shippingAddress.county}` : '');

    if (!env.SMTP_USER || !env.SMTP_PASS) {
        console.log(`[DEV] Order confirmation for ${name} <${to}> — Order ${orderRef}`);
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
        year: String(new Date().getFullYear()),
    });

    await send(to, `Your Bagstreet order ${orderRef} is confirmed`, html);
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
