import { z } from 'zod';

/**
 * Object storage settings were once named MINIO_*. They're STORAGE_* now because production uses
 * DigitalOcean Spaces, not MinIO. Old names still work as a fallback so existing .env files keep running.
 */
const STORAGE_LEGACY_NAMES = ['ENDPOINT', 'PORT', 'USE_SSL', 'ACCESS_KEY', 'SECRET_KEY', 'BUCKET', 'PUBLIC_URL', 'REGION', 'OBJECT_ACL'] as const;
const storageFallbacks = Object.fromEntries(
    STORAGE_LEGACY_NAMES.map((name) => [`STORAGE_${name}`, process.env[`STORAGE_${name}`] ?? process.env[`MINIO_${name}`]]),
);
const legacyStorageNamesInUse = STORAGE_LEGACY_NAMES
    .filter((name) => process.env[`STORAGE_${name}`] === undefined && process.env[`MINIO_${name}`] !== undefined)
    .map((name) => `MINIO_${name}`);

const rawEnv = {
    ...process.env,
    SMTP_HOST: process.env.SMTP_HOST ?? process.env.MAIL_HOST,
    SMTP_PORT: process.env.SMTP_PORT ?? process.env.MAIL_PORT,
    SMTP_USER: process.env.SMTP_USER ?? process.env.MAIL_USERNAME,
    SMTP_PASS: process.env.SMTP_PASS ?? process.env.MAIL_PASSWORD,
    ...storageFallbacks,
};

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    SERVER_URL: z.string().min(1, 'SERVER_URL is required'),
    CORS_ORIGIN: z.string()
        .min(1, 'CORS_ORIGIN is required')
        .default('http://localhost:5173,http://localhost:5174,http://localhost:4173,http://localhost:4174')
        .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    /**
     * Object storage — any S3-compatible service: MinIO locally, DigitalOcean Spaces in production.
     * (Formerly MINIO_*; those names are still read as a fallback.)
     */
    STORAGE_ENDPOINT: z.string().default('localhost'),
    STORAGE_PORT: z.coerce.number().default(9000),
    STORAGE_USE_SSL: z.string().transform(v => v === 'true').default('false'),
    STORAGE_ACCESS_KEY: z.string().min(1, 'STORAGE_ACCESS_KEY is required'),
    STORAGE_SECRET_KEY: z.string().min(1, 'STORAGE_SECRET_KEY is required'),
    STORAGE_BUCKET: z.string().default('product-images'),
    /**
     * Base URL browsers load images from, objects directly under it, e.g.
     * https://bagstreet-media.fra1.cdn.digitaloceanspaces.com. Stored in image URLs, so it must be public.
     * Unset (local dev): http://STORAGE_ENDPOINT:STORAGE_PORT/STORAGE_BUCKET.
     */
    STORAGE_PUBLIC_URL: z.string().url().optional(),
    /** Signing region, e.g. us-east-1 for Spaces (see docs/deployment.md). Unset: client default. */
    STORAGE_REGION: z.string().optional(),
    /** Canned ACL for uploads. Spaces objects are private unless set to public-read. Unset for MinIO. */
    STORAGE_OBJECT_ACL: z.enum(['public-read']).optional(),
    SMTP_HOST: z.string().default('smtp.gmail.com'),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_SECURE: z.string().transform(v => v === 'true').default('false'),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_PROVIDER: z.enum(['smtp', 'resend']).default('smtp'),
    EMAIL_FROM: z.string().default('Bagstreet <no-reply@bagstreet.com>'),
    RESEND_API_KEY: z.string().optional(),
    RESEND_API_URL: z.string().url().default('https://api.resend.com/emails'),
    CLIENT_URL: z.string().default('http://localhost:5173'),
    STOREFRONT_URL: z.string().default('http://localhost:5174'),
    REDIS_REST_URL: z.string().url().optional(),
    REDIS_REST_TOKEN: z.string().optional(),
    RATE_LIMIT_STORE: z.enum(['memory', 'redis']).default('memory'),
    RUN_MIGRATIONS_ON_STARTUP: z.string().optional().transform((value) => value === undefined ? undefined : value === 'true'),
    PESAPAL_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
    PESAPAL_CONSUMER_KEY: z.string().optional(),
    PESAPAL_CONSUMER_SECRET: z.string().optional(),
    PESAPAL_IPN_ID: z.string().optional(),
    PESAPAL_CALLBACK_URL: z.string().url().optional(),
    PESAPAL_CANCELLATION_URL: z.string().url().optional(),
    PESAPAL_CURRENCY: z.string().default('KES'),
    PESAPAL_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    /** Unpaid online orders are cancelled (stock released) after this many minutes. 0 disables expiry. */
    UNPAID_ORDER_TTL_MINUTES: z.coerce.number().int().min(0).default(45),
    CART_RECOVERY_ENABLED: z.enum(['true', 'false']).default('true').transform(value => value === 'true'),
    CART_RECOVERY_FOLLOWUP_ENABLED: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
    /** Reverse proxies / load balancers in front of the server (see lib/client-ip.ts). 0 = none. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
});


export const env = envSchema.parse(rawEnv);

if (legacyStorageNamesInUse.length > 0) {
    console.warn(`[config] ${legacyStorageNamesInUse.join(', ')} are old names — rename to STORAGE_* (same values).`);
}

if (env.NODE_ENV === 'production') {
    const insecureDefaults = [
        'dev_jwt_secret_change_this_in_production_32chars',
        'dev_refresh_secret_change_this_in_production_32chars',
    ];
    if (insecureDefaults.includes(env.JWT_SECRET) || insecureDefaults.includes(env.JWT_REFRESH_SECRET)) {
        throw new Error('FATAL: Default JWT secrets must not be used in production');
    }
}
