# BagStreet — Product Requirements Document

**Version**: 1.0 — MVP
**Last updated**: 2026-06-26
**Status**: Draft

---

## 1. Overview

BagStreet is a Nairobi-based fashion accessories ecommerce platform specialising in handbags, shoes, scarves, wallets, and belts. The business currently operates via Instagram DMs and dispatches a bike messenger to deliver within one hour of an order being placed.

This platform replaces the manual Instagram workflow with a self-serve storefront while preserving the same same-day delivery model. Customers browse, checkout with contact details only (no account required), and pay via Pesapal hosted checkout. Staff manage orders and manually co-ordinate rider dispatch.

---

## 2. Problem Statement

| Current pain point | Impact |
|---|---|
| Orders managed manually via Instagram DM | No order history, inventory visibility, or audit trail |
| No structured payment collection | Cash/manual Pesapal send; no automated confirmation |
| Stock tracked in spreadsheets or memory | Overselling, no product-level stock health, no low-stock email alerts |
| No way to run promotions at scale | Promo codes shared on Instagram but honoured manually |
| All communication is 1-to-1 DMs | Doesn't scale; owner spends hours in chat |

---

## 3. Goals

### Business goals
- Convert Instagram browsers into paying customers with ≤3 taps from product page to order placed
- Eliminate manual payment reconciliation via automated Pesapal hosted checkout
- Give staff real-time inventory visibility to prevent overselling
- Enable promotion campaigns with single-use discount codes

### MVP success metrics
| Metric | Target (90 days post-launch) |
|---|---|
| Orders placed via platform | ≥ 50% of total orders |
| Checkout completion rate | ≥ 60% |
| Payment success rate (Pesapal) | ≥ 80% |
| Average time from order to dispatch | ≤ 15 min |

---

## 4. User Personas

### 4.1 Shopper (primary)
- Female, 20–40, Nairobi
- Follows BagStreet on Instagram; discovers products there
- Can pay through Pesapal-supported methods such as mobile money or card
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
    │  enter name + email + phone
    ▼
[Checkout]
    ├── select delivery location (shipping zone)
    ├── apply promo code (optional)
    ├── review: subtotal + shipping + discount = TOTAL
    ▼
[Place Order & Pay via Pesapal]
    │  redirected to hosted checkout
    ▼
[Customer completes payment]
    │
    ▼  (Pesapal callback received)
[Order CONFIRMED]
    │
    ├── email confirmation sent (transactional email)
    └── Admin dashboard shows new order (bell / SSE)

[Staff sees order]  →  calls rider  →  customer/admin marks RECEIVED
```

### 5.2 Admin Order Management Flow

```
[Login] → [Dashboard]
    │
    ▼
[Orders page — PENDING filter]
    │
    ├── View order details (items, customer phone, address, total, discount applied)
    ├── Update status: PENDING → CONFIRMED → RECEIVED / CANCELLED / REFUNDED
    └── Cancel order (stock restored automatically)

[Products page]
    ├── Add product (image, price, category)
    ├── Manage variants (size, colour, stock, SKU)
    ├── Set flash sale: sale price + optional end date per product
    ├── Show product-level stock badge: red "low" when any variant needs attention, green "high" when healthy
    ├── Send admin/manager email when a variant reaches low stock
    └── Low-stock alert widget on dashboard

[Notifications]
    └── Clicking a notification opens the relevant admin page, e.g. orders or products

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
[hosted checkout started → customer is sent to Pesapal]
    │
    ├── A) Customer completes payment
    │         └── Pesapal callback/IPN → order CONFIRMED → success screen ✓
    │
    └── B) Payment is cancelled, fails, or is still pending
              │
              ▼
    [Payment fallback screen]
    ┌──────────────────────────────────────────┐
    │  Payment not completed                   │
    │                                          │
    │  Option 1:                               │
    │  [Continue to Pesapal]                    │  ← resumes or creates hosted checkout
    │                                          │
    │  Option 2:                               │
    │  [Check payment status]                  │
    │                                          │
    │  [I've paid — Confirm ▸]                 │
    └──────────────────────────────────────────┘
              │
    [Confirm button pressed]
              │
              ▼
    Server: GetTransactionStatus (OrderTrackingId)
              │
              ├── COMPLETED → mark PAID/CONFIRMED → success screen ✓
              │
              ├── Still PENDING → "Not received yet, try again in a moment"
              │                    (button re-enables after 5s)
              │
              └── FAILED/CANCELLED → show failure message
                                      (order stays PENDING/UNPAID,
                                       customer can retry hosted checkout
                                       or staff can confirm manually)
```

### 5.4 Staff Manual Confirmation Flow

For the edge case where Pesapal shows payment success but the automated callback/IPN was delayed or missed:

```
[Admin orders page]
    │
    └── Filter: PENDING + UNPAID
          │
          └── Order detail sheet → [Mark as Paid] button (admin/manager only)
                    └── Sets payment_status = PAID, status = CONFIRMED
                        Triggers order confirmation email to customer
```

---

## 6. Feature Requirements

### 6.1 Storefront (customer-facing)

| # | Feature | Priority |
|---|---|---|
| S1 | Product listing with category + subcategory filter | Must |
| S2 | Product detail page: images, price, size/colour variants, stock badge | Must |
| S3 | Shopping bag (persistent via localStorage) | Must |
| S4 | Guest checkout: name + email + phone (no account) | Must |
| S5 | Delivery location selector (flat-rate zones) | Must |
| S6 | Promo code field at checkout | Must |
| S7 | Pesapal hosted checkout payment | Must |
| S7a | Payment fallback screen: continue payment + check status buttons | Must |
| S7b | "Check status" button polling Pesapal GetTransactionStatus | Must |
| S8 | Post-payment confirmation page | Must |
| S9 | Email order confirmation and payment-failure notice via transactional email | Must |
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
| A3a | Order lifecycle: unpaid `PENDING`, paid `CONFIRMED`, customer/admin-confirmed `RECEIVED`, plus `CANCELLED` and `REFUNDED` | Must |
| A3a | Orders: "Mark as Paid" action for PENDING/UNPAID orders (admin/manager) | Must |
| A4 | Orders: export to CSV | Must |
| A5 | Products: CRUD, image upload, category assignment | Must |
| A6 | Product variants: size/colour/stock/SKU management | Must |
| A6a | Product list: stock-health badge showing red `low` when any active variant is low/out, green `high` when all active variants are healthy | Must |
| A6b | Low-stock email alert to active admins/managers when checkout reduces a variant to or below threshold | Must |
| A7 | Stock adjustment with reason + audit log | Must |
| A8 | Categories: hierarchical (parent → subcategory) | Must |
| A9 | Shipping locations: CRUD, flat-rate prices | Must |
| A10 | Promotions: promo codes, free delivery threshold, flash sales | Must |
| A10a | Promo-code generator button for faster admin code creation | Should |
| A11 | User management: invite staff, assign roles | Must |

### 6.3 Promotions

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
payment_transactions       — hosted checkout records per order
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

> **Note**: `customer_name` and `customer_phone` may already be present from the Pesapal guest checkout flow — confirm before altering.

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
                    └── order_items ──── orders ──── payment_transactions
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
| Payments | Pesapal API 3.0 | Hosted checkout + callback/IPN + status verification |
| Notifications | Email | Customer and staff transactional email |
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
│       │   ├── notifications/
│       │   ├── orders/
│       │   ├── payments/
│       │   ├── products/
│       │   ├── shipping/
│       │   └── users/
│       ├── lib/
│       │   ├── db.ts
│       │   ├── email.ts
│       │   ├── phone.ts
│       │   └── inventory.ts
│       └── services/
│           ├── messagequeue.ts
│           └── pesapal.ts
├── client/               ← Admin dashboard
├── storefront/           ← Customer storefront
└── shared/               ← Shared TypeScript types
```

### Auth model

- Staff/admin: JWT (email/password, invite-only registration)
- Customers: **no auth** — guest checkout by email + phone
- Roles: `ADMIN`, `MANAGER`, `STAFF`

### Payment flow — happy path (sequence)

```
Customer          Storefront        Server           Pesapal         transactional email
    │──Place Order──►│                │                │                │
    │               │──POST /orders──►│                │                │
    │               │                │──SubmitOrderRequest──►│                │
    │               │◄──redirect URL──│                │                │
    │──Hosted checkout──────────────────────────────►│                │
    │──Completes payment────────────────────────────►│                │
    │               │                │◄──callback/IPN────────│
    │               │                │──markOrderPaid  │                │
    │               │                │──Send email────────────────────────►│
    │               │◄──SSE push──────│                │                │
    │◄──"Order confirmed"─│           │                │                │
    │◄──email confirmation──────────────────────────────────────────────────│
```

### Payment flow — failure + retry (sequence)

```
Customer          Storefront        Server           Pesapal         Email
    │               │                │                │              │
    │  [cancels / payment pending]   │                │              │
    │◄──Fallback screen──│           │                │              │
    │                    │           │                │              │
    │──[Continue payment]►│           │                │              │
    │               │──POST /payments/pesapal/initiate►│              │
    │               │◄──redirect URL or pending status│              │
    │──Hosted checkout──────────────────────────────►│              │
    │               │                │◄──callback/IPN────────│        │
    │               │                │──GetTransactionStatus►│        │
    │               │                │◄──COMPLETED/FAILED────│        │
    │               │                │──mark paid or failed           │
    │               │                │──send confirmation/failure────►│
    │◄──"Order confirmed" or "Payment pending"───────│              │
    │               │                │         (staff confirms manually only when needed)
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
  email: string,                  // used for transactional email
  phone: string,                  // used for Pesapal billing/contact details
  discount_code?: string
}
Response: {
  order: OrderResponse,           // payment_status: 'UNPAID', discount_amount included
  message: "Continue to secure payment"
}
```

### Payment retry + status endpoints

```
-- Start or resume hosted checkout for an existing UNPAID order
POST /api/payments/pesapal/initiate
Auth: optional (public orders identified by order_id + phone/email)
Body: { order_id: number, phone?: string, email?: string }
Response: { payment_provider: 'pesapal', payment_reference, payment_redirect_url }
Notes: returns the existing checkout URL when possible; otherwise submits a new Pesapal order

-- Poll payment status (Check Status button)
POST /api/payments/pesapal/status
Auth: optional (public orders identified by order_id + phone/email)
Body: { order_id?: number, order_tracking_id?: string, phone?: string, email?: string }
Response:
  { status: 'CONFIRMED', order: OrderResponse }            // paid — redirect to success
  { status: 'PENDING', message: "Not received yet" }       // still waiting
  { status: 'FAILED', message: "Payment failed" }          // customer can retry

-- Pesapal IPN
GET|POST /api/payments/pesapal/ipn
Auth: none (Pesapal calls this)
Notes: receives OrderTrackingId and then verifies final status through GetTransactionStatus;
       on paid → markOrderPaid → email confirmation; on failed → email failure notice

-- Admin: manually confirm payment
PATCH /api/orders/:id/confirm-payment
Auth: ADMIN | MANAGER
Notes: sets payment_status=PAID, status=CONFIRMED, triggers email
```

### Customer receipt confirmation

- The order confirmation email includes a signed `Confirm Received` button.
- Clicking the button opens the storefront and marks the paid order as received.
- Admins can also mark an order as received manually when the customer forgets.
- For implementation compatibility, received orders are stored as `DELIVERED` internally and displayed as `Received` in the UI.

### Admin low-stock alerts

- Trigger: after checkout reduces any active product variant to `stock <= low_stock_threshold`.
- Recipients: active admins and managers.
- Channels:
  - In-app notification for real-time visibility.
  - Email alert for staff who are not currently watching the dashboard.
- Email content: product name, variant details, current stock, threshold, and prompt to restock or deactivate.
- Product list visibility:
  - Red `low` badge when any active variant is low or out of stock.
  - Green `high` badge when all active variants are above threshold.

### Development checkout shortcut

- In development only, the checkout payment screen shows a `Finish Development Order` button.
- Clicking it marks the order as paid/confirmed so local testing can continue without waiting for a Pesapal callback.
- This must be disabled in production; live checkout remains Pesapal hosted checkout with callback/IPN status verification.

### Email notifications (transactional email)

```
Order CONFIRMED (happy path or manual confirm):
  "BagStreet: Order #AB1234 confirmed! KES 3,500 received.
   Rider on the way — ETA 1 hour. Questions? Call 0700 000 000"

Payment failed or not completed:
  "BagStreet: We haven't received payment for order #AB1234 yet.
   Continue checkout through Pesapal or call 0700 000 000 if you've already paid."
```

Implementation status:
- Order confirmation email is sent when payment is confirmed through Pesapal callback, Pesapal status verification, admin "Mark as Paid", or the development checkout shortcut.
- Payment failure email is sent when Pesapal status verification returns a failed or reversed payment.
- In development, missing transactional email credentials logs the email instead of blocking checkout.

---

## 10. Non-Functional Requirements

| Concern | Target |
|---|---|
| Page load (storefront) | < 2s on 3G |
| API response time (p95) | < 300ms |
| Pesapal callback handling | Idempotent — safe to receive twice |
| Inventory | Variant stock locked with `SELECT FOR UPDATE` during order |
| Security | No PII logged; Pesapal credentials in env only |
| Mobile | Storefront designed mobile-first (375px base) |

---

## 11. Out of Scope — MVP

- Rider portal / dispatch app
- Customer accounts / order history lookup
- WhatsApp Business API integration
- Direct card gateway outside Pesapal
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
| **1 — Payments** | Pesapal hosted checkout + callback/IPN status verification | ✅ Done |
| **1b — Payment retry** | Continue payment + status check + admin manual confirm | ✅ Done |
| **2 — Logistics** | Shipping locations, order status management | ✅ Done |
| **3 — Admin polish** | Dashboard charts, low-stock, CSV export, image update, pagination | ✅ Done |
| **4 — Promotions** | Promo codes (% off, single-use per phone) + free delivery threshold + flash sale prices | ✅ Done |
| **5 — Email notifications** | Order confirmation, low stock, payment failure, staff alerts | ✅ Done |
| **6 — Storefront polish** | Mobile UX, SEO, performance | ✅ Done |
| **7 — Launch** | Domain, SSL, production env, smoke tests | 🔲 After |
