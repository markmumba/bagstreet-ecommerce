# Bagstreet

An online and in-store shop selling bags, shoes, scarves and pajamas in Kenya. Customers buy through the storefront and pay via Pesapal; staff run the shop from the admin dashboard.

## Orders

**Order**:
A customer's purchase of one or more variants, with its delivery details and the amount owed.
_Avoid_: Purchase, transaction, sale (except **Walk-in sale**)

**Out for delivery**:
An **Order** whose rider has left with it. Staff mark it when the rider leaves, which records the dispatch time.
_Avoid_: Shipped (the shop delivers by rider, it doesn't ship)

**Walk-in sale**:
An **Order** recorded by staff for a customer buying in the shop, paid on the spot.
_Avoid_: POS order, counter order

**Order state**:
Where an **Order** stands, judged on its fulfilment status and its payment status together, never on one alone.
_Avoid_: Order status (when the payment side matters too)

**Order event**:
Something that happened to an **Order** that may change its **Order state**, such as a payment captured, a cancellation, a delivery or a refund.
_Avoid_: Action, update, status change

**Order lifecycle**:
The rules for which **Order events** are allowed in each **Order state**, what state follows, and what else must happen with it (stock, discount use, money, notifications).
_Avoid_: Order flow, workflow

**Order quote**:
The price of a bag worked out in one place: each item at its current price, any discount code, delivery, and the total. The bag page, checkout, placing the order and walk-in sales all use it, so what the customer is shown is what they pay.
_Avoid_: Cart total, checkout total (as separate calculations)

**Free delivery threshold**:
The bag subtotal at which delivery becomes free, judged before any discount code.

## Payments

**Held payment**:
A payment received for an **Order** that doesn't match what's owed (too little, or the wrong currency). The **Order** waits for staff to accept the payment or cancel with a **Refund owed**.
_Avoid_: Partial payment, pending payment

**Payment reversal**:
Money from an already-captured payment taken back by the payment provider, for example a chargeback. The **Order** is flagged for staff to decide: cancel and restock, record a new payment, or write it off. It is never cancelled automatically, and the customer is not told it "failed".
_Avoid_: Failed payment (a reversal is not a failure)

**Written off**:
A **Payment reversal** staff have accepted as lost: the goods are gone and the money won't come back. The **Order** stays reversed, with a note saying why.

**Late payment**:
A payment that arrives after its **Order** was cancelled for not being paid in time.

**Reinstatement**:
Reviving a cancelled **Order** because of a **Late payment**, when its items are still in stock. Its discount is honoured even if the code has since reached its limit.

**Refund owed**:
Money held for an **Order** that will not be fulfilled, for example a **Late payment** when the stock is gone.

## Stock

**Stock movement**:
A logged change to a variant's stock, with its reason (order placed, order cancelled, admin adjustment, restock) and who or what caused it. Every unit a variant holds is accounted for by its movements.
_Avoid_: Stock edit, inventory update

**Opening stock**:
The units a variant starts with, recorded as its first restock movement rather than set directly.

**Low-stock alert**:
A message to staff when a change takes a variant's stock across its low-stock threshold, or to zero. It is raised once per crossing, not again while the variant stays low.

## Gift vouchers

**Gift voucher**:
Money paid in advance that its holder spends on **Orders**, identified by a code. It is a way to pay, not a discount: the **Order** total doesn't change, the voucher pays part or all of it. It can be spent across several **Orders** until its balance runs out, is valid for one year, and is never paid out as cash. A free promotional code is never a gift voucher.
_Avoid_: Gift card, coupon, credit (and never "discount code", which lowers the price)

**Voucher balance**:
What is left to spend on a **Gift voucher**. It changes only through logged voucher movements (issued, held, redeemed, released, refunded back, voided, adjusted).

**Voucher hold**:
Part of a **Voucher balance** set aside for an **Order** that hasn't been paid yet. It becomes a redemption when the **Order** is paid, and is released if the **Order** expires or is cancelled.
_Avoid_: Reservation (used for stock)

**Voucher purchase**:
An **Order** for a **Gift voucher** bought online. It has no items or delivery; once it is paid the voucher is issued and its code emailed, which completes the **Order**. Its money is **Voucher liability**, not revenue.
_Avoid_: Voucher order (ambiguous with an **Order** paid by voucher)

**Voucher liability**:
The unspent value of all live **Gift vouchers**: money the shop has taken but still owes in goods. A voucher sale adds to it; it becomes revenue only when spent.

## Reviews

**Product review**:
A customer's 1–5 star rating and words about one product they bought, written against the **Order** it came in. It shows on the shop only after staff approve it; an edit sends it back for approval. Negative reviews are approved like any other: staff hold one back only for abuse, personal details or being off-topic, and record why.
_Avoid_: Rating (only the stars), testimonial (about the shop, not a product)

**Verified buyer**:
Someone whose **Order** for the product has been received. Only verified buyers can write a **Product review**, and every published review shows that it is from one.

**Review invitation**:
The one email sent about 5 days after an **Order** is received, with a link to review what was bought. Never sent for a **Voucher purchase**, more than once per order, or to anyone who has unsubscribed. No reward is offered for reviewing.
