import { sql } from '../../lib/db';

export interface DiscountCodeRow {
    id: number;
    code: string;
    value: string;
    min_order_amount: string;
    usage_limit: number | null;
    used_count: number;
    expires_at: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export const discountsQueries = {
    list: async (): Promise<DiscountCodeRow[]> => {
        return await sql<DiscountCodeRow[]>`
            SELECT * FROM discount_codes ORDER BY created_at DESC
        `;
    },

    findByCode: async (code: string): Promise<DiscountCodeRow | undefined> => {
        const [row] = await sql<DiscountCodeRow[]>`
            SELECT * FROM discount_codes WHERE UPPER(code) = ${code.toUpperCase()}
        `;
        return row;
    },

    findById: async (id: number): Promise<DiscountCodeRow | undefined> => {
        const [row] = await sql<DiscountCodeRow[]>`
            SELECT * FROM discount_codes WHERE id = ${id}
        `;
        return row;
    },

    create: async (data: {
        code: string;
        value: number;
        min_order_amount: number;
        usage_limit?: number | null;
        expires_at?: string | null;
        is_active?: boolean;
    }): Promise<DiscountCodeRow> => {
        const [row] = await sql<DiscountCodeRow[]>`
            INSERT INTO discount_codes (code, value, min_order_amount, usage_limit, expires_at, is_active)
            VALUES (
                ${data.code.toUpperCase()},
                ${data.value},
                ${data.min_order_amount},
                ${data.usage_limit ?? null},
                ${data.expires_at ?? null},
                ${data.is_active ?? true}
            )
            RETURNING *
        `;
        return row!;
    },

    update: async (
        id: number,
        data: Partial<{
            code: string;
            value: number;
            min_order_amount: number;
            usage_limit: number | null;
            expires_at: string | null;
            is_active: boolean;
        }>
    ): Promise<DiscountCodeRow | undefined> => {
        const fields: Record<string, unknown> = {};
        if (data.code !== undefined) fields.code = data.code.toUpperCase();
        if (data.value !== undefined) fields.value = data.value;
        if (data.min_order_amount !== undefined) fields.min_order_amount = data.min_order_amount;
        if ('usage_limit' in data) fields.usage_limit = data.usage_limit ?? null;
        if ('expires_at' in data) fields.expires_at = data.expires_at ?? null;
        if (data.is_active !== undefined) fields.is_active = data.is_active;

        const [row] = await sql<DiscountCodeRow[]>`
            UPDATE discount_codes SET ${sql(fields)}
            WHERE id = ${id}
            RETURNING *
        `;
        return row;
    },

    deactivate: async (id: number): Promise<DiscountCodeRow | undefined> => {
        const [row] = await sql<DiscountCodeRow[]>`
            UPDATE discount_codes SET is_active = false WHERE id = ${id} RETURNING *
        `;
        return row;
    },

    hasUsageForPhone: async (codeId: number, phone: string): Promise<boolean> => {
        const [row] = await sql<{ exists: boolean }[]>`
            SELECT EXISTS (
                SELECT 1 FROM discount_code_usages
                WHERE code_id = ${codeId} AND phone = ${phone}
            ) AS exists
        `;
        return row?.exists ?? false;
    },

    recordUsage: async (data: {
        code_id: number;
        order_id: number;
        phone: string;
        discount_amount: number;
    }): Promise<void> => {
        await sql.begin(async (tx: typeof sql) => {
            await tx`
                INSERT INTO discount_code_usages (code_id, order_id, phone, discount_amount)
                VALUES (${data.code_id}, ${data.order_id}, ${data.phone}, ${data.discount_amount})
            `;
            await tx`
                UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ${data.code_id}
            `;
        });
    },
};
