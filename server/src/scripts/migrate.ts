import { closeDatabase } from '../lib/db';
import { migrateDatabase } from '../lib/migrations';

migrateDatabase()
    .then(() => {
        console.log('Database migrations complete.');
    })
    .catch((error) => {
        console.error('Database migration failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closeDatabase();
    });
