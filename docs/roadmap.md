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

## 3. Decisions to make

- [ ] Email customers when an unpaid order expires? (easy to add on the expiry path)
- [ ] Percentage discount codes require an account? ("one use per phone" is easy to get around)
- [ ] Refunds are recorded after staff send the money; call Pesapal's refund API instead?
- [ ] Keep the staff IP address and browser in audit entries for order actions? (dropped when refunds moved to the lifecycle)
- [ ] How to measure the PRD success metrics (checkout completion, payment success rate, time to dispatch). Nothing collects these yet

---

## 4. After launch (features)

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
