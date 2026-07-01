import type { OrderReceiptResponse } from 'shared';

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: string) {
  return new Date(date).toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildReceiptPrintHtml(receipt: OrderReceiptResponse) {
  const orderNumber = receipt.order_number ?? receipt.order_id;
  const items = receipt.items
    .map((item, index) => {
      const variant = [item.variant_size, item.variant_color].filter(Boolean).join(' / ');
      return `
        <tr>
          <td class="item-index">${index + 1}</td>
          <td class="item-details">
            <strong>${escapeHtml(item.product_name)}</strong>
            ${variant ? `<span>${escapeHtml(variant)}</span>` : ''}
            <small>${escapeHtml(item.quantity)} x ${escapeHtml(formatMoney(item.unit_price, receipt.currency))}</small>
          </td>
          <td class="item-total">${escapeHtml(formatMoney(item.subtotal, receipt.currency))}</td>
        </tr>
      `;
    })
    .join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(receipt.receipt_number)}</title>
    <style>
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        min-height: 100%;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #171717;
        background: #30302f;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body { display: flex; justify-content: center; padding: 40px 16px; }
      .receipt {
        position: relative;
        width: 420px;
        overflow: hidden;
        border-radius: 24px;
        background: #f7f7f5;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35);
      }
      .brand {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        padding: 28px 28px 16px;
      }
      .brand-left { display: flex; align-items: center; gap: 12px; }
      .mark { display: grid; grid-template-columns: repeat(3, 8px); gap: 4px; }
      .mark span { width: 8px; height: 8px; border-radius: 50%; background: #171717; }
      .brand-name { margin: 0; font-size: 17px; font-weight: 700; line-height: 1.15; }
      .muted { color: #5e5e5a; }
      .small { display: block; margin-top: 3px; font-size: 12px; }
      .receipt-meta { text-align: right; font-size: 11px; line-height: 1.7; color: #4f4f4b; white-space: nowrap; }
      .intro { padding: 22px 28px 24px; }
      .intro h1 { margin: 0; font-size: 20px; line-height: 1.2; }
      .intro p { margin: 10px 0 0; max-width: 310px; font-size: 12px; line-height: 1.65; color: #555551; }
      .items {
        position: relative;
        border-top: 1px dashed #d7d7d2;
        border-bottom: 1px dashed #d7d7d2;
        padding: 20px 28px;
      }
      .items::before, .items::after {
        content: "";
        position: absolute;
        top: 0;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #30302f;
      }
      .items::before { left: 0; transform: translate(-50%, -50%); }
      .items::after { right: 0; transform: translate(50%, -50%); }
      table { width: 100%; border-collapse: collapse; }
      .items tr + tr td { padding-top: 18px; }
      .items td { vertical-align: top; font-size: 12px; }
      .item-index { width: 26px; color: #555551; }
      .item-details strong { display: block; max-width: 210px; line-height: 1.45; }
      .item-details span, .item-details small { display: block; margin-top: 5px; color: #66635e; }
      .item-total { width: 104px; text-align: right; font-weight: 700; white-space: nowrap; }
      .summary { padding: 28px; }
      .total-box { display: flex; justify-content: space-between; gap: 18px; border-radius: 16px; background: #ecece8; padding: 18px 20px; }
      .total-box h2 { margin: 0; font-size: 17px; }
      .total-lines { margin-top: 14px; font-size: 12px; line-height: 1.7; color: #555551; }
      .total-paid { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 0; white-space: nowrap; }
      .details { margin-top: 28px; }
      .details h2 { margin: 0; font-size: 15px; }
      .details p { margin: 8px 0 0; font-size: 12px; line-height: 1.35; color: #555551; overflow-wrap: anywhere; }
      .footer {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        background: #ecece8;
        padding: 18px 28px;
        font-size: 11px;
        line-height: 1.55;
        color: #555551;
      }
      .footer-right { text-align: right; }
      @media print {
        html, body { background: #ffffff; }
        body { display: block; padding: 0; }
        .receipt { width: 104mm; margin: 0 auto; box-shadow: none; }
        .items::before, .items::after { background: #ffffff; }
      }
    </style>
  </head>
  <body>
    <main class="receipt">
      <section class="brand">
        <div class="brand-left">
          <div class="mark" aria-hidden="true">
            <span></span><span></span><span></span>
            <span></span><span></span><span></span>
            <span></span><span></span><span></span>
          </div>
          <div>
            <p class="brand-name">BagStreet</p>
            <span class="small muted">Payment receipt</span>
          </div>
        </div>
        <div class="receipt-meta">
          <div>${escapeHtml(receipt.receipt_number)}</div>
          <div>${escapeHtml(formatDate(receipt.paid_at))}</div>
        </div>
      </section>
      <section class="intro">
        <h1>Payment received</h1>
        <p>Order ${escapeHtml(orderNumber)} was paid successfully.</p>
        <p>Customer: <strong style="color:#171717">${escapeHtml(receipt.customer_name)}</strong></p>
      </section>
      <section class="items"><table><tbody>${items}</tbody></table></section>
      <section class="summary">
        <div class="total-box">
          <div>
            <h2>Total paid</h2>
            <div class="total-lines">
              <div>Subtotal: ${escapeHtml(formatMoney(receipt.subtotal, receipt.currency))}</div>
              <div>Delivery: ${escapeHtml(formatMoney(receipt.shipping_cost, receipt.currency))}</div>
              ${receipt.discount_amount > 0 ? `<div>Discount: -${escapeHtml(formatMoney(receipt.discount_amount, receipt.currency))}</div>` : ''}
            </div>
          </div>
          <p class="total-paid">${escapeHtml(formatMoney(receipt.total_amount, receipt.currency))}</p>
        </div>
        <div class="details">
          <h2>Payment details</h2>
          <p>Provider: ${escapeHtml(receipt.payment_provider)}</p>
          ${receipt.payment_method ? `<p>Method: ${escapeHtml(receipt.payment_method)}</p>` : ''}
          ${receipt.payment_reference ? `<p>Reference: ${escapeHtml(receipt.payment_reference)}</p>` : ''}
          <p>Receipt: ${escapeHtml(receipt.receipt_number)}</p>
        </div>
      </section>
      <footer class="footer">
        <div>
          <div>BagStreet</div>
          <div>Issued ${escapeHtml(formatDate(receipt.issued_at))}</div>
        </div>
        <div class="footer-right">
          <div>Order ${escapeHtml(orderNumber)}</div>
          <div>${escapeHtml(receipt.customer_email ?? receipt.customer_phone ?? '')}</div>
        </div>
      </footer>
    </main>
  </body>
</html>`;
}

export function printReceipt(receipt: OrderReceiptResponse) {
  const printWindow = window.open('', '_blank', 'width=520,height=780');
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(buildReceiptPrintHtml(receipt));
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 250);
}
