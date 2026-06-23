# BagStreet — Development Roadmap

Fashion ecommerce platform (handbags, shoes, scarves).

**Last updated:** June 2026

---

## Current Status: ~60% Complete

---

## ✅ Completed

### Infrastructure
- [x] PostgreSQL + MinIO (image storage) + RabbitMQ via Docker Compose
- [x] Monorepo with shared TypeScript types (client ↔ server)
- [x] Bun + Hono backend, Vite + React frontend
- [x] Rate limiting middleware
- [x] Centralised error handling + response helpers

### Auth
- [x] Register, login, logout
- [x] JWT access tokens + refresh tokens
- [x] Role-based access (`CUSTOMER`, `ADMIN`, `MANAGER`)
- [x] Auth middleware (`requireAuth`)

### Admin Dashboard
- [x] Login page, auth context, protected routes
- [x] Dashboard — stat cards (categories, products, orders, pending), recent orders table
- [x] **Categories** — list, create, edit, delete
- [x] **Products** — list with search/status filter, create (with image upload), edit, delete
- [x] **Product Variants** — per-variant stock, size/color/price-override, inline stock adjustment, active toggle (VariantsSheet)
- [x] **Orders** — list with search, view detail sheet, status update by admin, cancel
- [x] **Users** — list, create, edit, delete (ADMIN-only)

### Backend APIs
- [x] `/api/auth` — register, login, refresh, logout, me
- [x] `/api/categories` — full CRUD
- [x] `/api/products` — full CRUD, image upload via MinIO
- [x] `/api/products/:id/variants` — full CRUD, stock management
- [x] `/api/users` — full CRUD (admin)
- [x] `/api/cart` — add/update/remove/clear, variant-aware (validates stock + active)
- [x] `/api/orders` — create, list, get, status update, cancel; variant stock decrement + restore

---

## 🔲 Remaining

---

### 1. Admin Dashboard — Quick Wins

| Item | Notes |
|------|-------|
| **Show variant info in OrderSheet** | size/color/SKU already in API response, not rendered in the sheet yet |
| **Server-side pagination — orders** | currently fetches all orders; breaks at scale |
| **Server-side pagination — products** | API supports `page`/`limit` but client doesn't pass them |
| **Product image update** | edit form only allows name/description/price today |
| **Orders: filter by status** | allow admin to filter the orders table by PENDING, SHIPPED, etc. |
| **Dashboard: low stock alert** | table/card for variants with stock below a threshold |
| **Dashboard: revenue chart** | revenue over time (daily/weekly), uses data already in orders table |
| **Order export to CSV** | accounting convenience |

---

### 2. Customer-Facing Storefront ← Biggest Gap

No public storefront exists yet. This is the core remaining piece.

#### 2a. Layout & Routing
- [ ] `StoreLayout` — header (logo, nav, cart icon with badge, login/account menu), footer
- [ ] Separate route tree: `/` home, `/shop`, `/shop/:slug`, `/cart`, `/checkout`, `/account/*`

#### 2b. Product Catalog
- [ ] `/shop` — product grid, filter by category, sort (price, newest), search, pagination/infinite scroll
- [ ] Product card — image, name, price, variant availability indicator, quick add-to-cart

#### 2c. Product Detail
- [ ] `/shop/:slug` — images, description, **variant selector** (size/color dropdowns/buttons), stock indicator, quantity picker, add to cart
- [ ] Related products (same category)
- [ ] Breadcrumb navigation

#### 2d. Shopping Cart (Customer UI)
- [ ] `/cart` — line items with variant size/color, quantity adjusters, remove, totals
- [ ] Cart drawer/slide-out (optional quick-access from header)

#### 2e. Checkout
- [ ] Shipping address form (reuse `ShippingAddress` type already in shared types)
- [ ] Order review — items + variant info, totals
- [ ] Place order → call existing `POST /api/orders`
- [ ] Confirmation page with order ID

#### 2f. Customer Account
- [ ] Customer registration page (self-signup, distinct from admin-created staff)
- [ ] `/account/orders` — customer's order history, status badges
- [ ] `/account/orders/:id` — order detail with variant info, cancel button for PENDING

---

### 3. Async Notifications (RabbitMQ is running, unused)

- [ ] Choose email provider — [Resend](https://resend.com/) recommended
- [ ] RabbitMQ producer in server — publish events: `order.created`, `order.status_changed`
- [ ] Worker service — consume events, send emails
- [ ] Email templates:
  - [ ] Order confirmation (customer)
  - [ ] Order status change — SHIPPED / DELIVERED (customer)
  - [ ] Low stock alert (admin)
- [ ] Welcome email on customer registration

---

### 4. Auth Improvements

- [ ] **Password reset** — forgot-password form → email link → reset form (token in DB)
- [ ] **Email verification** — verify on customer signup before account is active
- [ ] **Customer self-registration** — currently only admin can create accounts

---

### 5. Catalogue Enhancements

- [ ] **Discount / coupon codes** — fixed or % off, apply at checkout
  ```
  coupons: code, discount_type, discount_value, min_order, usage_limit, valid_until
  ```
- [ ] **Multiple product images** — currently single `image_url`; add `product_images` table
- [ ] **Product tags** — free-form tags for cross-category filtering
- [ ] **Wishlist** — save products for later (requires customer auth)

---

### 6. Analytics & Reporting

- [ ] **Revenue over time** — daily/weekly/monthly chart on dashboard
- [ ] **Best-selling products** — by units sold and revenue
- [ ] **Stock report** — all variant stock levels, exportable to CSV
- [ ] **Customer report** — total customers, new signups over time

---

### 7. Production Readiness

- [ ] **Production Docker Compose** — separate compose, proper secrets handling
- [ ] **`.env.example`** — document all required env vars
- [ ] **CI/CD** — GitHub Actions: lint + type-check on PR, build on merge to main
- [ ] **Error monitoring** — Sentry or equivalent
- [ ] **Health check endpoint** — `GET /health` returning DB + MinIO status
- [ ] **API docs** — OpenAPI/Swagger (Hono has `zod-openapi` dep already present)
- [ ] **Automated DB backups**

---

### 8. Payment Integration (Pre-Launch)

- [ ] Choose provider — Stripe recommended
- [ ] `POST /api/payments/create-intent` → Stripe Payment Intent
- [ ] Stripe webhook handler — `payment_intent.succeeded` → mark order paid, clear cart
- [ ] `@stripe/react-stripe-js` in checkout flow
- [ ] Refund capability in admin OrderSheet

---

## Priority Order

1. **Order variant info in OrderSheet** — 1 hour, data exists in API
2. **Customer storefront — catalog + product detail** — first public-facing piece
3. **Customer cart UI + checkout** — completes purchase loop
4. **Customer auth (self-registration, login)** — required before storefront goes live
5. **Email notifications via RabbitMQ** — order confirmation is table stakes
6. **Password reset**
7. **Admin: pagination + revenue chart + low stock widget**
8. **Payment (Stripe)** — needed for real transactions
9. **Coupon codes**
10. **Production CI/CD + monitoring**

---

## Future (Post-Launch)

- Product reviews & ratings (requires verified purchase check)
- Guest checkout
- Shipping carrier integrations (print labels, tracking)
- Returns & exchanges workflow
- Abandoned cart recovery emails
- Social login (Google/Apple)
- Multi-currency / i18n
- Mobile app
- B2B / wholesale pricing tiers
- Loyalty programme
