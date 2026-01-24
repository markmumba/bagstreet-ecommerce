import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger';
import { categoriesRoutes } from './features/categories/categories.routes';
import { errorHandler } from './middleware/error-handler';
import { initDatabase } from './lib/db';
import { env } from './config/env';



const app = new Hono()

app.use('*',logger());
app.use('*',cors());

app.get('/health',(c) => c.json({
  status: 'OK',
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV || 'development',
  version: process.env.npm_package_version || '1.0.0',
}));


app.route('/api/categories',categoriesRoutes);

app.onError(errorHandler);

app.notFound((c) => c.json({
  success: false,
  message: {message: 'Not Found', code: 'NOT_FOUND'},
},404));


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