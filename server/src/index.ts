import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { categoriesRoutes } from './features/categories/categories.routes';
import { errorHandler } from './middleware/error-handler';
import { initDatabase } from './lib/db';
import { env } from './config/env';
import productsRoutes from './features/products/products.routes';
import userRoutes from './features/users/user.routes';
import authRoutes from './features/auth/auth.routes';
import ordersRoutes from './features/orders/orders.routes';
import cartRoutes from './features/cart/cart.routes';
import { requireAuth, requireRole } from './middleware/auth.middleware';
import { role } from 'shared/dist';
import { authRateLimit, generalRateLimit } from './middleware/rate-limit.middleware';


const app = new Hono()

app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));
app.use('*', bodyLimit({ maxSize: 10 * 1024 * 1024 })); // 10 MB

app.get('/health', (c) => c.json({
  status: 'OK',
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV || 'development',
  version: process.env.npm_package_version || '1.0.0',
}));


app.use('/api/auth/login', authRateLimit);
app.use('/api/auth/register', authRateLimit);
app.use('/api/*', generalRateLimit);

app.route('/api/auth', authRoutes);
app.route('/api/categories', categoriesRoutes);
app.route('/api/products', productsRoutes);
app.use('/api/users/*', requireAuth, requireRole(role.ADMIN));
app.route('/api/users', userRoutes);
app.route('/api/orders', ordersRoutes);
app.route('/api/cart', cartRoutes);

app.onError(errorHandler);

app.notFound((c) => c.json({
  success: false,
  message: { message: 'Not Found', code: 'NOT_FOUND' },
}, 404));


initDatabase()
  .then(() => {
    console.log('Database ready');
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });


export default {
  port: env.PORT,
  fetch: app.fetch,
}
