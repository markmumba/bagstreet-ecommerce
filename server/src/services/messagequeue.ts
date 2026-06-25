import amqp from 'amqplib';
import { env } from '../config/env';
import {
    sendInviteEmail,
    sendOrderConfirmationEmail,
    sendPasswordResetEmail,
} from '../lib/email';

const QUEUE = 'email.queue';
const DLQ = 'email.dlq';

export type EmailJob =
    | { type: 'INVITE'; to: string; name: string; inviteUrl: string }
    | {
        type: 'ORDER_CONFIRMATION';
        to: string;
        name: string;
        orderId: number;
        items: {
            product_name: string;
            variant_size?: string | null;
            variant_color?: string | null;
            quantity: number;
            unit_price: number;
            subtotal: number;
        }[];
        totalAmount: number;
        shippingAddress: { full_name: string; address_line1: string; city: string; county?: string };
    }
    | { type: 'PASSWORD_RESET'; to: string; name: string; resetUrl: string };

let channel: amqp.Channel | null = null;

async function getChannel(): Promise<amqp.Channel> {
    if (channel) return channel;
    const conn = await amqp.connect(env.RABBITMQ_URL!);
    conn.on('error', (err) => {
        console.error('[mq] connection error:', err.message);
        channel = null;
    });
    conn.on('close', () => { channel = null; });
    channel = await conn.createChannel();
    await channel.assertQueue(DLQ, { durable: true });
    await channel.assertQueue(QUEUE, {
        durable: true,
        arguments: {
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': DLQ,
        },
    });
    return channel;
}

async function handleJob(job: EmailJob): Promise<void> {
    switch (job.type) {
        case 'INVITE':
            await sendInviteEmail(job.to, job.name, job.inviteUrl);
            break;
        case 'ORDER_CONFIRMATION':
            await sendOrderConfirmationEmail(
                job.to, job.name, job.orderId,
                job.items, job.totalAmount, job.shippingAddress
            );
            break;
        case 'PASSWORD_RESET':
            await sendPasswordResetEmail(job.to, job.name, job.resetUrl);
            break;
    }
}

export async function publishEmail(job: EmailJob): Promise<void> {
    if (!env.RABBITMQ_URL) {
        // Dev fallback — execute inline (no queue)
        await handleJob(job).catch((err) =>
            console.error('[email] direct send failed:', err)
        );
        return;
    }
    try {
        const ch = await getChannel();
        ch.sendToQueue(QUEUE, Buffer.from(JSON.stringify(job)), { persistent: true });
    } catch (err) {
        console.error('[mq] publish failed, falling back to direct send:', err);
        await handleJob(job).catch((e) => console.error('[email] fallback send failed:', e));
    }
}

export async function startEmailWorker(): Promise<void> {
    if (!env.RABBITMQ_URL) {
        console.log('[email-worker] RABBITMQ_URL not set — emails sent directly');
        return;
    }
    try {
        const ch = await getChannel();
        ch.prefetch(1);
        await ch.consume(QUEUE, async (msg) => {
            if (!msg) return;
            try {
                const job: EmailJob = JSON.parse(msg.content.toString());
                await handleJob(job);
                ch.ack(msg);
            } catch (err) {
                console.error('[email-worker] job failed, sending to DLQ:', err);
                ch.nack(msg, false, false);
            }
        });
        console.log('[email-worker] listening on queue:', QUEUE);
    } catch (err) {
        console.error('[email-worker] failed to start — emails will be sent directly:', err);
    }
}
