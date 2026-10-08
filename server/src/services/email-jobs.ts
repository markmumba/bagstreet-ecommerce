import {
    sendAdminOrderConfirmedEmail,
    sendCustomerAccountSetupEmail,
    sendInviteEmail,
    sendLowStockEmail,
    sendOrderConfirmationEmail,
    sendPaymentFailedEmail,
    sendPasswordResetEmail,
    sendOrderAgreementEmail,
} from '../lib/email';
import { deliverRecoveryReminder } from '../features/cart-recovery/recovery.delivery';
import { archivedAgreement } from '../features/compliance/order-agreement';

/** Every email the app sends. Stored as-is in email_outbox.payload. */
export type EmailJob =
    | { type: 'ORDER_AGREEMENT'; to: string; orderId: number }
    | { type: 'CART_RECOVERY'; to: string; snapshotId: string; version: number; stage: 1 | 2 }
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

/** Sends one email now. Throws on failure so the outbox can retry. */
export async function sendEmailJob(job: EmailJob): Promise<void | boolean> {
    switch (job.type) {
        case 'ORDER_AGREEMENT': {
            const agreement = await archivedAgreement(job.orderId);
            await sendOrderAgreementEmail(job.to, agreement.orderRef, agreement.text);
            break;
        }
        case 'CART_RECOVERY':
            return deliverRecoveryReminder(job);
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
        default:
            // Never mark an email "sent" when nothing was sent.
            throw new Error(`Unknown email type: ${(job as { type?: string }).type}`);
    }
}
