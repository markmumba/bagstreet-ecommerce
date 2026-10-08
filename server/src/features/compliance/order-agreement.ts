import { z } from 'zod';
import { sql } from '../../lib/db';
import { readJsonColumn } from '../../lib/json-column';
import { formatEmailMoney } from '../../lib/email-format';

const snapshotSchema = z.object({
    policies: z.record(z.object({ title: z.string(), sections: z.array(z.tuple([z.string(), z.string()]).readonly()).readonly() })),
    order: z.object({
        number: z.string(), submitted_at: z.string(), customer: z.string(), email: z.string().nullable(),
        address: z.record(z.unknown()), notes: z.string().nullable(), total: z.number(), shipping: z.number(), discount: z.number(),
        items: z.array(z.object({ name: z.string(), sku: z.string(), size: z.string().nullable(), color: z.string().nullable(), quantity: z.number(), unit_price: z.number() })),
    }),
});
export type OrderAgreementSnapshot = z.infer<typeof snapshotSchema>;

export function agreementText(snapshot: OrderAgreementSnapshot, version: string) {
    const order = snapshot.order;
    const items = order.items.map(item => `${item.name} (${[item.sku, item.size, item.color].filter(Boolean).join(' / ')})\n${item.quantity} x ${formatEmailMoney(item.unit_price)} = ${formatEmailMoney(item.quantity * item.unit_price)}`).join('\n\n');
    const policies = Object.values(snapshot.policies).map(policy => `${policy.title.toUpperCase()}\n\n${policy.sections.map(([heading, text]) => `${heading}\n${text}`).join('\n\n')}`).join('\n\n--------------------\n\n');
    return `ORDER ${order.number}\nSubmitted: ${order.submitted_at}\nCustomer: ${order.customer}\nEmail: ${order.email ?? 'Not supplied'}\n\n${items}\n\nDelivery: ${formatEmailMoney(order.shipping)}\nDiscount: ${formatEmailMoney(order.discount)}\nTotal: ${formatEmailMoney(order.total)}\n\nDelivery details:\n${Object.entries(order.address).filter(([, value]) => value != null && value !== '').map(([key, value]) => `${key.replaceAll('_', ' ')}: ${String(value)}`).join('\n')}\nNotes: ${order.notes ?? 'None'}\n\nAccepted policy version: ${version}\nThis is a copy of your submitted order and accepted policies, not proof of payment or a tax invoice. Payment confirmation is sent separately.\n\n${policies}`;
}

export async function archivedAgreement(orderId: number, db = sql) {
    const [row] = await db<{ policy_version: string; policy_snapshot: unknown }[]>`SELECT policy_version, policy_snapshot FROM order_policy_acceptances WHERE order_id = ${orderId}`;
    if (!row) throw new Error('Order agreement archive is missing');
    const snapshot = snapshotSchema.parse(readJsonColumn(row.policy_snapshot));
    return { orderRef: snapshot.order.number, text: agreementText(snapshot, row.policy_version) };
}
