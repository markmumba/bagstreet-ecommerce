# BagStreet E-Commerce Platform - Development Roadmap

## Current Status: ~20% Complete

### ✅ Completed Features
- **Categories Management** - Full CRUD (Backend + Frontend + Database)
- **Database Infrastructure** - PostgreSQL with Docker
- **Admin Dashboard** - Sidebar navigation with TanStack Router
- **Error Handling** - Comprehensive error system
- **Type Safety** - Shared types across monorepo
- **UI Component Library** - shadcn/ui components
- **API Client** - Axios with interceptors

### 🟡 Partially Complete
- **Products** - Backend 60% (handlers incomplete, routes not registered, no frontend)
- **File Upload** - Azure Blob Storage configured but not integrated

### ❌ Missing Critical Features
- Authentication & Authorization
- Shopping Cart & Checkout
- Payment Processing
- Customer-facing Store
- User Management
- Email/Notifications
- And many more...

---

## Development Roadmap

---

## 🎯 **PHASE 1: Complete Core Admin Features** (Week 1-2)
**Goal:** Finish admin panel with full product management

### 1.1 Complete Products Backend
**Priority:** CRITICAL | **Estimated Time:** 2-3 days

- [ ] Register products routes in `server/src/index.ts`
- [ ] Complete products.routes.ts (currently empty)
- [ ] Implement missing handlers:
  - [ ] `productsHandlers.update`
  - [ ] `productsHandlers.delete`
- [ ] Test all CRUD operations via API
- [ ] Add product search functionality
- [ ] Add filter by category
- [ ] Add filter by active status
- [ ] Add pagination support

**Files to modify:**
- `server/src/index.ts`
- `server/src/features/products/products.routes.ts`
- `server/src/features/products/products.handlers.ts`

---

### 1.2 Build Products Frontend
**Priority:** CRITICAL | **Estimated Time:** 3-4 days

- [ ] Create `src/services/products.service.ts`
- [ ] Create `src/hooks/useProducts.ts` with TanStack Query hooks:
  - [ ] `useProducts(filters?)`
  - [ ] `useProduct(id)`
  - [ ] `useCreateProduct()`
  - [ ] `useUpdateProduct()`
  - [ ] `useDeleteProduct()`
- [ ] Create `src/components/products/ProductDialog.tsx`
- [ ] Create `src/components/products/ProductsDataTable.tsx`
- [ ] Create `src/routes/products.tsx` with:
  - [ ] Data table with sorting/filtering
  - [ ] Search by name/SKU
  - [ ] Filter by category dropdown
  - [ ] Filter by active status
  - [ ] Edit/Delete actions
  - [ ] Pagination
- [ ] Enable "Products" in sidebar navigation
- [ ] Add product form fields:
  - [ ] Category selection (dropdown)
  - [ ] Name, SKU, Description
  - [ ] Price, Stock
  - [ ] Image URL (temporary, until upload works)
  - [ ] Active toggle

**Key Features:**
- Use DashboardLayout
- Follow same patterns as categories
- Validation feedback
- Loading states

---

### 1.3 Image Upload Integration
**Priority:** HIGH | **Estimated Time:** 2-3 days

- [ ] Set up Azure Blob Storage account
- [ ] Add missing env variables:
  - [ ] `AZURE_STORAGE_CONNECTION_STRING`
  - [ ] `AZURE_STORAGE_CONTAINER_NAME`
- [ ] Install `@azure/storage-blob` if not present
- [ ] Create image upload endpoint: `POST /api/upload/image`
- [ ] Integrate upload in ProductDialog:
  - [ ] File input component
  - [ ] Image preview
  - [ ] Upload progress indicator
  - [ ] Handle upload errors
- [ ] Add image optimization:
  - [ ] Resize images server-side
  - [ ] Generate thumbnails
  - [ ] WebP conversion
- [ ] Update product form to use file upload instead of URL input

**Alternative (if Azure is blocked):**
- [ ] Use local file storage initially
- [ ] Store in `server/uploads/` directory
- [ ] Serve via static route `/uploads/:filename`

---

### 1.4 Enhanced Admin Features
**Priority:** MEDIUM | **Estimated Time:** 2 days

- [ ] Add bulk actions:
  - [ ] Bulk delete products
  - [ ] Bulk activate/deactivate
  - [ ] Bulk category assignment
- [ ] Add export functionality:
  - [ ] Export categories to CSV
  - [ ] Export products to CSV
- [ ] Add basic analytics dashboard (`/dashboard`):
  - [ ] Total categories count
  - [ ] Total products count
  - [ ] Low stock alerts
  - [ ] Recently added products
- [ ] Add product inventory management:
  - [ ] Stock level warnings
  - [ ] Out of stock badge
  - [ ] Quick stock adjustment

---

## 🔐 **PHASE 2: Authentication & User Management** (Week 3)
**Goal:** Secure admin panel and prepare for customer accounts

### 2.1 Database Schema
**Priority:** CRITICAL | **Estimated Time:** 1 day

- [ ] Create `users` table:
  ```sql
  - id (uuid, primary key)
  - email (unique, not null)
  - password_hash (not null)
  - full_name
  - role (enum: 'admin', 'customer')
  - is_active (boolean, default true)
  - created_at, updated_at
  ```
- [ ] Create `sessions` table (or use JWT)
- [ ] Create `password_resets` table
- [ ] Add migrations

---

### 2.2 Auth Backend
**Priority:** CRITICAL | **Estimated Time:** 3-4 days

- [ ] Install dependencies:
  - [ ] `bcrypt` or `@node-rs/bcrypt`
  - [ ] `jsonwebtoken` or `jose`
- [ ] Create auth feature structure:
  - [ ] `server/src/features/auth/auth.routes.ts`
  - [ ] `server/src/features/auth/auth.handlers.ts`
  - [ ] `server/src/features/auth/auth.queries.ts`
  - [ ] `server/src/features/auth/auth.schemas.ts`
- [ ] Implement endpoints:
  - [ ] `POST /api/auth/register` - Create customer account
  - [ ] `POST /api/auth/login` - Login with email/password
  - [ ] `POST /api/auth/logout` - Invalidate session/token
  - [ ] `GET /api/auth/me` - Get current user
  - [ ] `POST /api/auth/refresh` - Refresh access token
  - [ ] `POST /api/auth/forgot-password` - Request password reset
  - [ ] `POST /api/auth/reset-password` - Reset password with token
- [ ] Create auth middleware:
  - [ ] `requireAuth` - Verify JWT token
  - [ ] `requireAdmin` - Check admin role
- [ ] Protect admin routes:
  - [ ] Categories routes
  - [ ] Products routes
  - [ ] Future admin routes

---

### 2.3 Auth Frontend
**Priority:** CRITICAL | **Estimated Time:** 3 days

- [ ] Create auth context/provider
- [ ] Create `src/services/auth.service.ts`
- [ ] Create `src/hooks/useAuth.ts`:
  - [ ] `useLogin()`
  - [ ] `useRegister()`
  - [ ] `useLogout()`
  - [ ] `useCurrentUser()`
- [ ] Create auth pages:
  - [ ] `src/routes/login.tsx`
  - [ ] `src/routes/register.tsx`
  - [ ] `src/routes/forgot-password.tsx`
  - [ ] `src/routes/reset-password.tsx`
- [ ] Update API client to include auth token
- [ ] Add route protection:
  - [ ] Create `ProtectedRoute` component
  - [ ] Wrap admin routes
  - [ ] Redirect to login if unauthorized
- [ ] Add user menu to dashboard:
  - [ ] Display user name/email
  - [ ] Logout button
  - [ ] Profile link (future)

---

### 2.4 User Management (Admin)
**Priority:** MEDIUM | **Estimated Time:** 2 days

- [ ] Create users management page (`/users`)
- [ ] List all users with data table
- [ ] Filter by role (admin/customer)
- [ ] Search by email/name
- [ ] Actions:
  - [ ] View user details
  - [ ] Activate/deactivate user
  - [ ] Change user role (admin only)
  - [ ] Delete user
- [ ] Add to sidebar navigation

---

## 🛍️ **PHASE 3: Customer-Facing Store** (Week 4-5)
**Goal:** Build the shopping experience for customers

### 3.1 Store Layout & Navigation
**Priority:** CRITICAL | **Estimated Time:** 2 days

- [ ] Create `src/components/layout/StoreLayout.tsx`:
  - [ ] Header with logo
  - [ ] Main navigation
  - [ ] Search bar
  - [ ] Cart icon with badge
  - [ ] Login/Account menu
  - [ ] Footer
- [ ] Create separate route tree for store:
  - [ ] `/` - Store homepage
  - [ ] `/shop` - Product listing
  - [ ] `/shop/:slug` - Product detail
  - [ ] `/cart` - Shopping cart
  - [ ] `/checkout` - Checkout flow
- [ ] Update root route to detect admin vs store routes

---

### 3.2 Product Listing Page
**Priority:** CRITICAL | **Estimated Time:** 3 days

- [ ] Create `src/routes/shop.tsx`:
  - [ ] Grid layout for products
  - [ ] Product cards with:
    - [ ] Image
    - [ ] Name, price
    - [ ] Category badge
    - [ ] "Add to Cart" button
    - [ ] "Out of Stock" indicator
  - [ ] Sidebar filters:
    - [ ] Filter by category
    - [ ] Price range slider
    - [ ] In stock only toggle
  - [ ] Sorting options:
    - [ ] Price: Low to High
    - [ ] Price: High to Low
    - [ ] Newest First
    - [ ] Name: A-Z
  - [ ] Pagination or infinite scroll
  - [ ] Loading skeletons
  - [ ] Empty state
- [ ] Update products API to support customer view:
  - [ ] Only return active products
  - [ ] Apply filters and sorting
  - [ ] Pagination

---

### 3.3 Product Detail Page
**Priority:** CRITICAL | **Estimated Time:** 2 days

- [ ] Create `src/routes/shop/$slug.tsx`:
  - [ ] Product image gallery (if multiple images added later)
  - [ ] Product name and price
  - [ ] Category link
  - [ ] Description
  - [ ] Stock availability
  - [ ] Quantity selector
  - [ ] "Add to Cart" button
  - [ ] Related products section (same category)
  - [ ] Breadcrumb navigation
- [ ] Backend support:
  - [ ] Get product by slug
  - [ ] Get related products

---

### 3.4 Homepage
**Priority:** MEDIUM | **Estimated Time:** 2 days

- [ ] Create `src/routes/index.tsx` (store version):
  - [ ] Hero section with featured products
  - [ ] Category showcase
  - [ ] New arrivals section
  - [ ] Featured products
  - [ ] Call-to-action sections
- [ ] Backend support:
  - [ ] Get featured products
  - [ ] Get new arrivals (recent products)

---

## 🛒 **PHASE 4: Shopping Cart & Checkout** (Week 6)
**Goal:** Enable customers to purchase products

### 4.1 Shopping Cart Backend
**Priority:** CRITICAL | **Estimated Time:** 2 days

- [ ] Create database tables:
  ```sql
  carts:
    - id (uuid)
    - user_id (nullable for guest carts)
    - session_id (for guest users)
    - created_at, updated_at

  cart_items:
    - id (uuid)
    - cart_id (foreign key)
    - product_id (foreign key)
    - quantity (integer, min 1)
    - price_at_add (decimal - snapshot price)
    - created_at, updated_at
  ```
- [ ] Create cart feature:
  - [ ] `POST /api/cart/items` - Add item to cart
  - [ ] `GET /api/cart` - Get current cart
  - [ ] `PUT /api/cart/items/:id` - Update quantity
  - [ ] `DELETE /api/cart/items/:id` - Remove item
  - [ ] `DELETE /api/cart` - Clear cart
- [ ] Cart business logic:
  - [ ] Validate product exists and is active
  - [ ] Check stock availability
  - [ ] Calculate cart totals
  - [ ] Merge guest cart on login

---

### 4.2 Shopping Cart Frontend
**Priority:** CRITICAL | **Estimated Time:** 2 days

- [ ] Create cart context/state management
- [ ] Create `src/hooks/useCart.ts`:
  - [ ] `useCart()`
  - [ ] `useAddToCart()`
  - [ ] `useUpdateCartItem()`
  - [ ] `useRemoveFromCart()`
  - [ ] `useClearCart()`
- [ ] Create `src/routes/cart.tsx`:
  - [ ] Cart items table
  - [ ] Quantity adjusters
  - [ ] Remove item button
  - [ ] Subtotal, tax, total
  - [ ] "Continue Shopping" button
  - [ ] "Proceed to Checkout" button
  - [ ] Empty cart state
- [ ] Add cart badge to header:
  - [ ] Show item count
  - [ ] Update in real-time
- [ ] Create mini cart dropdown (optional):
  - [ ] Quick view from header
  - [ ] Show recent items
  - [ ] Quick access to cart page

---

### 4.3 Orders & Checkout Backend
**Priority:** CRITICAL | **Estimated Time:** 3 days

- [ ] Create database tables:
  ```sql
  orders:
    - id (uuid)
    - user_id (foreign key)
    - order_number (unique, auto-generated)
    - status (enum: pending, paid, processing, shipped, delivered, cancelled)
    - subtotal, tax, shipping, total (decimals)
    - shipping_address_id (foreign key)
    - billing_address_id (foreign key)
    - payment_method
    - payment_status
    - notes
    - created_at, updated_at

  order_items:
    - id (uuid)
    - order_id (foreign key)
    - product_id (foreign key)
    - product_name (snapshot)
    - product_sku (snapshot)
    - quantity
    - price (snapshot)
    - subtotal

  addresses:
    - id (uuid)
    - user_id (foreign key)
    - full_name
    - address_line1
    - address_line2
    - city
    - state/province
    - postal_code
    - country
    - phone
    - is_default_shipping
    - is_default_billing
  ```
- [ ] Create order endpoints:
  - [ ] `POST /api/orders` - Create order from cart
  - [ ] `GET /api/orders` - List user's orders
  - [ ] `GET /api/orders/:id` - Get order details
  - [ ] `PUT /api/orders/:id/cancel` - Cancel order
- [ ] Create admin order endpoints:
  - [ ] `GET /api/admin/orders` - List all orders
  - [ ] `PUT /api/admin/orders/:id/status` - Update order status
- [ ] Order business logic:
  - [ ] Generate unique order number
  - [ ] Snapshot product prices
  - [ ] Calculate totals
  - [ ] Validate stock availability
  - [ ] Reserve stock on order creation
  - [ ] Reduce stock on payment confirmation

---

### 4.4 Checkout Flow Frontend
**Priority:** CRITICAL | **Estimated Time:** 3 days

- [ ] Create multi-step checkout:
  - [ ] Step 1: Shipping Address
    - [ ] Address form
    - [ ] Saved addresses selection
    - [ ] "Add new address" option
  - [ ] Step 2: Payment Method
    - [ ] Payment options (prepare for integration)
    - [ ] Billing address (same as shipping checkbox)
  - [ ] Step 3: Review Order
    - [ ] Order summary
    - [ ] Items review
    - [ ] Totals
    - [ ] "Place Order" button
  - [ ] Step 4: Order Confirmation
    - [ ] Success message
    - [ ] Order number
    - [ ] Order details
    - [ ] "Continue Shopping" button
- [ ] Create `src/routes/checkout.tsx`
- [ ] Add checkout validation:
  - [ ] Require login or guest checkout
  - [ ] Validate cart not empty
  - [ ] Validate address fields
- [ ] Create order confirmation page (`/orders/:id`)

---

### 4.5 Order Management (Customer)
**Priority:** HIGH | **Estimated Time:** 2 days

- [ ] Create `src/routes/account/orders.tsx`:
  - [ ] List all user orders
  - [ ] Filter by status
  - [ ] Search by order number
  - [ ] Click to view details
- [ ] Create `src/routes/account/orders/$id.tsx`:
  - [ ] Order details
  - [ ] Order status timeline
  - [ ] Items purchased
  - [ ] Shipping address
  - [ ] Payment info
  - [ ] Cancel button (if applicable)
  - [ ] Print invoice

---

## 💳 **PHASE 5: Payment Integration** (Week 7)
**Goal:** Accept real payments

### 5.1 Payment Provider Setup
**Priority:** CRITICAL | **Estimated Time:** 1 day

**Choose payment provider:**
- [ ] Stripe (recommended)
- [ ] PayPal
- [ ] Square
- [ ] Or multiple

- [ ] Create provider account
- [ ] Get API keys (test & production)
- [ ] Add env variables:
  - [ ] `STRIPE_SECRET_KEY`
  - [ ] `STRIPE_PUBLISHABLE_KEY`
  - [ ] `STRIPE_WEBHOOK_SECRET`

---

### 5.2 Payment Backend Integration
**Priority:** CRITICAL | **Estimated Time:** 3-4 days

**Stripe Integration (Example):**
- [ ] Install `stripe` package
- [ ] Create payment intent endpoint:
  - [ ] `POST /api/payments/create-intent`
  - [ ] Calculate order total
  - [ ] Create Stripe Payment Intent
  - [ ] Return client secret
- [ ] Create webhook endpoint:
  - [ ] `POST /api/webhooks/stripe`
  - [ ] Verify webhook signature
  - [ ] Handle events:
    - [ ] `payment_intent.succeeded` - Mark order as paid
    - [ ] `payment_intent.failed` - Mark order as failed
    - [ ] `charge.refunded` - Handle refunds
- [ ] Update order on successful payment:
  - [ ] Set payment_status to 'paid'
  - [ ] Set order status to 'processing'
  - [ ] Reduce product stock
  - [ ] Clear user's cart
  - [ ] Send order confirmation email

---

### 5.3 Payment Frontend Integration
**Priority:** CRITICAL | **Estimated Time:** 2 days

**Stripe Integration:**
- [ ] Install `@stripe/stripe-js` and `@stripe/react-stripe-js`
- [ ] Create `src/components/checkout/PaymentForm.tsx`:
  - [ ] Stripe Elements provider
  - [ ] Card element
  - [ ] Payment processing
  - [ ] Error handling
  - [ ] Loading states
- [ ] Integrate into checkout flow:
  - [ ] Create payment intent on checkout start
  - [ ] Collect payment method
  - [ ] Confirm payment
  - [ ] Handle 3D Secure
  - [ ] Show success/error messages
  - [ ] Redirect to confirmation page

---

### 5.4 Admin Payment Management
**Priority:** MEDIUM | **Estimated Time:** 1 day

- [ ] Add payment info to order details:
  - [ ] Payment method
  - [ ] Payment status
  - [ ] Transaction ID
  - [ ] Payment date
- [ ] Add refund capability:
  - [ ] Refund button in order details
  - [ ] Partial/full refund options
  - [ ] Call payment provider API
  - [ ] Update order status

---

## 📧 **PHASE 6: Email & Notifications** (Week 8)
**Goal:** Communicate with customers

### 6.1 Email Service Setup
**Priority:** HIGH | **Estimated Time:** 1 day

**Choose email provider:**
- [ ] SendGrid
- [ ] Mailgun
- [ ] AWS SES
- [ ] Resend

- [ ] Create account and get API key
- [ ] Add env variables:
  - [ ] `EMAIL_API_KEY`
  - [ ] `EMAIL_FROM_ADDRESS`
  - [ ] `EMAIL_FROM_NAME`
- [ ] Install email provider SDK

---

### 6.2 Email Templates
**Priority:** HIGH | **Estimated Time:** 2 days

- [ ] Create email template engine (React Email or MJML)
- [ ] Create templates:
  - [ ] Welcome email (registration)
  - [ ] Order confirmation
  - [ ] Order shipped
  - [ ] Order delivered
  - [ ] Password reset
  - [ ] Low stock alert (admin)
- [ ] Style templates to match brand
- [ ] Test email rendering

---

### 6.3 Email Integration
**Priority:** HIGH | **Estimated Time:** 2 days

- [ ] Create email service:
  - [ ] `server/src/services/emailService.ts`
  - [ ] `sendWelcomeEmail(user)`
  - [ ] `sendOrderConfirmation(order)`
  - [ ] `sendOrderShipped(order, trackingNumber)`
  - [ ] `sendPasswordReset(user, resetToken)`
- [ ] Integrate email sending:
  - [ ] After user registration
  - [ ] After order creation
  - [ ] After order status change
  - [ ] On password reset request
- [ ] Add email queue (optional but recommended):
  - [ ] Use BullMQ or similar
  - [ ] Prevent blocking API requests
  - [ ] Retry failed sends

---

### 6.4 In-App Notifications (Optional)
**Priority:** LOW | **Estimated Time:** 2 days

- [ ] Create notifications table
- [ ] Create notification endpoints:
  - [ ] `GET /api/notifications` - Get user notifications
  - [ ] `PUT /api/notifications/:id/read` - Mark as read
  - [ ] `DELETE /api/notifications/:id` - Delete
- [ ] Create notification component:
  - [ ] Bell icon with badge
  - [ ] Dropdown with recent notifications
  - [ ] Mark all as read
- [ ] Send notifications for:
  - [ ] Order status changes
  - [ ] Low stock (admin)
  - [ ] New orders (admin)

---

## 🚀 **PHASE 7: Advanced Features** (Week 9-10)
**Goal:** Enhance user experience

### 7.1 Search & Filtering
**Priority:** HIGH | **Estimated Time:** 3 days

- [ ] Implement full-text search:
  - [ ] PostgreSQL full-text search OR
  - [ ] Integrate Algolia/Elasticsearch
- [ ] Create search endpoint:
  - [ ] `GET /api/search?q=query&category=&priceMin=&priceMax=`
  - [ ] Search across product name, description, SKU
  - [ ] Filter by category, price range, availability
  - [ ] Sort options
- [ ] Create search results page:
  - [ ] `src/routes/search.tsx`
  - [ ] Display results grid
  - [ ] Show filters sidebar
  - [ ] Highlight search terms
  - [ ] "Did you mean" suggestions
- [ ] Add autocomplete to search bar:
  - [ ] As-you-type suggestions
  - [ ] Recent searches
  - [ ] Popular searches

---

### 7.2 Product Reviews & Ratings
**Priority:** MEDIUM | **Estimated Time:** 3 days

- [ ] Create reviews table:
  ```sql
  product_reviews:
    - id (uuid)
    - product_id (foreign key)
    - user_id (foreign key)
    - order_id (foreign key, ensure purchase)
    - rating (1-5)
    - title
    - comment
    - is_verified_purchase
    - helpful_count
    - created_at, updated_at
  ```
- [ ] Create review endpoints:
  - [ ] `GET /api/products/:id/reviews` - Get product reviews
  - [ ] `POST /api/products/:id/reviews` - Add review (requires purchase)
  - [ ] `PUT /api/reviews/:id` - Update own review
  - [ ] `DELETE /api/reviews/:id` - Delete own review
  - [ ] `POST /api/reviews/:id/helpful` - Mark helpful
- [ ] Add reviews to product detail page:
  - [ ] Display average rating
  - [ ] Rating distribution chart
  - [ ] Review list with pagination
  - [ ] Sort by: Most Recent, Highest Rated, Most Helpful
  - [ ] "Write a Review" button (if purchased)
- [ ] Admin moderation:
  - [ ] Approve/reject reviews
  - [ ] Delete inappropriate reviews
  - [ ] Respond to reviews

---

### 7.3 Wishlist
**Priority:** MEDIUM | **Estimated Time:** 2 days

- [ ] Create wishlist table:
  ```sql
  wishlist_items:
    - id (uuid)
    - user_id (foreign key)
    - product_id (foreign key)
    - created_at
  ```
- [ ] Create wishlist endpoints:
  - [ ] `GET /api/wishlist` - Get user's wishlist
  - [ ] `POST /api/wishlist` - Add to wishlist
  - [ ] `DELETE /api/wishlist/:productId` - Remove from wishlist
- [ ] Add wishlist UI:
  - [ ] Heart icon on product cards
  - [ ] Wishlist page (`/account/wishlist`)
  - [ ] Move to cart button
  - [ ] Share wishlist (optional)

---

### 7.4 Discount Codes & Promotions
**Priority:** MEDIUM | **Estimated Time:** 3 days

- [ ] Create coupons table:
  ```sql
  coupons:
    - id (uuid)
    - code (unique)
    - discount_type (percentage, fixed_amount, free_shipping)
    - discount_value
    - min_purchase_amount
    - max_discount_amount
    - usage_limit
    - used_count
    - valid_from
    - valid_until
    - is_active
  ```
- [ ] Create coupon endpoints:
  - [ ] `POST /api/admin/coupons` - Create coupon
  - [ ] `GET /api/admin/coupons` - List coupons
  - [ ] `POST /api/cart/apply-coupon` - Apply to cart
  - [ ] `DELETE /api/cart/remove-coupon` - Remove from cart
- [ ] Create coupon UI (Admin):
  - [ ] Create/edit coupon form
  - [ ] List coupons with usage stats
  - [ ] Activate/deactivate
- [ ] Add coupon to checkout:
  - [ ] Coupon code input
  - [ ] Validate and apply
  - [ ] Show discount in cart totals
  - [ ] Apply to order

---

### 7.5 Inventory & Stock Management
**Priority:** HIGH | **Estimated Time:** 2 days

- [ ] Add low stock alerts:
  - [ ] Configurable threshold per product
  - [ ] Email notification to admin
  - [ ] Dashboard widget showing low stock items
- [ ] Stock adjustment logging:
  - [ ] Create stock_movements table
  - [ ] Log all stock changes (orders, manual adjustments, returns)
  - [ ] Audit trail
- [ ] Manual stock adjustment:
  - [ ] Quick adjust in products table
  - [ ] Bulk stock import via CSV
  - [ ] Reason field for adjustments

---

### 7.6 Related Products & Recommendations
**Priority:** LOW | **Estimated Time:** 2 days

- [ ] Simple recommendations:
  - [ ] Same category products
  - [ ] Recently viewed
  - [ ] Frequently bought together (based on orders)
- [ ] Add to product detail page:
  - [ ] "You may also like" section
  - [ ] "Customers also bought" section
- [ ] Add to cart page:
  - [ ] "Complete your order" suggestions

---

## 📊 **PHASE 8: Analytics & Reporting** (Week 11)
**Goal:** Track business metrics

### 8.1 Admin Analytics Dashboard
**Priority:** MEDIUM | **Estimated Time:** 3 days

- [ ] Create dashboard page (`/dashboard`):
  - [ ] Revenue metrics:
    - [ ] Total revenue (today, week, month, year)
    - [ ] Revenue chart (line graph)
    - [ ] Average order value
  - [ ] Order metrics:
    - [ ] Total orders
    - [ ] Order status breakdown (pie chart)
    - [ ] Recent orders list
  - [ ] Product metrics:
    - [ ] Top selling products
    - [ ] Low stock alerts
    - [ ] Total products
  - [ ] Customer metrics:
    - [ ] Total customers
    - [ ] New customers (period)
- [ ] Create analytics queries:
  - [ ] Aggregate revenue by period
  - [ ] Count orders by status
  - [ ] Top products by sales
  - [ ] Customer growth

---

### 8.2 Sales Reports
**Priority:** MEDIUM | **Estimated Time:** 2 days

- [ ] Create reports page (`/reports`):
  - [ ] Sales report:
    - [ ] Filter by date range
    - [ ] Group by day/week/month
    - [ ] Export to CSV
  - [ ] Product performance report:
    - [ ] Units sold
    - [ ] Revenue per product
    - [ ] Profit margins (if cost added)
  - [ ] Customer report:
    - [ ] Top customers by spend
    - [ ] Customer lifetime value
- [ ] Add export functionality

---

### 8.3 Audit Logs
**Priority:** LOW | **Estimated Time:** 2 days

- [ ] Create audit_logs table:
  ```sql
  - id (uuid)
  - user_id (who)
  - action (what)
  - resource_type (products, orders, etc.)
  - resource_id
  - old_value (JSON)
  - new_value (JSON)
  - ip_address
  - created_at
  ```
- [ ] Log important actions:
  - [ ] Product changes
  - [ ] Order updates
  - [ ] User changes
  - [ ] Price changes
- [ ] Create audit log viewer (admin only)

---

## 🎨 **PHASE 9: Polish & Optimization** (Week 12)
**Goal:** Production-ready quality

### 9.1 Performance Optimization
**Priority:** HIGH | **Estimated Time:** 3 days

- [ ] Backend:
  - [ ] Add database indexes on frequently queried columns
  - [ ] Implement query result caching (Redis)
  - [ ] Add pagination to all list endpoints
  - [ ] Optimize N+1 queries
  - [ ] Add rate limiting to prevent abuse
  - [ ] Enable GZIP compression
- [ ] Frontend:
  - [ ] Code splitting by route
  - [ ] Lazy load images
  - [ ] Optimize bundle size
  - [ ] Add service worker for offline support
  - [ ] Implement virtual scrolling for long lists
  - [ ] Add skeleton loaders

---

### 9.2 Image Optimization
**Priority:** HIGH | **Estimated Time:** 2 days

- [ ] Set up image CDN (Cloudflare, Cloudinary, etc.)
- [ ] Generate multiple image sizes:
  - [ ] Thumbnail (100x100)
  - [ ] Small (300x300)
  - [ ] Medium (600x600)
  - [ ] Large (1200x1200)
- [ ] Implement responsive images:
  - [ ] Use `srcset` and `sizes`
  - [ ] WebP with JPEG fallback
  - [ ] Lazy loading
- [ ] Product image gallery:
  - [ ] Support multiple images per product
  - [ ] Zoom on hover
  - [ ] Lightbox for full view

---

### 9.3 SEO Optimization
**Priority:** HIGH | **Estimated Time:** 2 days

- [ ] Add meta tags:
  - [ ] Title, description for all pages
  - [ ] Open Graph tags for social sharing
  - [ ] Twitter card tags
- [ ] Generate sitemap.xml:
  - [ ] Include all products, categories
  - [ ] Update on content changes
- [ ] Add robots.txt
- [ ] Implement structured data (JSON-LD):
  - [ ] Product schema
  - [ ] BreadcrumbList schema
  - [ ] Organization schema
- [ ] Optimize URLs:
  - [ ] Use slugs instead of IDs
  - [ ] Canonical URLs
  - [ ] 301 redirects for changed URLs

---

### 9.4 Accessibility (a11y)
**Priority:** MEDIUM | **Estimated Time:** 2 days

- [ ] Run accessibility audit (axe, Lighthouse)
- [ ] Fix issues:
  - [ ] Proper heading hierarchy
  - [ ] Alt text for all images
  - [ ] ARIA labels where needed
  - [ ] Keyboard navigation
  - [ ] Focus indicators
  - [ ] Color contrast ratios
  - [ ] Screen reader testing
- [ ] Add skip links
- [ ] Form field labels

---

### 9.5 Mobile Responsiveness
**Priority:** HIGH | **Estimated Time:** 2 days

- [ ] Test all pages on mobile devices
- [ ] Fix responsive issues:
  - [ ] Navigation menu (hamburger)
  - [ ] Tables (horizontal scroll or cards)
  - [ ] Forms (full width, large touch targets)
  - [ ] Images (responsive sizing)
  - [ ] Checkout flow (mobile-friendly steps)
- [ ] Test on multiple screen sizes:
  - [ ] Mobile (320px, 375px, 414px)
  - [ ] Tablet (768px, 1024px)
  - [ ] Desktop (1280px, 1920px)

---

### 9.6 Error Handling & Validation
**Priority:** MEDIUM | **Estimated Time:** 2 days

- [ ] User-friendly error messages
- [ ] Form validation feedback:
  - [ ] Real-time validation
  - [ ] Clear error messages
  - [ ] Success feedback
- [ ] Global error boundary:
  - [ ] Catch React errors
  - [ ] Show friendly error page
  - [ ] Log to error tracking service
- [ ] 404 page
- [ ] 500 page
- [ ] Network error handling
- [ ] Offline detection

---

### 9.7 Testing
**Priority:** HIGH | **Estimated Time:** 3-5 days

- [ ] Backend tests:
  - [ ] Unit tests for business logic
  - [ ] Integration tests for API endpoints
  - [ ] Test database queries
  - [ ] Test auth middleware
- [ ] Frontend tests:
  - [ ] Component tests (Vitest + Testing Library)
  - [ ] Integration tests
  - [ ] E2E tests (Playwright or Cypress):
    - [ ] Complete purchase flow
    - [ ] User registration and login
    - [ ] Add to cart and checkout
    - [ ] Admin CRUD operations
- [ ] Set up CI/CD:
  - [ ] Run tests on every commit
  - [ ] Automated deployments

---

## 🚢 **PHASE 10: Deployment & Launch** (Week 13)
**Goal:** Go live!

### 10.1 Production Environment Setup
**Priority:** CRITICAL | **Estimated Time:** 2 days

- [ ] Choose hosting provider:
  - [ ] Backend: Railway, Render, Fly.io, AWS, etc.
  - [ ] Frontend: Vercel, Netlify, Cloudflare Pages
  - [ ] Database: Managed PostgreSQL (Supabase, Neon, AWS RDS)
- [ ] Set up production environment:
  - [ ] Create production database
  - [ ] Configure environment variables
  - [ ] Set up SSL certificates
  - [ ] Configure custom domain
  - [ ] Set up CDN for static assets

---

### 10.2 Production Configuration
**Priority:** CRITICAL | **Estimated Time:** 1 day

- [ ] Environment variables:
  - [ ] All API keys (production)
  - [ ] Database connection strings
  - [ ] Email service credentials
  - [ ] Payment gateway keys
  - [ ] Storage credentials
  - [ ] JWT secret (strong, random)
- [ ] Security hardening:
  - [ ] CORS configuration
  - [ ] Rate limiting
  - [ ] Helmet.js middleware
  - [ ] Content Security Policy
  - [ ] HTTPS only
  - [ ] Secure cookies

---

### 10.3 Database Migration
**Priority:** CRITICAL | **Estimated Time:** 1 day

- [ ] Export development data (if needed)
- [ ] Run migrations on production database
- [ ] Seed production data:
  - [ ] Initial admin user
  - [ ] Default categories
  - [ ] Sample products (optional)
- [ ] Backup strategy:
  - [ ] Automated daily backups
  - [ ] Backup retention policy
  - [ ] Test restore procedure

---

### 10.4 Monitoring & Logging
**Priority:** HIGH | **Estimated Time:** 2 days

- [ ] Set up error tracking:
  - [ ] Sentry or similar
  - [ ] Log frontend errors
  - [ ] Log backend errors
- [ ] Set up logging:
  - [ ] Structured logging
  - [ ] Log levels (info, warn, error)
  - [ ] Log aggregation (Logtail, Papertrail, etc.)
- [ ] Set up monitoring:
  - [ ] Uptime monitoring (UptimeRobot, Pingdom)
  - [ ] Performance monitoring (New Relic, DataDog)
  - [ ] Database monitoring
- [ ] Set up alerts:
  - [ ] Server down
  - [ ] High error rate
  - [ ] Slow queries
  - [ ] Low disk space

---

### 10.5 Launch Checklist
**Priority:** CRITICAL | **Estimated Time:** 1 day

- [ ] Pre-launch testing:
  - [ ] Test all critical flows on production
  - [ ] Test payment processing (use test mode first!)
  - [ ] Test email sending
  - [ ] Test user registration and login
  - [ ] Load testing
- [ ] Documentation:
  - [ ] User guide
  - [ ] Admin guide
  - [ ] API documentation (if public)
  - [ ] Deployment guide
- [ ] Legal:
  - [ ] Privacy policy
  - [ ] Terms of service
  - [ ] Return/refund policy
  - [ ] Shipping policy
  - [ ] Cookie consent banner (if EU)
- [ ] Marketing:
  - [ ] Social media accounts
  - [ ] Google Analytics/Plausible
  - [ ] Email marketing setup
- [ ] Launch:
  - [ ] Soft launch (limited users)
  - [ ] Monitor for issues
  - [ ] Fix critical bugs
  - [ ] Full public launch

---

## 🔮 **FUTURE ENHANCEMENTS** (Post-Launch)

### Customer Experience
- [ ] Guest checkout
- [ ] Social login (Google, Facebook)
- [ ] Multi-language support (i18n)
- [ ] Multi-currency support
- [ ] Product comparison
- [ ] Product bundles
- [ ] Gift cards
- [ ] Loyalty program
- [ ] Referral system
- [ ] Live chat support
- [ ] Product availability notifications

### Product Management
- [ ] Product variants (size, color, etc.)
- [ ] Product attributes (filterable)
- [ ] Bulk product import/export
- [ ] Product tags
- [ ] Product collections
- [ ] Product badges (new, sale, featured)
- [ ] Pre-orders
- [ ] Backorders
- [ ] Product availability calendar

### Order Management
- [ ] Order tracking
- [ ] Shipping integrations (UPS, FedEx, etc.)
- [ ] Print shipping labels
- [ ] Order notes
- [ ] Order editing (before fulfillment)
- [ ] Partial shipments
- [ ] Returns & exchanges
- [ ] Order insurance

### Marketing
- [ ] Email campaigns
- [ ] Abandoned cart recovery
- [ ] Product recommendations engine
- [ ] Cross-sell and upsell
- [ ] Flash sales
- [ ] Countdown timers
- [ ] Social media integration
- [ ] Affiliate program
- [ ] Blog/content marketing

### Analytics
- [ ] Customer cohort analysis
- [ ] Funnel analysis
- [ ] A/B testing
- [ ] Heatmaps
- [ ] Session recordings
- [ ] Conversion rate optimization

### Advanced Features
- [ ] Subscriptions/recurring orders
- [ ] Marketplace (multi-vendor)
- [ ] B2B pricing tiers
- [ ] Wholesale portal
- [ ] POS integration
- [ ] Mobile app (React Native)
- [ ] Progressive Web App
- [ ] Voice commerce (Alexa, Google)

---

## 📋 **PRIORITY MATRIX**

### Must-Have for MVP (Phases 1-6)
1. ✅ Complete Products (Phase 1)
2. ✅ Authentication (Phase 2)
3. ✅ Customer Store (Phase 3)
4. ✅ Cart & Checkout (Phase 4)
5. ✅ Payment Integration (Phase 5)
6. ✅ Email Notifications (Phase 6)

### Important (Phases 7-8)
- Search & Filtering
- Reviews & Ratings
- Basic Analytics

### Nice-to-Have (Phase 9)
- Performance optimization
- SEO
- Accessibility
- Advanced features

### Post-Launch
- All future enhancements

---

## 🎯 **ESTIMATED TIMELINE**

**Full MVP (Phases 1-6):** 7 weeks
**With Advanced Features (Phases 1-9):** 12 weeks
**Production Launch (Phases 1-10):** 13 weeks

**Note:** Timeline assumes:
- Full-time development
- Single developer
- No major blockers
- Some features may take longer based on complexity

---

## 💡 **DEVELOPMENT TIPS**

1. **Work in feature branches** - One feature per branch, merge to main when complete
2. **Test as you build** - Don't wait until the end
3. **Document as you go** - Future you will thank you
4. **Keep security in mind** - Sanitize inputs, validate everything
5. **Mobile-first design** - Easier to scale up than down
6. **Performance matters** - Optimize early, not later
7. **User feedback** - Launch early, iterate based on real usage
8. **Backup regularly** - Automate database backups
9. **Monitor from day one** - Set up logging and alerts early
10. **Stay focused** - Complete one phase before moving to next

---

## 📚 **RESOURCES**

### Documentation
- [Hono Docs](https://hono.dev/)
- [TanStack Query](https://tanstack.com/query/latest)
- [TanStack Router](https://tanstack.com/router/latest)
- [TanStack Table](https://tanstack.com/table/latest)
- [shadcn/ui](https://ui.shadcn.com/)

### Payment Providers
- [Stripe Docs](https://stripe.com/docs)
- [PayPal Developer](https://developer.paypal.com/)

### Email Services
- [Resend](https://resend.com/) (recommended for Next.js/Bun)
- [SendGrid](https://sendgrid.com/)

### Hosting
- [Railway](https://railway.app/) - Easy PostgreSQL + backend hosting
- [Vercel](https://vercel.com/) - Frontend hosting
- [Supabase](https://supabase.com/) - PostgreSQL database

---

## 🎉 **FINAL NOTES**

This roadmap is comprehensive but flexible. You can:
- **Adjust priorities** based on your specific needs
- **Skip features** that don't apply to your business
- **Add features** not covered here
- **Change the order** if certain features are more critical

The most important thing is to **ship early and iterate**. Get the MVP out, collect user feedback, and build based on real usage data.

Good luck with BagStreet! 🛍️

---

**Last Updated:** January 2026
**Current Status:** ~20% Complete (Categories ✅, Products 60%)
