

import {Database} from 'bun:sqlite';

export const db = new Database('bag_street',{create:true});

export function initDb() {
    db.run(`
        CREATE TABLE IF NOT EXISTS(
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) 
    `);

    db.run(`
        CREATE TRIGGER IF NOT EXISTS categories_updated_at
        AFTER UPDATE ON categories 
        FOR EACH ROW 
        BEGIN 
            UPDATE categories SET created_at = CURRENT_TIMESTAMP 
            WHERE id = OLD.id;
        END 
        
    `);

    console.log("Database initialized.");
}