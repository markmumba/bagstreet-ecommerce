import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { categoriesRoutes } from './features/categories/categories.routes';
import { errorHandler } from './middleware/error-handler';
import { env } from './config/env';
import productsRoutes from './features/products/products.routes';
import userRoutes from './features/users/user.routes';
import authRoutes from './features/auth/auth.routes';
import ordersRoutes from './features/orders/orders.routes';
import notificationsRoutes from './features/notifications/notifications.routes';
import { requireAuth, requireRole } from './middleware/auth.middleware';
import { USER_ROLE } from 'shared/dist';
import { authRateLimit, generalRateLimit, orderPlacementRateLimit, orderRateLimit, paymentRateLimit, rateLimit } from './middleware/rate-limit.middleware';
import { startEmailOutboxWorker } from './services/email-outbox';
import { startUnpaidOrderExpiry } from './services/unpaid-order-expiry';
import { startReviewInvites } from './services/review-invites';
import shippingRoutes from './features/shipping/shipping.routes';
import paymentsRoutes from './features/payments/payments.routes';
import discountsRoutes from './features/discounts/discounts.routes';
import giftVouchersRoutes from './features/gift-vouchers/gift-vouchers.routes';
import reviewsRoutes from './features/reviews/reviews.routes';
import recommendationsRoutes from './features/recommendations/recommendations.routes';
import settingsRoutes from './features/settings/settings.routes';
import dashboardRoutes from './features/dashboard/dashboard.routes';
import { healthHandlers } from './features/health/health.handlers';
import { assertDatabaseMigrated, migrateDatabase } from './lib/migrations';
import type { AppEnv } from './lib/hono';
import auditRoutes from './features/audit/audit.routes';
import storefrontRoutes from './features/storefront/storefront.routes';
import recoveryRoutes from './features/cart-recovery/recovery.routes';
import { startCartRecovery } from './services/cart-recovery';
import complianceRoutes from './features/compliance/compliance.routes';


const app = new Hono<AppEnv>()

app.use('*', logger(message => console.log(message.replace(/([?&]token=)[^&\s]+/g, '$1[redacted]'))));
app.use('*', secureHeaders());
app.use('*', cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Bagstreet-App'],
    credentials: true,
}));
app.use('*', bodyLimit({ maxSize: 10 * 1024 * 1024 })); // 10 MB

app.get('/health', healthHandlers.live);
app.get('/health/live', healthHandlers.live);
app.get('/health/ready', healthHandlers.ready);


app.use('/api/auth/login', authRateLimit);
app.use('/api/auth/register', authRateLimit);
app.use('/api/orders', orderRateLimit);
app.on('POST', '/api/orders', orderPlacementRateLimit);
app.on('POST', '/api/gift-vouchers/purchase', orderPlacementRateLimit);
// Writing reviews: plenty for real customers, not for flooding the moderation queue.
app.on('PUT', '/api/reviews/order/*', rateLimit({ scope: 'reviews', limit: 20, windowMs: 60 * 60 * 1000, message: 'Too many reviews from this network. Please try again later.' }));
// Recommendation counts: a page sends a few per view; enough for browsing, not for inflating the numbers.
app.post('/api/recommendations/events', rateLimit({ scope: 'rec-events', limit: 600, windowMs: 60 * 60 * 1000, message: 'Too many requests. Please try again later.' }));
app.use('/api/payments/*', paymentRateLimit);
app.use('/api/*', generalRateLimit);

app.route('/api/auth', authRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/storefront', storefrontRoutes);
app.route('/api/cart-recovery', recoveryRoutes);
app.route('/api/categories', categoriesRoutes);
app.route('/api/products', productsRoutes);
app.use('/api/users/*', requireAuth, requireRole(USER_ROLE.ADMIN));
app.route('/api/users', userRoutes);
app.route('/api/orders', ordersRoutes);
app.route('/api/notifications', notificationsRoutes);
app.route('/api/shipping-locations', shippingRoutes);
app.route('/api/payments', paymentsRoutes);
app.route('/api/discounts', discountsRoutes);
app.route('/api/gift-vouchers', giftVouchersRoutes);
app.route('/api/reviews', reviewsRoutes);
app.route('/api/recommendations', recommendationsRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/audit-logs', auditRoutes);
app.route('/api/compliance', complianceRoutes);

app.onError(errorHandler);

app.notFound((c) => c.json({
  success: false,
  message: { message: 'Not Found', code: 'NOT_FOUND' },
}, 404));


const shouldRunMigrationsOnStartup = env.RUN_MIGRATIONS_ON_STARTUP ?? env.NODE_ENV !== 'production';

const prepareDatabase = shouldRunMigrationsOnStartup ? migrateDatabase : assertDatabaseMigrated;

prepareDatabase()
  .then(() => {
    console.log('Database ready');
    startUnpaidOrderExpiry();
        startEmailOutboxWorker();
        startCartRecovery();
        startReviewInvites();
  })
  .catch((error) => {
    console.error('Database preparation failed:', error);
    process.exit(1);
  });


export default {
  port: env.PORT,
  fetch: app.fetch,
}
