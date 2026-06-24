import { z } from 'zod';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    SERVER_URL: z.string().min(1, 'SERVER_URL is required'),
    CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required').default('http://localhost:5173').transform(v => v.split(',').map(s => s.trim())),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    MINIO_ENDPOINT: z.string().default('localhost'),
    MINIO_PORT: z.coerce.number().default(9000),
    MINIO_USE_SSL: z.string().transform(v => v === 'true').default('false'),
    MINIO_ACCESS_KEY: z.string().min(1, 'MINIO_ACCESS_KEY is required'),
    MINIO_SECRET_KEY: z.string().min(1, 'MINIO_SECRET_KEY is required'),
    MINIO_BUCKET: z.string().default('product-images'),
});


export const env = envSchema.parse(process.env);

if (env.NODE_ENV === 'production') {
    const insecureDefaults = [
        'dev_jwt_secret_change_this_in_production_32chars',
        'dev_refresh_secret_change_this_in_production_32chars',
    ];
    if (insecureDefaults.includes(env.JWT_SECRET) || insecureDefaults.includes(env.JWT_REFRESH_SECRET)) {
        throw new Error('FATAL: Default JWT secrets must not be used in production');
    }
}