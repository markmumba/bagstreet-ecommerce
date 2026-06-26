# BagStreet — Product Requirements Document

**Version**: 1.0 — MVP
**Last updated**: 2026-06-26
**Status**: Draft

---

## 1. Overview

BagStreet is a Nairobi-based fashion accessories ecommerce platform specialising in handbags, shoes, scarves, wallets, and belts. The business currently operates via Instagram DMs and dispatches a bike messenger to deliver within one hour of an order being placed.

This platform replaces the manual Instagram workflow with a self-serve storefront while preserving the same same-day delivery model. Customers browse, checkout with a phone number only (no account required), and pay via M-Pesa STK Push. Staff manage orders and manually co-ordinate rider dispatch.

---

## 2. Problem Statement

| Current pain point | Impact |
|---|---|
| Orders managed manually via Instagram DM | No order history, inventory visibility, or audit trail |
| No structured payment collection | Cash/manual M-Pesa send; no automated confirmation |
| Stock tracked in spreadsheets or memory | Overselling, no low-stock alerts |
| No way to run promotions at scale | Promo codes shared on Instagram but honoured manually |
| All communication is 1-to-1 DMs | Doesn't scale; owner spends hours in chat |

---

## 3. Goals

### Business goals
- Convert Instagram browsers into paying customers with ≤3 taps from product page to order placed
- Eliminate manual payment reconciliation via automated M-Pesa STK Push
- Give staff real-time inventory visibility to prevent overselling
- Enable promotion campaigns with single-use discount codes

### MVP success metrics
| Metric | Target (90 days post-launch) |
|---|---|
| Orders placed via platform | ≥ 50% of total orders |
| Checkout completion rate | ≥ 60% |
| Payment success rate (M-Pesa) | ≥ 80% |
| Average time from order to dispatch | ≤ 15 min |

---

## 4. User Personas

### 4.1 Shopper (primary)
- Female, 20–40, Nairobi
- Follows BagStreet on Instagram; discovers products there
- Has M-Pesa on their phone
- Wants to buy without creating an account
- Expects delivery within the hour

### 4.2 Staff
- 1–3 people including the owner
- Manages orders, updates statuses, adjusts stock
- Co-ordinates rider dispatch manually (WhatsApp/phone)
- Needs a clean mobile-friendly admin dashboard

### 4.3 Owner / Admin
- Full control: products, categories, shipping zones, promo codes, user management
- Reviews revenue charts, low-stock alerts, order export

---

## 5. User Flows

### 5.1 Customer Purchase Flow

```
[Storefront home]
    │
    ▼
[Browse by category]  ──search──►  [Product listing]
    │
    ▼
[Product detail page]
    │  select size / colour
    ▼
[Add to Bag]  ──►  [Bag (cart) page]
    │  enter phone + name
    ▼
[Checkout]
    ├── select delivery location (shipping zone)
    ├── apply promo code (optional)
    ├── review: subtotal + shipping + discount = TOTAL
    ▼
[Place Order & Pay via M-Pesa]
    │  STK Push sent to phone
    ▼
[Customer approves on phone]
    │
    ▼  (M-Pesa callback received)
[Order CONFIRMED]
    │
    ├── SMS confirmation sent (Africa's Talking)
    └── Admin dashboard shows new order (bell / SSE)

[Staff sees order]  →  calls rider  →  marks DISPATCHED / DELIVERED
```

### 5.2 Admin Order Management Flow

```
[Login] → [Dashboard]
    │
    ▼
[Orders page — PENDING filter]
    │
    ├── View order details (items, customer phone, address, total, discount applied)
    ├── Update status: PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED
    └── Cancel order (stock restored automatically)

[Products page]
    ├── Add product (image, price, category)
    ├── Manage variants (size, colour, stock, SKU)
    ├── Set flash sale: sale price + optional end date per product
    └── Low-stock alert widget on dashboard

[Promotions page]
    ├── Promo codes tab
    │     ├── Create code (code string, % discount, min order, usage limit, expiry)
    │     └── View per-code redemption stats (used / limit)
    ├── Free delivery tab
    │     └── Set global free-delivery threshold (e.g. spend KES 3,000 → delivery free)
    └── Flash sales tab
          └── View all products currently on sale; remove sale price
```

### 5.3 Payment Failure + Retry Flow

```
[STK Push sent → customer on "waiting for payment" screen]
    │
    ├── A) Customer approves on phone
    │         └── Safaricom callback → order CONFIRMED → success screen ✓
    │
    └── B) No approval within ~60s (timeout, dismissed, no signal)
              │
              ▼
    [Payment fallback screen]
    ┌──────────────────────────────────────────┐
    │  Payment not completed                   │
    │                                          │
    │  Option 1:                               │
    │  [Resend M-Pesa Prompt to 07XX]          │  ← new STK Push, same order
    │                                          │
    │  Option 2: Pay manually via M-Pesa menu  │
    │  ┌────────────────────────────────┐      │
    │  │  Till No:  123456              │      │
    │  │  Amount:   KES 3,500           │      │
    │  │  Ref:      Your phone number   │      │
    │  └────────────────────────────────┘      │
    │                                          │
    │  [I've paid — Confirm ▸]                 │
    └──────────────────────────────────────────┘
              │
    [Confirm button pressed]
              │
              ▼
    Server: QuerySTKPushStatus (CheckoutRequestID)
              │
              ├── COMPLETED → mark PAID/CONFIRMED → success screen ✓
              │
              ├── Still PENDING → "Not received yet, try again in a moment"
              │                    (button re-enables after 5s)
              │
              └── FAILED/CANCELLED (customer paid till manually)
                        │
                        ▼
              Server: check C2B records (phone + amount, last 15 min)
                        │
                        ├── C2B match found → mark PAID/CONFIRMED → success ✓
                        │
                        └── No match → "Payment not yet detected.
                                        Our team will confirm shortly."
                                        (order stays PENDING/UNPAID,
                                         staff confirms manually in admin)
```

### 5.4 Staff Manual Confirmation Flow

For the edge case where the customer paid to the till but the C2B match wasn't found (timing issue, wrong reference):

```
[Admin orders page]
    │
    └── Filter: PENDING + UNPAID
          │
          └── Order detail sheet → [Mark as Paid] button (admin/manager only)
                    └── Sets payment_status = PAID, status = CONFIRMED
                        Triggers order confirmation SMS to customer
```

---

## 6. Feature Requirements

### 6.1 Storefront (customer-facing)

| # | Feature | Priority |
|---|---|---|
| S1 | Product listing with category + subcategory filter | Must |
| S2 | Product detail page: images, price, size/colour variants, stock badge | Must |
| S3 | Shopping bag (persistent via localStorage) | Must |
| S4 | Guest checkout: name + phone (no account) | Must |
| S5 | Delivery location selector (flat-rate zones) | Must |
| S6 | Promo code field at checkout | Must |
| S7 | M-Pesa STK Push payment | Must |
| S7a | Payment fallback screen: till number + resend prompt button | Must |
| S7b | "Confirm" button polling payment status (QuerySTKPushStatus → C2B fallback) | Must |
| S8 | Post-payment confirmation page | Must |
| S9 | SMS order confirmation via Africa's Talking | Must |
| S10 | Out-of-stock variant UI (disabled, labelled) | Must |
| S11 | Featured products section on home | Should |
| S12 | Mobile-first responsive design | Must |
| S13 | Flash sale badge + strikethrough original price on product cards and PDP | Must |
| S14 | Free delivery progress banner in bag ("Spend KES X more for free delivery!") | Should |
| S15 | Checkout: delivery auto-set to KES 0 when free-delivery threshold met | Must |

### 6.2 Admin Dashboard

| # | Feature | Priority |
|---|---|---|
| A1 | Secure login (JWT, invite-only) | Must |
| A2 | Dashboard: KPI cards, revenue chart, order status chart, low-stock table | Must |
| A3 | Orders: list, filter by status, view detail sheet, update status | Must |
| A3a | Orders: "Mark as Paid" action for PENDING/UNPAID orders (admin/manager) | Must |
| A4 | Orders: export to CSV | Must |
| A5 | Products: CRUD, image upload, category assignment | Must |
| A6 | Product variants: size/colour/stock/SKU management | Must |
| A7 | Stock adjustment with reason + audit log | Must |
| A8 | Categories: hierarchical (parent → subcategory) | Must |
| A9 | Shipping locations: CRUD, flat-rate prices | Must |
| A10 | Promotions: promo codes, free delivery threshold, flash sales | Must |
| A11 | User management: invite staff, assign roles | Must |

### 6.3 Promotions (new — not yet built)

Three distinct promotion types, managed from a single `/promotions` page in the admin dashboard.

#### 6.3.1 Promo Codes

- Admin creates a code: `code` (string), `value` (% e.g. 10), `min_order_amount` (optional KES floor), `usage_limit` (total redemption cap, NULL = unlimited), `expires_at` (optional), `is_active`
- Customer enters code at checkout → validated server-side → discount applied to cart **subtotal** (before shipping)
- **Single-use per phone**: UNIQUE constraint on `(code_id, phone)` — enforced at DB level
- Server validates in order: exists → is_active → not expired → under cap → phone not already used
- Stored on order: `discount_code` (string snapshot), `discount_amount` (KES)
- Primary use cases: influencer codes, Instagram campaigns, win-back offers

#### 6.3.2 Free Delivery Threshold

- Admin sets a **global** minimum order subtotal above which delivery is free (e.g. KES 3,000)
- Stored as a single key-value in a `settings` table (`free_delivery_threshold`)
- Value of `0` or `NULL` = feature disabled
- At checkout: if `subtotal ≥ threshold` → `shipping_cost = 0` regardless of selected zone
- Storefront bag page shows a nudge banner: *"You're KES 400 away from free delivery!"*
- Storefront checkout: delivery line shows "FREE" when threshold met

#### 6.3.3 Flash Sales

- Admin sets `sale_price` + optional `sale_ends_at` directly on a **product** (not per-variant — the whole product is on sale)
- A background check (or real-time query) auto-expires sales when `sale_ends_at` is past
- Storefront displays:
  - `SALE` badge on product cards and PDP
  - Strikethrough original price next to the sale price
  - Sale price used as the base price for cart and order line items
- No code required — sale price is visible to all shoppers
- Admin flash sales tab shows all currently-on-sale products with a "Remove sale" action

---

## 7. Data Model

### Core tables (existing)

```
users                    — staff/admin accounts
categories               — hierarchical (parent_id self-FK)
products                 — base product (name, price, image_url, is_featured)
product_variants         — size/colour/stock/sku/price_override per variant
inventory_movements      — stock audit log
orders                   — customer orders
order_items              — variant + qty + price snapshot per order line
cart_items               — guest session carts (keyed by session or user)
shipping_locations       — delivery zones with flat prices
mpesa_transactions       — STK Push records per order
```

### New tables (MVP additions)

#### `discount_codes`
```sql
CREATE TABLE IF NOT EXISTS discount_codes (
  id               SERIAL PRIMARY KEY,
  code             VARCHAR(50)   NOT NULL UNIQUE,
  value            DECIMAL(5,2)  NOT NULL CHECK (value > 0 AND value <= 100), -- % off subtotal
  min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  usage_limit      INTEGER,              -- NULL = unlimited
  used_count       INTEGER       NOT NULL DEFAULT 0,
  expires_at       TIMESTAMP,
  is_active        BOOLEAN       NOT NULL DEFAULT true,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### `discount_code_usages`
```sql
CREATE TABLE IF NOT EXISTS discount_code_usages (
  id              SERIAL PRIMARY KEY,
  code_id         INTEGER       NOT NULL REFERENCES discount_codes(id) ON DELETE RESTRICT,
  order_id        INTEGER       NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  phone           VARCHAR(20)   NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (code_id, phone)       -- enforces single-use per phone at DB level
);
```

#### `settings`
```sql
CREATE TABLE IF NOT EXISTS settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT         NOT NULL,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed row for free delivery threshold (0 = disabled):
INSERT INTO settings (key, value) VALUES ('free_delivery_threshold', '0')
  ON CONFLICT (key) DO NOTHING;
```

#### Alter `products` (flash sale)
```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price    DECIMAL(10,2);   -- NULL = not on sale
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_ends_at  TIMESTAMP;        -- NULL = no expiry
```

#### Alter `orders`
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code    VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount  DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name    VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone   VARCHAR(20);
```

> **Note**: `customer_name` and `customer_phone` may already be present from the M-Pesa guest checkout flow — confirm before altering.

### Effective price logic (order of precedence)

When resolving the price of a line item at checkout:

```
1. variant.price_override   (if set — variant-specific price)
2. product.sale_price       (if set AND not expired — flash sale)
3. product.price            (base price)
```

Discount codes are then applied to the **subtotal** of all line items at the cart level, not per item.

Free delivery is checked after the promo code discount: if `subtotal_after_discount ≥ free_delivery_threshold`, shipping is zeroed out.

```
effective_item_price  = price_override ?? (sale active ? sale_price : base_price)
subtotal              = Σ(effective_item_price × qty)
discount_amount       = promo_code valid ? floor(subtotal × value / 100) : 0
shipping_cost         = (subtotal - discount_amount) >= threshold ? 0 : zone_price
total_amount          = subtotal - discount_amount + shipping_cost
```

### Full entity relationship (simplified)

```
settings                                           -- free_delivery_threshold
categories (hierarchical)
    └── products (sale_price, sale_ends_at)
            └── product_variants ──── inventory_movements
                    │
                    └── order_items ──── orders ──── mpesa_transactions
                                            │         (discount_code, discount_amount)
                                            ├── shipping_locations
                                            ├── discount_codes ─── discount_code_usages
                                            └── users (staff)
```

---

## 8. Technical Architecture

### Stack

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Bun | Fast, native TypeScript |
| API server | Hono | Lightweight, middleware-based |
| Database | PostgreSQL | via `bun:sql` |
| Object storage | MinIO | Product images |
| Message queue | RabbitMQ | Email jobs |
| Payments | M-Pesa Daraja | STK Push + IPN callback |
| SMS | Africa's Talking | Order confirmation SMS |
| Admin frontend | React + TanStack Router + TanStack Query | |
| Storefront | React + TanStack Router + TanStack Query | Mobile-first |
| Shared types | TypeScript monorepo (`shared/`) | Compiled to `shared/dist` |
| Package manager | Bun | Workspaces via turbo.json |

### Service layout

```
bagstreet-ecommerce/
├── server/               ← Hono API
│   └── src/
│       ├── features/
│       │   ├── auth/
│       │   ├── cart/
│       │   ├── categories/
│       │   ├── discounts/        ← NEW
│       │   ├── notifications/    ← extend with SMS
│       │   ├── orders/
│       │   ├── payments/
│       │   ├── products/
│       │   ├── shipping/
│       │   └── users/
│       ├── lib/
│       │   ├── db.ts
│       │   ├── email.ts
│       │   ├── sms.ts            ← NEW (Africa's Talking)
│       │   └── inventory.ts
│       └── services/
│           ├── messagequeue.ts
│           └── mpesa.ts
├── client/               ← Admin dashboard
├── storefront/           ← Customer storefront
└── shared/               ← Shared TypeScript types
```

### Auth model

- Staff/admin: JWT (email/password, invite-only registration)
- Customers: **no auth** — guest checkout by phone number
- Roles: `ADMIN`, `MANAGER`, `STAFF`

### Payment flow — happy path (sequence)

```
Customer          Storefront        Server           M-Pesa         Africa's Talking
    │──Place Order──►│                │                │                │
    │               │──POST /orders──►│                │                │
    │               │                │──STK Push──────►│                │
    │               │◄──order:PENDING─│                │                │
    │◄─"Check phone"─│                │                │                │
    │──Approve on phone──────────────────────────────►│                │
    │               │                │◄──STK Callback──│                │
    │               │                │──markOrderPaid  │                │
    │               │                │──Send SMS────────────────────────►│
    │               │◄──SSE push──────│                │                │
    │◄──"Order confirmed"─│           │                │                │
    │◄──SMS confirmation──────────────────────────────────────────────────│
```

### Payment flow — failure + retry (sequence)

```
Customer          Storefront        Server           M-Pesa (STK)   M-Pesa (C2B)
    │               │                │                │                │
    │  [dismisses prompt / times out]│                │                │
    │◄──Fallback screen──│           │                │                │
    │                    │           │                │                │
    │──[Resend prompt]──►│           │                │                │
    │               │──POST /payments/mpesa/resend───►│                │
    │               │◄──new CheckoutRequestID─────────│                │
    │──Approve──────────────────────────────────────►│                │
    │               │                │◄──STK Callback──│                │
    │               │                │──markOrderPaid ──────────────────►(SMS)
    │◄──"Order confirmed"─────────────│                │                │
    │                                │                │                │
    │  [OR: pays to till manually]   │                │                │
    │──[Confirm button]─►│           │                │                │
    │               │──GET /payments/mpesa/status/:id►│                │
    │               │                │──QuerySTKStatus►│               │
    │               │                │  (FAILED)       │               │
    │               │                │────────────────────────────────►│ check C2B
    │               │                │◄─────────────── C2B match found─│
    │               │                │──markOrderPaid                  │
    │◄──"Order confirmed"─────────────│                                 │
    │                                │                                 │
    │  [OR: C2B not found yet]       │                                 │
    │◄──"Not detected yet, retry"─────│                                │
    │               │                │         (staff confirms manually)│
```

---

## 9. API Design

### Promo code endpoints

```
GET    /api/discounts/validate?code=XXXX&subtotal=XXXX&phone=07XX   public — validate + preview
POST   /api/discounts                                                admin — create code
GET    /api/discounts                                                admin — list all codes
PUT    /api/discounts/:id                                            admin — update / toggle active
DELETE /api/discounts/:id                                            admin — deactivate (soft)
```

### Free delivery threshold endpoints

```
GET    /api/settings/free-delivery-threshold   public — returns { threshold: number }
PUT    /api/settings/free-delivery-threshold   admin  — body: { threshold: number }
```

### Flash sale endpoints (product-level)

```
PATCH  /api/products/:id/sale   admin — body: { sale_price, sale_ends_at? } or { sale_price: null } to remove
GET    /api/products/on-sale    admin — list all products currently on sale
```

> Flash sales are also visible through the normal `GET /api/products` and `GET /api/products/:id` endpoints — `sale_price` and `sale_ends_at` fields included in `ProductResponse`.

### Updated order creation

```
POST /api/orders
Body: {
  items: [{ variant_id, quantity }],
  shipping_location_id: number,
  customer_name: string,
  phone: string,                  // used for M-Pesa + SMS
  discount_code?: string
}
Response: {
  order: OrderResponse,           // payment_status: 'UNPAID', discount_amount included
  message: "Check your phone for M-Pesa prompt"
}
```

### Payment retry + status endpoints

```
-- Resend STK Push to same phone for an existing UNPAID order
POST /api/payments/mpesa/resend
Auth: none (public — identified by order_id + phone)
Body: { order_id: number, phone: string }
Response: { message: "Prompt resent — check your phone" }
Notes: rate-limited to 1 resend per 30s per order; creates new mpesa_transactions row

-- Poll payment status (Confirm button)
GET  /api/payments/mpesa/status/:orderId
Auth: none (public)
Response:
  { status: 'CONFIRMED', order: OrderResponse }            // paid — redirect to success
  { status: 'PENDING', message: "Not received yet" }       // still waiting
  { status: 'NOT_FOUND', message: "Not detected yet..." }  // C2B not matched either

-- C2B webhook (Safaricom → server when customer pays till manually)
POST /api/payments/mpesa/c2b-callback
Auth: none (Safaricom calls this)
Notes: matches incoming payment to UNPAID order by phone + amount within 15-min window;
       on match → markOrderPaid → SMS confirmation; unmatched payments stored for manual review

-- Admin: manually confirm payment
PATCH /api/orders/:id/confirm-payment
Auth: ADMIN | MANAGER
Notes: sets payment_status=PAID, status=CONFIRMED, triggers SMS
```

### SMS notifications (Africa's Talking)

```
Order CONFIRMED (happy path or manual confirm):
  "BagStreet: Order #AB1234 confirmed! KES 3,500 received.
   Rider on the way — ETA 1 hour. Questions? Call 0700 000 000"

Payment not detected (Confirm button — no match):
  "BagStreet: We haven't received payment for order #AB1234 yet.
   Pay to Till 123456, Amount KES 3,500, Ref your phone number.
   Call 0700 000 000 if you've already paid."
```

---

## 10. Non-Functional Requirements

| Concern | Target |
|---|---|
| Page load (storefront) | < 2s on 3G |
| API response time (p95) | < 300ms |
| M-Pesa callback handling | Idempotent — safe to receive twice |
| Inventory | Variant stock locked with `SELECT FOR UPDATE` during order |
| Security | No PII logged; M-Pesa credentials in env only |
| Mobile | Storefront designed mobile-first (375px base) |

---

## 11. Out of Scope — MVP

- Rider portal / dispatch app
- Customer accounts / order history lookup
- WhatsApp Business API integration
- Card payments (Stripe / Pesapal)
- Product reviews
- Wishlists
- Returns / refund automation
- Multi-store / multi-warehouse
- Loyalty programme
- Instagram shop sync

---

## 12. Build Sequence (recommended)

| Phase | Deliverable | Status |
|---|---|---|
| **0 — Foundation** | DB, auth, products, categories, variants, cart, orders | ✅ Done |
| **1 — Payments** | M-Pesa STK Push + STK callback | ✅ Done |
| **1b — Payment retry** | Fallback screen (till number + resend STK), QuerySTKPushStatus polling, C2B webhook, admin manual confirm | 🔲 Next |
| **2 — Logistics** | Shipping locations, order status management | ✅ Done |
| **3 — Admin polish** | Dashboard charts, low-stock, CSV export, image update, pagination | ✅ Done |
| **4 — Promotions** | Promo codes (% off, single-use per phone) + free delivery threshold + flash sale prices | 🔲 Next |
| **5 — SMS** | Africa's Talking — order confirmation + payment failure SMS | 🔲 Next |
| **6 — Storefront polish** | Mobile UX, SEO, performance | 🔲 After |
| **7 — Launch** | Domain, SSL, production env, smoke tests | 🔲 After |
