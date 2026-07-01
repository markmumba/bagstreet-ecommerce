import type { sql } from '../../lib/db';

export type DatabaseExecutor = typeof sql;

export type Migration = {
    id: string;
    name: string;
    up: (db: DatabaseExecutor) => Promise<void>;
};
