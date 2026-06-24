import { SQL } from 'bun';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('DATABASE_URL env var is required');
    process.exit(1);
}

const sql = new SQL(DATABASE_URL);

const EMAIL = 'admin@bagstreet.com';
const FULL_NAME = 'Bagstreet Admin';
const PASSWORD = 'Admin@1234';

async function seedAdmin() {
    const [existing] = await sql<{ id: number }[]>`SELECT id FROM users WHERE email = ${EMAIL}`;
    if (existing) {
        console.log(`Admin already exists (id=${existing.id}). Skipping.`);
        await sql.end();
        return;
    }

    const password_hash = await Bun.password.hash(PASSWORD);

    const [user] = await sql<{ id: number; email: string }[]>`
        INSERT INTO users (email, full_name, password_hash, role, is_active)
        VALUES (${EMAIL}, ${FULL_NAME}, ${password_hash}, 'ADMIN', true)
        RETURNING id, email
    `;

    console.log(`Admin created: id=${user!.id} email=${user!.email}`);
    console.log(`Password: ${PASSWORD}`);
    await sql.end();
}

seedAdmin().catch((err) => {
    console.error(err);
    process.exit(1);
});
