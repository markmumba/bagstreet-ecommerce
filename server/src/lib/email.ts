import nodemailer from 'nodemailer';
import { env } from '../config/env';

export async function sendInviteEmail(to: string, name: string, inviteUrl: string) {
    if (!env.SMTP_USER || !env.SMTP_PASS) {
        console.log(`[DEV] Invite for ${name} <${to}>`);
        console.log(`[DEV] ${inviteUrl}`);
        return;
    }
    const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
    await transporter.sendMail({
        from: env.EMAIL_FROM,
        to,
        subject: `You've been invited to Bagstreet`,
        html: `<p>Hi ${name},</p>
               <p>You've been invited to join Bagstreet as a staff member.</p>
               <p><a href="${inviteUrl}">Accept Invitation</a></p>
               <p>This link expires in 7 days.</p>`,
    });
}
