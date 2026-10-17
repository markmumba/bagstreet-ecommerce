# Bagstreet roadmap

The one checklist of what remains. Sources: [PRD.md](../PRD.md) (the vision and the build sequence), the
architecture review of 8 Oct 2026, [compliance-readiness.md](compliance-readiness.md),
[deployment.md](deployment.md) and [checkout-known-issues.md](checkout-known-issues.md).
Tick items here as they're done, so this stays the single place to look.

**Where we are:** PRD phases 0–6b are built (catalogue, payments, promotions, emails, storefront,
compliance controls). Phase 7, **launch**, is next. Everything in section 1 stands between the code and
real customers; sections 2–4 can follow launch.

---

## 1. Launch (PRD phase 7)

### Engineering
- [ ] Add the image-build workflow (`.github/workflows/images.yml`, untracked locally) using a token with the `workflow` scope
- [ ] Choose the final media URL (custom CDN subdomain recommended) **before** uploading the real catalogue, since image URLs are stored per product ([deployment.md › CDN](deployment.md#cdn))
- [ ] Provision the droplet, Postgres volume, Spaces bucket and CDN; domain, DNS and HTTPS through Caddy
- [ ] Production `.env` from `deploy/.env.production.example` (`TRUST_PROXY_HOPS=1`, `STORAGE_*`, Pesapal live keys); run `seed-admin` with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- [ ] Email: sender domain set up (SPF, DKIM, DMARC) and one real end-to-end delivery test
- [ ] Pesapal: live credentials, IPN registered, one full sandbox payment end to end (including the `PAYMENT_INIT_FAILED` alert), then test reconciliation, refund and dispute handling with Pesapal
- [ ] Staff MFA (compliance launch gate)
- [ ] Encrypted offsite backups of the database and Spaces, a tested restore, written RPO/RTO
- [ ] Uptime and error monitoring ([deployment.md › Monitoring](deployment.md#monitoring))
- [ ] Production smoke test: browse, checkout, pay, confirmation email, admin marks received, refund

### Checks not yet done by hand
- [ ] Admin order panel: buttons and notes for held and reversed orders (needs an admin login)
- [ ] Cart recovery: reminder email and restore link in a real browser

### Owner, counsel and accountant (from [compliance-readiness.md](compliance-readiness.md#launch-gates-not-completed-by-code))
- [ ] Counsel approves the registration particulars and policy wording (terms, returns, delivery, privacy, cookies)
- [ ] ODPC registration assessed; list the actual providers (VPS, Spaces, email, CDN, delivery) and confirm processor contracts and cross-border safeguards
- [ ] Accountant confirms KRA PIN, tax regime, eTIMS and whether a VAT line is needed on orders; agree the record-retention schedule
- [ ] Supplier invoices, authenticity checks and photo licences on file for the launch catalogue
- [ ] Owner reviews product names, materials and claims

---

## 2. Code health (architecture review follow-ups)

- [x] **#1 Order lifecycle** owns all order state changes ([ADR 0001](adr/0001-order-lifecycle-owns-order-state.md))
- [x] **#2 Order quote module:** one function prices the cart, the checkout preview, order creation and walk-ins. Fixes the free-delivery mismatch (the cart checks the threshold before the discount, the order after) and removes the totals arithmetic in `checkout.tsx`
- [x] **#3 Inventory module (reserve, release, adjust):** fixes the admin stock-adjustment race (the "not below 0" check runs outside the transaction, `variants.handlers.ts:104`), stops the variant edit bypassing the movement log, raises low-stock alerts on every change
- [x] **#4 Discount claims:** one set of rules (`quote/discount-rules.ts`) used by the quote and re-checked under lock at order creation
- [x] **Order creation is a lifecycle event** (`createOrder`); `ordersQueries.insertOrder` is only reachable through it
- [x] **#5 Typed client seam** (admin app): unwrap API responses once, drop the `as any` casts, and invalidate the right queries after each mutation
- [x] **#6 Staff alerts module:** one rule for who hears what (the duty manager never gets stock alerts today)
- [ ] **#7 Shared order presentation** (status labels, order reference, KES formatting, receipt). Low priority
- [x] **Delete dead code:** unused M-Pesa queries in `payments.queries.ts`, `productsQueries.bulkDelete` (broken SQL), `discountsQueries.recordUsage`, `UsersQueries.findActiveStaff`, the server `/api/cart` feature, unused storefront hooks (`useCheckPesapalPayment`, `useFreeDeliveryThreshold`, `useCategoryTree`, `useProducts`). Confirm no callers first

---

## 3. Decisions (made 10 Oct 2026)

- [x] Email customers when an unpaid order expires: **yes**, a short service email from the expiry transaction
- [x] Discount codes require an account: **per-code setting, on by default**, one use per account on top of one per phone
- [x] Pesapal refund API: **not for launch**. Its API refunds mobile money only in full, once per payment, after approval in Pesapal, so refunds stay recorded by hand. Revisit after launch if full refunds are common (a "Refund via Pesapal" button for full refunds of Pesapal payments)
- [x] Staff IP address and browser on order audit entries: **yes**, restored
- [x] PRD success metrics: **Launch metrics card** on the dashboard (payment success, checkout completion, payment-to-dispatch) and an **"Out for delivery"** step that records dispatch time; platform share of all orders tracked by hand

---

## 4. After launch (features)

### Gift vouchers (agreed 14 Oct 2026)
Decisions: valid **1 year**, disclosed in the terms of sale and on the voucher (a 3-year minimum was considered on 14 Oct 2026 but it is South African law, not Kenyan; counsel to confirm); free promotions stay discount codes; the balance carries over across orders; fixed amounts online (KES 2,000 / 5,000 / 10,000 / 20,000), any amount when issued in the shop; can be combined with a discount code (discount first, then the voucher pays); sold **in the shop first**, online in phase 2. A voucher is a way to pay, not a discount, and never paid out as cash.

- [ ] Counsel confirms the voucher terms (terms of sale › Gift vouchers) and the 1-year validity under Kenyan consumer law
- [ ] Accountant confirms voucher sales are a liability and expired balances are recognised as breakage income (income tax, no VAT for now)
- [ ] Owner decides on an unused-voucher refund for buyers (not offered: vouchers are never paid out as cash)
- [x] **Phase 1, in the shop** (done 14 Oct 2026; `bun run test:vouchers`):
  - [x] `gift_vouchers` (hashed code + last 4, amount, balance, expiry, recipient) and `gift_voucher_movements` (migration 016); every balance change locks the voucher row
  - [x] Admin **Gift vouchers** page (admins and managers): sell a voucher after a till payment, code shown once with a printable card, check a balance, list and history; cancel and correct a balance (admin only, audited); liability figures (admin only)
  - [x] Checkout and walk-in sales: voucher field; the Order quote shows the voucher line and the amount to pay
  - [x] Order lifecycle: hold on order creation, spend on payment, release on expiry or cancellation, refund back onto the voucher; a fully covered order is paid without Pesapal; Pesapal charges only the remainder; Late payments re-hold the voucher or become a refund owed
  - [x] Payment ledger `VOUCHER_REDEEMED`; order balance, reconciliation and dashboard revenue count it; cash refunds can never include the voucher part
  - [x] Wrong codes limited to 10 an hour per user or network; codes are BGST + 16 random characters (`BGST-XXXX-XXXX-XXXX-XXXX`)
  - Choices made while building: one voucher per order; shop vouchers KES 100 to 200,000; money given back onto a voucher keeps it usable for at least 30 more days (a released hold does not extend it); a voucher can't be cancelled while an unpaid order holds part of it
- [x] **Phase 2, online** (done 17 Oct 2026; decisions agreed the same day):
  - [x] A purchase is an Order with source `GIFT_VOUCHER` (no items, no delivery), so Pesapal, expiry, late and held payments, reversals and reconciliation work as for any order; it goes straight to delivered once the voucher is issued; left out of dashboard revenue (money owed, not earned)
  - [x] Storefront **Gift vouchers** page (KES 2,000 / 5,000 / 10,000 / 20,000, "email it to them" or "email it to me", message) and **Check your balance** page; links in the menu and footer
  - [x] The code goes to exactly one address; a buyer sending it to someone else gets a receipt without the code; the code is removed from the email outbox once sent or given up
  - [x] Admin **New code** for a lost or exposed code (same voucher and balance, audited)
  - [x] Reversal cancels whatever is left; an underpaid purchase is held until staff accept it; a payment after expiry still issues the voucher; admin refund only while the voucher is untouched, in full, and it cancels the voucher
  - [x] Voucher purchases count towards the per-customer order limits and expire like unpaid orders
- [ ] **Phase 3, extras:** delivery on a chosen date, printable PDF card, physical cards with QR codes, reminder before expiry

- [ ] VAT line on orders, if the accountant requires it (see section 1)
- [ ] Saved delivery addresses
- [ ] Sales reports: revenue by date range, top products (monthly CSV exports already exist)
- [ ] Wishlist
- [ ] Returns request flow (refunds are recorded today; there is no customer return request)
- [ ] Product reviews
- [ ] Better recommendations (the product page shows same-category items today)
- [ ] Google sign-in
- [ ] Order tracking, only if dispatch stops being manual

Out of scope for the MVP, per the PRD: rider app, WhatsApp API, loyalty programme, multi-store, Instagram shop sync.
