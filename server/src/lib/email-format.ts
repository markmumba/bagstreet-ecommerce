import { escapeHtml } from './template';

export interface EmailOrderItem {
    product_name: string;
    variant_size?: string | null;
    variant_color?: string | null;
    quantity: number;
    unit_price: number;
    subtotal: number;
}

export function formatEmailMoney(amount: number): string {
    return `KES ${new Intl.NumberFormat('en-KE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount)}`;
}

export function renderOrderItems(items: EmailOrderItem[]): string {
    return items.map((item) => {
        const variant = [item.variant_size, item.variant_color].filter(Boolean).join(' / ');
        return `<tr>
            <td style="padding:16px 12px 16px 0;border-bottom:1px solid #e6e8eb;vertical-align:top;">
                <p style="margin:0;font-size:14px;font-weight:700;line-height:1.6;color:#232529;overflow-wrap:anywhere;">${escapeHtml(item.product_name)}</p>
                ${variant ? `<p style="margin:4px 0 0;font-size:12px;line-height:1.6;color:#697079;overflow-wrap:anywhere;">${escapeHtml(variant)}</p>` : ''}
                <p style="margin:4px 0 0;font-size:12px;line-height:1.6;color:#697079;">${escapeHtml(item.quantity)} &times; ${formatEmailMoney(item.unit_price)}</p>
            </td>
            <td align="right" style="padding:16px 0;border-bottom:1px solid #e6e8eb;vertical-align:top;font-size:13px;line-height:1.6;color:#232529;">${formatEmailMoney(item.subtotal)}</td>
        </tr>`;
    }).join('');
}
