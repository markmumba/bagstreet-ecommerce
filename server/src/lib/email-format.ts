import { escapeHtml } from './template';

export interface EmailOrderItem {
    product_name: string;
    variant_size?: string | null;
    variant_color?: string | null;
    quantity: number;
    unit_price: number;
    subtotal: number;
    /** Product photo; older queued jobs don't have it. */
    image_url?: string | null;
}

/** Money lines under the items. Every field is optional so jobs queued before they existed still render. */
export interface OrderEmailTotals {
    shipping?: number;
    discount?: number;
    discountCode?: string | null;
    voucher?: number;
    /** Provider receipt, e.g. the M-Pesa confirmation code. */
    paymentReference?: string | null;
}

// Storefront palette (L'Atelier Serein), as literal values for email clients.
export const EMAIL_COLORS = {
    ink: '#1c1714',
    muted: '#5f5852',
    faint: '#736c66',
    rule: '#e2d9cf',
    linen: '#f4efea',
    brassText: '#7b5730',
    olive: '#3f4c3b',
    danger: '#ba1a1a',
} as const;

export function formatEmailMoney(amount: number): string {
    return `KES ${new Intl.NumberFormat('en-KE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount)}`;
}

/** Product photos are uploaded as -thumb/-medium/-large; emails only need the 160px thumb. */
export function emailImageUrl(url: string | null | undefined): string | null {
    if (!url || !/^https?:\/\//i.test(url)) return null;
    return url.replace(/-(medium|large)\.webp$/, '-thumb.webp');
}

export function emailThumbnail(url: string | null | undefined, alt: string): string {
    const src = emailImageUrl(url);
    const box = `width:64px;height:80px;background:${EMAIL_COLORS.linen};`;
    return src
        ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="64" height="80" style="display:block;${box}object-fit:cover;border:0;" />`
        : `<div style="${box}"></div>`;
}

export function renderOrderItems(items: EmailOrderItem[]): string {
    const c = EMAIL_COLORS;
    return items.map((item) => {
        const variant = [item.variant_size, item.variant_color].filter(Boolean).join(' / ');
        return `<tr>
            <td width="80" valign="top" style="width:80px;padding:16px 16px 16px 0;border-bottom:1px solid ${c.rule};">${emailThumbnail(item.image_url, item.product_name)}</td>
            <td valign="top" style="padding:16px 12px 16px 0;border-bottom:1px solid ${c.rule};">
                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.4;color:${c.ink};overflow-wrap:anywhere;">${escapeHtml(item.product_name)}</p>
                ${variant ? `<p style="margin:4px 0 0;font-size:12px;line-height:1.6;color:${c.faint};overflow-wrap:anywhere;">${escapeHtml(variant)}</p>` : ''}
                <p style="margin:4px 0 0;font-size:12px;line-height:1.6;color:${c.faint};">Qty ${escapeHtml(item.quantity)} &middot; <span style="white-space:nowrap;">${formatEmailMoney(item.unit_price)}</span> each</p>
            </td>
            <td align="right" valign="top" style="padding:16px 0;border-bottom:1px solid ${c.rule};font-size:14px;line-height:1.6;color:${c.ink};white-space:nowrap;">${formatEmailMoney(item.subtotal)}</td>
        </tr>`;
    }).join('');
}

export interface OrderTotalLine {
    label: string;
    amount: string;
    emphasis?: 'total' | 'paid';
}

/** The money breakdown as label/amount pairs, shared by the HTML and plain-text emails. */
export function orderTotalLines(items: EmailOrderItem[], total: number, totals: OrderEmailTotals): OrderTotalLine[] {
    const voucher = totals.voucher ?? 0;
    const paid = Math.max(total - voucher, 0);
    const lines: OrderTotalLine[] = [];

    // Older jobs only knew the total, so there's nothing to break down.
    if (totals.shipping != null) {
        lines.push({ label: 'Subtotal', amount: formatEmailMoney(items.reduce((sum, item) => sum + item.subtotal, 0)) });
        lines.push({ label: 'Delivery', amount: totals.shipping > 0 ? formatEmailMoney(totals.shipping) : 'Free' });
        if ((totals.discount ?? 0) > 0) {
            lines.push({
                label: totals.discountCode ? `Discount (${totals.discountCode})` : 'Discount',
                amount: `&minus;${formatEmailMoney(totals.discount!)}`,
            });
        }
    }
    lines.push({ label: 'Total', amount: formatEmailMoney(total), emphasis: 'total' });
    if (voucher > 0) {
        lines.push({ label: 'Gift voucher', amount: `&minus;${formatEmailMoney(voucher)}` });
        lines.push({ label: 'Paid', amount: formatEmailMoney(paid), emphasis: 'paid' });
    }
    if (totals.paymentReference) lines.push({ label: 'M-Pesa receipt', amount: escapeHtml(totals.paymentReference) });
    return lines;
}

export function renderOrderTotals(lines: OrderTotalLine[]): string {
    const c = EMAIL_COLORS;
    return lines.map((line) => {
        const strong = line.emphasis === 'total';
        const border = strong ? `border-top:1px solid ${c.ink};` : '';
        const pad = strong ? 'padding:14px 0 8px;' : 'padding:6px 0;';
        const size = strong ? 'font-size:18px;' : 'font-size:14px;';
        const color = line.emphasis ? c.ink : c.muted;
        return `<tr>
            <td style="${pad}${border}${size}line-height:1.5;color:${color};">${escapeHtml(line.label)}</td>
            <td align="right" style="${pad}${border}${size}line-height:1.5;color:${c.ink};white-space:nowrap;${strong ? 'font-weight:700;' : ''}">${line.amount}</td>
        </tr>`;
    }).join('');
}
