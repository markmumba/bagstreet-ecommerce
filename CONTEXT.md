# Bagstreet

An online and in-store shop selling bags, shoes, scarves and pajamas in Kenya. Customers buy through the storefront and pay via Pesapal; staff run the shop from the admin dashboard.

## Orders

**Order**:
A customer's purchase of one or more variants, with its delivery details and the amount owed.
_Avoid_: Purchase, transaction, sale (except **Walk-in sale**)

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
