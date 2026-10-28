import type { CartQuoteResponse } from 'shared/dist';
import { escapeHtml } from './template';
import { EMAIL_COLORS, emailThumbnail, formatEmailMoney } from './email-format';

type RecoveryLine = CartQuoteResponse['lines'][number];

/** What the shopper can do with this line now, worded so a partial stock is never read as good news. */
export function recoveryAvailability(line: Pick<RecoveryLine, 'purchasable_quantity' | 'requested_quantity'>) {
    if (line.purchasable_quantity <= 0) return { text: 'No longer available', color: EMAIL_COLORS.danger };
    if (line.purchasable_quantity < line.requested_quantity) {
        return { text: `Only ${line.purchasable_quantity} left, you had ${line.requested_quantity} in your bag`, color: EMAIL_COLORS.brassText };
    }
    return { text: 'In stock', color: EMAIL_COLORS.olive };
}

export function renderRecoveryItems(quote: Pick<CartQuoteResponse, 'lines'>) {
    const c = EMAIL_COLORS;
    return quote.lines.map(line => {
        const name = line.product_name ?? 'Unavailable item';
        const soldOut = line.purchasable_quantity <= 0;
        const availability = recoveryAvailability(line);
        const variant = [line.size, line.color].filter(Boolean).join(' / ');
        return `<tr>
          <td width="80" valign="top" style="width:80px;padding:18px 16px 18px 0;border-bottom:1px solid ${c.rule};${soldOut ? 'opacity:0.5;' : ''}">${emailThumbnail(line.image_url, name)}</td>
          <td valign="top" style="padding:18px 0;border-bottom:1px solid ${c.rule};">
            <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.4;color:${soldOut ? c.faint : c.ink};">${escapeHtml(name)}</p>
            <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:${c.faint};">${escapeHtml(variant)}${variant ? ' &middot; ' : ''}Qty ${escapeHtml(line.requested_quantity)}</p>
            ${soldOut || line.unit_price === null ? '' : `<p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:${c.ink};">${escapeHtml(formatEmailMoney(line.unit_price))} <span style="color:${c.faint};font-size:12px;">each</span></p>`}
            <p style="margin:0;font-size:13px;line-height:1.5;color:${availability.color};">${escapeHtml(availability.text)}</p>
          </td>
        </tr>`;
    }).join('');
}
