import type { CartQuoteResponse } from 'shared/dist';
import { escapeHtml } from './template';
import { formatEmailMoney } from './email-format';

export function renderRecoveryItems(quote: Pick<CartQuoteResponse, 'lines'>) {
    return quote.lines.map(line => {
        const image = line.image_url && /^https?:\/\//i.test(line.image_url)
            ? `<img src="${escapeHtml(line.image_url)}" alt="${escapeHtml(line.product_name)}" width="72" height="88" style="display:block;width:72px;height:88px;object-fit:cover;border-radius:4px;" />` : '';
        const available = line.purchasable_quantity > 0;
        const availability = !available ? 'Currently unavailable' : line.status === 'insufficient_stock' ? `Only ${line.purchasable_quantity} available` : 'Currently available';
        const variant = [line.size, line.color].filter(Boolean).join(' / ');
        return `<tr>
          ${image ? `<td width="88" valign="top" style="padding:18px 16px 18px 0;border-bottom:1px solid #e6e8eb;">${image}</td>` : ''}
          <td ${image ? '' : 'colspan="2"'} valign="top" style="padding:18px 0;border-bottom:1px solid #e6e8eb;">
            <p style="margin:0 0 5px;font-size:15px;font-weight:700;line-height:1.5;color:#232529;">${escapeHtml(line.product_name ?? 'Unavailable item')}</p>
            <p style="margin:0 0 7px;font-size:13px;line-height:1.5;color:#59616a;">${escapeHtml(variant)}${variant ? ' &middot; ' : ''}${line.requested_quantity} requested</p>
            ${line.unit_price === null ? '' : `<p style="margin:0 0 7px;font-size:14px;font-weight:700;line-height:1.5;color:#232529;">${escapeHtml(formatEmailMoney(line.unit_price))} <span style="font-weight:400;color:#59616a;font-size:12px;">each, now</span></p>`}
            <p style="margin:0;font-size:13px;line-height:1.5;color:${available ? '#276845' : '#a82d38'};">${availability}</p>
          </td>
        </tr>`;
    }).join('');
}
