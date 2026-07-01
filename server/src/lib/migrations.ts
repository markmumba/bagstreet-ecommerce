import { migrations } from '../db/migrations';
import { sql } from './db';

const MIGRATION_LOCK_KEY = 741_932_118;

type AppliedMigration = {
    id: string;
};

type MigrationLock = {
    acquired: boolean;
};

async function ensureMigrationsTable() {
    await sql`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id VARCHAR(32) PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            execution_ms INTEGER NOT NULL
        )
    `;
}

async function getAppliedMigrationIds() {
    const rows = await sql<AppliedMigration[]>`
        SELECT id FROM schema_migrations ORDER BY id ASC
    `;
    return new Set(rows.map((row) => row.id));
}

export async function migrateDatabase() {
    const [lock] = await sql<MigrationLock[]>`
        SELECT pg_try_advisory_lock(${MIGRATION_LOCK_KEY}) AS acquired
    `;

    if (!lock?.acquired) {
        throw new Error('Another database migration is already running.');
    }

    try {
        await ensureMigrationsTable();
        const appliedIds = await getAppliedMigrationIds();

        for (const migration of migrations) {
            if (appliedIds.has(migration.id)) continue;

            const startedAt = Date.now();
            await sql.begin(async (tx: typeof sql) => {
                await tx`SET LOCAL lock_timeout = '5s'`;
                await tx`SET LOCAL statement_timeout = '60s'`;
                await migration.up(tx);
                await tx`
                    INSERT INTO schema_migrations (id, name, execution_ms)
                    VALUES (${migration.id}, ${migration.name}, ${Date.now() - startedAt})
                `;
            });

            appliedIds.add(migration.id);
            console.log(`Applied migration ${migration.id}_${migration.name}`);
        }
    } finally {
        await sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
    }
}

export async function assertDatabaseMigrated() {
    let appliedIds: Set<string>;

    try {
        appliedIds = await getAppliedMigrationIds();
    } catch {
        throw new Error('Database migrations have not been initialized. Run `bun run db:migrate` before starting the server.');
    }

    const pending = migrations.filter((migration) => !appliedIds.has(migration.id));
    if (pending.length > 0) {
        const names = pending.map((migration) => `${migration.id}_${migration.name}`).join(', ');
        throw new Error(`Database has pending migrations: ${names}. Run \`bun run db:migrate\` before starting the server.`);
    }
}
