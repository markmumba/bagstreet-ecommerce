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
import cartRoutes from './features/cart/cart.routes';
import notificationsRoutes from './features/notifications/notifications.routes';
import { requireAuth, requireRole } from './middleware/auth.middleware';
import { USER_ROLE } from 'shared/dist';
import { authRateLimit, generalRateLimit, orderRateLimit, paymentRateLimit } from './middleware/rate-limit.middleware';
import { startEmailWorker } from './services/messagequeue';
import shippingRoutes from './features/shipping/shipping.routes';
import paymentsRoutes from './features/payments/payments.routes';
import discountsRoutes from './features/discounts/discounts.routes';
import settingsRoutes from './features/settings/settings.routes';
import dashboardRoutes from './features/dashboard/dashboard.routes';
import { healthHandlers } from './features/health/health.handlers';
import { assertDatabaseMigrated, migrateDatabase } from './lib/migrations';
import type { AppEnv } from './lib/hono';
import auditRoutes from './features/audit/audit.routes';
import storefrontRoutes from './features/storefront/storefront.routes';


const app = new Hono<AppEnv>()

app.use('*', logger());
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
app.use('/api/payments/*', paymentRateLimit);
app.use('/api/*', generalRateLimit);

app.route('/api/auth', authRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/storefront', storefrontRoutes);
app.route('/api/categories', categoriesRoutes);
app.route('/api/products', productsRoutes);
app.use('/api/users/*', requireAuth, requireRole(USER_ROLE.ADMIN));
app.route('/api/users', userRoutes);
app.route('/api/orders', ordersRoutes);
app.route('/api/cart', cartRoutes);
app.route('/api/notifications', notificationsRoutes);
app.route('/api/shipping-locations', shippingRoutes);
app.route('/api/payments', paymentsRoutes);
app.route('/api/discounts', discountsRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/audit-logs', auditRoutes);

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
    return startEmailWorker();
  })
  .catch((error) => {
    console.error('Database preparation failed:', error);
    process.exit(1);
  });


export default {
  port: env.PORT,
  fetch: app.fetch,
}
