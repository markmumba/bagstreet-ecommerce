import { z } from 'zod';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    AZURE_STORAGE_CONNECTION_STRING: z.string().min(1, 'AZURE_STORAGE_CONNECTION_STRING is required'),
    AZURE_STORAGE_CONTAINER_NAME: z.string().min(1, 'AZURE_STORAGE_CONTAINER_NAME is required'),
});


export const env = envSchema.parse(process.env)