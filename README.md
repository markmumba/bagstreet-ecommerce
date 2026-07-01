# Bagstreet Ecommerce

A full-stack luxury e-commerce platform built with Bun, Hono, React, and PostgreSQL.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| Backend | Hono |
| Database | PostgreSQL (`bun:sql`) |
| Frontend (Admin) | React + TanStack Router + TanStack Query |
| Frontend (Storefront) | React + TanStack Router |
| Shared Types | TypeScript monorepo (`shared/`) |
| File Storage | MinIO |
| Monorepo | Turborepo |

## Project Structure

```
.
├── client/        # Admin dashboard (React)
├── server/        # API server (Hono)
├── storefront/    # Customer-facing store (React)
├── shared/        # Shared TypeScript types
└── turbo.json
```

## Getting Started

```bash
# Install dependencies
bun install

# Run all workspaces
bun run dev

# Individual workspaces
bun run dev:client      # Admin dashboard  → http://localhost:5173
bun run dev:server      # API server       → http://localhost:3000
bun run dev:storefront  # Storefront       → http://localhost:5174

# Apply database migrations
bun run db:migrate
```

In development the API applies pending migrations on startup. In production, run
`bun run db:migrate` during deployment before starting the server. The server
checks for pending migrations and exits instead of changing the schema at boot.

### Environment Variables

Copy `.env.example` to `.env` in the `server/` directory. Required:

```env
DATABASE_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=

# Optional — SMTP for emails (dev falls back to console.log)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
CLIENT_URL=http://localhost:5173

# Optional — RabbitMQ (dev falls back to direct send)
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# Optional — Pesapal API 3.0 (required for live payment processing)
PESAPAL_ENV=sandbox
PESAPAL_CONSUMER_KEY=
PESAPAL_CONSUMER_SECRET=
PESAPAL_IPN_ID=
PESAPAL_CALLBACK_URL=https://yourdomain.com/api/payments/pesapal/callback
PESAPAL_CANCELLATION_URL=https://yourdomain.com/checkout
PESAPAL_CURRENCY=KES
```

---

## Features — Implemented ✅

### Auth
- JWT access tokens + httpOnly refresh token rotation
- Customer self-registration
- Staff invite-by-email flow (admin sends invite → staff sets own password)
- Accept invite page (`/accept-invite?token=`)
- Forgot / reset password (email link, separate URLs for staff vs customer)

### Admin Dashboard (`/dashboard`)
- Stats: total categories, products, orders, revenue
- Revenue over time chart
- Order status breakdown chart

### Users (`/users`)
- List / search / filter staff users
- Create via email invite (no admin-set password)
- Edit role + active status
- Delete

### Categories (`/categories`)
- Hierarchical (parent → subcategory)
- Admin CRUD with parent selector
- Storefront: two-level filter tabs

### Products (`/products`)
- Full CRUD with image upload (MinIO)
- SKU auto-generation
- Featured toggle (shown in storefront hero section)
- Variants per product (size, color, stock, price override, per-variant low stock threshold)
- Stock lives on variants

### Inventory
- Inventory movements audit trail (`ORDER_PLACED`, `ORDER_CANCELLED`, `ADMIN_ADJUSTMENT`, `RESTOCK`)
- Admin stock adjustment endpoint with reason + note
- Per-variant low stock threshold with admin/manager in-app alerts
- Stock history view per variant in admin dashboard

### Orders (`/orders`)
- Admin: list, filter by status, view detail, update status
- Customer: place order, view order history, cancel pending orders
- Stock decremented on order placement (per variant, with row-level locking)
- Stock restored on cancel/refund

### Cart
- Variant-based cart (size/color aware)
- Per-user persistent cart

### Notifications
- In-app SSE notification bell (admin/manager)
- New order alerts + low stock / out-of-stock alerts pushed in real time
- Email alerts for customer order confirmation, payment failure, and admin low-stock events

### Emails (via RabbitMQ queue)
- Staff invite, order confirmation, payment failure, low-stock alert, password reset
- External HTML templates (`server/src/lib/templates/`)
- RabbitMQ queue (`email.queue`) with DLQ fallback; direct send when queue unavailable

### Storefront
- Luxury design (Cormorant Garamond + DM Sans, ivory + oxblood palette)
- Product listing with category filter (parent + subcategory) + search
- Product detail page with variant selector
- Cart + Checkout flow
- Customer order history + account page (profile, password change)

---

## Roadmap 🗺️

### 🔴 Must-Have

- [x] **Forgot / Reset Password** — email link flow for all users
- [x] **Order Confirmation Email** — transactional email after order placement
- [x] **Pesapal Hosted Payments** — Pesapal API 3.0; hosted checkout, callback/IPN, status verification
- [ ] **Shipping Locations** — admin-managed location list with flat delivery prices; customer picks at checkout; cost added to order total

### 🔴 Critical Gaps

- [x] **Customer Receipt Confirmation** — order confirmation email includes a signed button for customers to mark packages as received
- [ ] **VAT / Tax** — 16% VAT line on orders (legal requirement); configurable rate in admin
- [ ] **Saved Address Book** — customer saves multiple delivery addresses; pre-fill at checkout

### 🟡 Important

- [x] **Low Stock Alerts** — in-app notification when variant stock drops below per-variant threshold
- [x] **Customer Account Page** — profile management on storefront
- [x] **Storefront Search** — URL-driven, debounced
- [ ] **Abandoned Cart Recovery** — scheduled job emails customers with cart items left > 24 hrs
- [ ] **Admin Sales Reports + CSV Export** — date-range revenue, top products, orders export
- [ ] **Wishlist** — save products for later (important for luxury repeat-browse behaviour)

### 🟢 Nice-to-Have

- [ ] **Product Reviews & Ratings** — verified-purchase reviews on PDP
- [ ] **Discount Codes / Promotions** — coupon codes applied at checkout
- [ ] **Returns / Refunds Module** — structured return request flow (`REFUNDED` status exists)
- [ ] **Order Shipping Tracking** — tracking number field only if dispatch becomes less manual
- [ ] **Order Lifecycle Emails** — focused emails for payment failure, refund, and recovery flows
- [ ] **Social Login** — Google OAuth to reduce registration friction
- [ ] **Product Recommendations** — "You may also like" on PDP (same category / purchase co-occurrence)
