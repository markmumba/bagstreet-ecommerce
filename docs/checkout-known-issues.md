# Checkout & ordering — known logic issues

Found while redesigning the cart and checkout pages (October 2026). Ordered by impact.
Each entry says where the problem is, how to reproduce it, and a suggested fix.

Status key: **Open** = not yet fixed · **Fixed** = resolved (see "How they were fixed" at the end)

---

## High

### 1. Unpaid orders hold stock forever — Fixed
**Where:** `server/src/features/orders/orders.handlers.ts` (`create`), `orders.queries.ts` (`create` decrements stock)

Stock is decremented the moment an order is *created*, before payment. Nothing ever releases it:
the only background timer in the server is the rate limiter's cleanup, and `restoreStock` runs only
when an admin cancels an order by hand.

**Scenario:** A customer places an order, reaches Pesapal and closes the tab. The 2 remaining units
of that bag now show as sold out to everyone, indefinitely.

**Fix:** Give unpaid orders a payment window (e.g. 30–60 min). A scheduled job cancels
`payment_status = 'UNPAID'` orders older than the window and calls `restoreStock` (reason
`ORDER_CANCELLED`, or a new `PAYMENT_EXPIRED`). Show the deadline on the payment screen.

### 2. Discount usage is recorded outside the order transaction — Fixed
**Where:** `orders.handlers.ts` `create` → `ordersQueries.create(...)` commits, *then* `discountsQueries.recordUsage(...)` runs separately.

**Scenario:** Two orders with the same code and phone arrive together. Both pass `validateDiscount`,
both orders are created (stock taken), then the second `recordUsage` hits the unique constraint.
The customer sees "This phone number has already used this code", but **the order already exists
and the stock is already taken**. They retry and create a second order.

**Fix:** Insert the usage row inside the same `sql.begin` transaction as the order, and lock the
code row (`SELECT … FOR UPDATE`) while checking it.

### 3. `usage_limit` can be exceeded under concurrency — Fixed
**Where:** `discounts.handlers.ts` `validateDiscount` checks `used_count >= usage_limit`; `discounts.queries.ts` `recordUsage` increments without re-checking.

**Scenario:** A code limited to 50 uses, shared on Instagram. Several customers check out at the
same moment while `used_count = 49`; all pass validation, and the code ends up used 53 times.

**Fix:** Increment conditionally inside the order transaction:
`UPDATE discount_codes SET used_count = used_count + 1 WHERE id = $1 AND (usage_limit IS NULL OR used_count < usage_limit) RETURNING id`, and fail the order if no row comes back.

### 4. The success screen trusts the URL — Fixed
**Where:** `storefront/src/routes/checkout.tsx` — `search.payment === 'paid'` sets the "paid" step and clears the bag.

The server checks the payment with Pesapal before redirecting (`payments.handlers.ts` `pesapalCallback`),
but the page itself never confirms.
`/checkout?payment=paid&order_id=ANYTHING` shows "Thank you — it's yours" and empties the bag
(reproduced with a made-up order number).

**Impact:** Mostly confusion (a shared or bookmarked link, or a user editing the URL), and a bag
emptied for no reason. No money moves.

**Fix:** On return, call the payment-status endpoint for the order and render from its answer.
Guests need proof they own the order: store a short-lived `{ order_id, tracking_id, phone, email }`
in `sessionStorage` before redirecting to Pesapal, or have the server sign the redirect
(an HMAC of the order id and status) and verify it on `GET`.

---

## Medium

### 5. Abandoned payment + "back to bag" creates duplicate orders — Fixed
**Where:** `checkout.tsx` `handleSubmit` — the bag is only cleared when there's *no* Pesapal redirect; on redirect, it's cleared only on a `paid` return.

**Scenario:** The customer places an order, backs out of Pesapal, and the bag is still full. They
check out again, creating a second unpaid order and taking stock twice (made worse by #1).

**Fix:** When an order is created, remember its id in `sessionStorage`. If the customer returns to
checkout with the same bag, offer to "Resume payment for order BS-…" instead of creating a new one,
or have the server reuse an existing unpaid order with the same lines and phone.

### 6. "Payment pending" return is a dead end for guests — Fixed
**Where:** `checkout.tsx` — when `isReturnedFromPesapal`, the "Check status" / "Continue to payment" buttons are hidden, and the form state (phone/email) is gone after the redirect.

**Scenario:** M-Pesa takes a minute to confirm, and Pesapal redirects with `payment=pending`. A guest
sees "waiting for confirmation" with only "Continue shopping". They can't re-check the status or
retry payment, and have no order link.

**Fix:** Same session store as #4 provides the phone, email and tracking id. Show "Check payment
status" and "Try payment again". Email guests a link to their order on creation.

### 7. Staff are alerted about orders that may never be paid — Fixed
**Where:** `orders.handlers.ts` `create` sends `NEW_ORDER` notifications and low-stock alerts before payment.

**Impact:** Abandoned checkouts page staff with "New order" alerts and false low-stock warnings
(which can turn into real ones because of #1).

**Fix:** Send `NEW_ORDER` from the payment-confirmed path. Low-stock checks can stay at creation
if #1 is fixed, otherwise move them too.

### 8. Payment start failures are silent — Fixed
**Where:** `orders.handlers.ts` `create` — the `submitPesapalOrder` error is only logged; the order is returned with no redirect.

**Impact:** The customer lands on "Complete your payment" and "Continue to payment" retries via
`/initiate`, which is fine, but staff get no alert when Pesapal is down and orders pile up unpaid.

**Fix:** Record a `payment_transactions` row with status `INIT_FAILED` and raise an admin
notification after N failures in a window.

### 9. Cart stock isn't reserved — Open (by design for now)
**Where:** `POST /api/storefront/cart/quote` is read-only.

Two shoppers can both see "Only 2 left" and both reach checkout. Order creation locks variants
(`FOR UPDATE`), so stock never goes negative; the second shopper simply gets "Insufficient stock"
at the last step. The checkout page now shows that message and re-checks the bag.

**Fix (if needed later):** Short reservations at "Place order" are cleaner than reserving at
add-to-cart. Fixing #1 covers most of the real-world pain.

---

## Low

### 10. Returned order id is assumed numeric — Fixed
**Where:** `checkout.tsx` — `Number(search.order_id)`. The callback sends `public_id` (e.g. `BS-…`), giving `NaN → 0`.

Harmless today because the buttons that use `pendingOrder.id` are hidden on return, but it'll bite
when #6 is fixed. Use the public id end-to-end.

### 11. Server totals aren't rounded — Fixed
**Where:** `orders.handlers.ts` `create` sums `unit_price * quantity` as floats.

Prices are whole shillings today, so there's no visible effect. Use `roundMoney` from
`server/src/lib/pricing.ts` for `itemsTotal` and `totalAmount` before storing them or sending them to Pesapal.

### 12. "One use per phone" is easy to get around — Open (business decision)
The limit is per normalised phone number. A second SIM gets a second use. That's fine for
casual promos; for high-value codes, consider per-account limits or one-time codes.

---

## Fixed in the October 2026 checkout pass

- **Stale prices at checkout.** The checkout now prices the bag with the server's cart quote
  (`useCartQuote`), the same pricing order creation uses. The cart page also writes current prices
  back to the saved bag.
- **Cart could exceed stock / include discontinued items.** The cart and checkout flag them;
  "Place order" is disabled until the bag is valid.
- **A typed but unapplied discount code was still sent with the order.** The order total could
  differ from the one shown. Only an *applied* code is sent now.
- **An applied discount stayed after the bag or phone changed.** It was validated against the old
  subtotal and phone. It's now cleared, and the customer is asked to apply it again.
- **Generic "Failed to place order".** The server's actual reason ("Insufficient stock…",
  "already used this code") is shown now, and the bag is re-checked.
- **Signed-in customer details were missing if auth loaded after the page.** They're now filled in
  without overwriting what was typed.
- **The failed-payment screen said "waiting for confirmation".** It now says payment wasn't received.

---

## How they were fixed (October 2026, second pass)

Verified by `bun test` (unit) and `bun run test:integration` (real database: concurrency, expiry,
late payments), plus an end-to-end guest checkout in the browser.

> **Later:** the functions named below (`cancelUnpaid`, `reinstateCancelled`, `confirmOrderPayment`,
> `markOrderPaid`, `restoreStock`) have been replaced by the Order lifecycle
> (`server/src/features/orders/lifecycle/`, [ADR 0001](adr/0001-order-lifecycle-owns-order-state.md)).
> The behaviour described here is kept, and is now one transition table applied in one transaction.

| # | Fix |
|---|-----|
| 1 | `services/unpaid-order-expiry.ts` runs every 5 min and cancels **online** orders still unpaid after `UNPAID_ORDER_TTL_MINUTES` (default 45, `0` disables). Before cancelling, it asks Pesapal, so a just-completed payment is confirmed instead. If Pesapal can't be reached it waits up to 3 windows. Cancelling (`ordersQueries.cancelUnpaid`) releases stock **and** the discount use in one transaction, guarded by a conditional `UPDATE`, so only one caller can win. |
| — | **New issue found while fixing #1:** a payment arriving *after* expiry would have set the cancelled order back to CONFIRMED although its stock was released (an oversell). `confirmOrderPayment` now reinstates the order if every item is still in stock (`reinstateCancelled`). Otherwise it records the money, keeps the order cancelled and sends staff a **"Refund needed"** alert. `markOrderPaid` refuses cancelled orders. |
| 2, 3 | The discount use is recorded **inside** the order transaction (`recordDiscountUsage`). It locks the code row and re-checks `usage_limit` and per-phone use, so a failure rolls back the whole order. Tested: a 1-use code with 2 simultaneous checkouts gives exactly 1 order, and the rejected one takes no stock. |
| 4, 6, 10 | Orders get a signed **order-access token** (`lib/order-received-token.ts`), returned at checkout and added to the Pesapal return URL. `POST /api/payments/pesapal/status` and `/initiate` accept `order_ref` + `token`. The checkout page always asks the server for the status. `?payment=paid` alone now shows "We couldn't confirm this order here" and leaves the bag alone. Pending and failed orders get "Continue / Try payment again" and "Check again". Expired orders say so. Public order refs are used throughout. |
| 5 | The bag is emptied as soon as the order exists. The order's ref and token (no phone or email) are kept in `localStorage`, and a **"You have an unpaid order — Complete payment"** banner appears on checkout instead of a second order being placed. |
| 7 | The staff "New order" notification moved to `confirmOrderPayment`, so it only fires once paid. Low-stock alerts stay at creation, since stock is taken then. |
| 8 | When Pesapal throws while starting a payment, staff get a `PAYMENT_INIT_FAILED` notification. (Without credentials in dev, the Pesapal client returns "pending" instead of throwing, so this doesn't fire locally.) |
| 11 | `itemsTotal` and `totalAmount` go through `roundMoney`. |
| — | **Also fixed:** admin and customer cancels released stock and changed the status in separate steps, so two cancels at once could release stock twice, and the discount use was never given back. Both now use `cancelUnpaid` for pending orders. |

### Still open
- **#9 Cart stock isn't reserved:** by design. Order creation prevents overselling, and expiry (#1) frees abandoned holds.
- **#12 "One use per phone" is easy to get around:** a business decision.
- **Customers aren't emailed when an unpaid order expires.** It would be easy to add on the `ORDER_EXPIRED` path if you want it.
- **The `PAYMENT_INIT_FAILED` alert is untested against real Pesapal errors,** because Pesapal isn't configured locally. Worth one sandbox run once credentials are set.
