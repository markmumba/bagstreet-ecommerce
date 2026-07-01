import { SQL } from 'bun';
import { env } from '../config/env';

export const sql = new SQL(env.DATABASE_URL);

export async function closeDatabase() {
    await sql.end();
}

process.on('SIGINT', async () => {
    await closeDatabase();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await closeDatabase();
    process.exit(0);
});
