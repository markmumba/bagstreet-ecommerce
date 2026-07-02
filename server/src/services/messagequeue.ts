import amqp from 'amqplib';
import { env } from '../config/env';
import {
    sendAdminOrderConfirmedEmail,
    sendCustomerAccountSetupEmail,
    sendInviteEmail,
    sendLowStockEmail,
    sendOrderConfirmationEmail,
    sendPaymentFailedEmail,
    sendPasswordResetEmail,
} from '../lib/email';

const QUEUE = 'email.queue';
const DLQ = 'email.dlq';

export type EmailJob =
    | { type: 'INVITE'; to: string; name: string; inviteUrl: string }
    | { type: 'CUSTOMER_ACCOUNT_SETUP'; to: string; name: string; setupUrl: string }
    | {
        type: 'ORDER_CONFIRMATION';
        to: string;
        name: string;
        orderId: number;
        orderRef?: string;
        items: {
            product_name: string;
            variant_size?: string | null;
            variant_color?: string | null;
            quantity: number;
            unit_price: number;
            subtotal: number;
        }[];
        totalAmount: number;
        shippingAddress: { full_name: string; address_line1: string; city: string; county?: string; state?: string };
        confirmReceivedUrl: string;
    }
    | {
        type: 'LOW_STOCK_ALERT';
        to: string;
        name: string;
        productName: string;
        variantLabel: string;
        stock: number;
        threshold: number;
    }
    | {
        type: 'ADMIN_ORDER_CONFIRMED';
        to: string;
        name: string;
        orderId: number;
        orderRef?: string;
        customerName: string;
        customerPhone: string;
        totalAmount: number;
        itemCount: number;
    }
    | { type: 'PAYMENT_FAILED'; to: string; name: string; orderId: number; orderRef?: string; reason?: string | null }
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
        case 'CUSTOMER_ACCOUNT_SETUP':
            await sendCustomerAccountSetupEmail(job.to, job.name, job.setupUrl);
            break;
        case 'ORDER_CONFIRMATION':
            await sendOrderConfirmationEmail(
                job.to,
                job.name,
                job.orderId,
                job.items,
                job.totalAmount,
                job.shippingAddress,
                job.confirmReceivedUrl,
                job.orderRef,
            );
            break;
        case 'LOW_STOCK_ALERT':
            await sendLowStockEmail(job.to, job.name, job.productName, job.variantLabel, job.stock, job.threshold);
            break;
        case 'ADMIN_ORDER_CONFIRMED':
            await sendAdminOrderConfirmedEmail(
                job.to,
                job.name,
                job.orderId,
                job.orderRef,
                job.customerName,
                job.customerPhone,
                job.totalAmount,
                job.itemCount,
            );
            break;
        case 'PAYMENT_FAILED':
            await sendPaymentFailedEmail(job.to, job.name, job.orderId, job.reason, job.orderRef);
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
        if (env.NODE_ENV !== 'production') {
            console.log(`[mq] queued ${job.type} email to ${job.to}`);
        }
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
                const job = JSON.parse(msg.content.toString()) as EmailJob;
                await handleJob(job);
                if (env.NODE_ENV !== 'production') {
                    console.log(`[email-worker] sent ${job.type} email to ${job.to}`);
                }
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
