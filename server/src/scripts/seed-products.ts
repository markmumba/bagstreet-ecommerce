import 'dotenv/config';
import path from 'path';
import { sql } from '../lib/db';
import { migrateDatabase } from '../lib/migrations';
import { imageUploadService } from '../services/image-upload-service';
import { slugify } from '../lib/util';

type SeedVariant = {
    sku: string;
    size?: string | null;
    color?: string | null;
    stock: number;
    low_stock_threshold?: number;
    price_override?: number | null;
    is_active?: boolean;
};

type SeedProduct = {
    name: string;
    category: string;
    description: string;
    price: number;
    imageUrl?: string;
    imagePath?: string;
    is_featured?: boolean;
    sale_price?: number | null;
    sale_ends_at?: string | null;
    variants: SeedVariant[];
};

type SeedShippingLocation = {
    name: string;
    price: number;
    is_active?: boolean;
};

type SeedDiscountCode = {
    code: string;
    value: number;
    min_order_amount?: number;
    usage_limit?: number | null;
    used_count?: number;
    expires_at?: string | null;
    is_active?: boolean;
};

type SeedOrder = {
    ref: string;
    status: 'PENDING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
    payment_status: 'UNPAID' | 'PAID' | 'FAILED';
    customer_name: string;
    customer_phone: string;
    shipping_location: string;
    address_line1: string;
    city: string;
    state: string;
    notes?: string;
    discount_code?: string;
    discount_amount?: number;
    created_days_ago: number;
    items: { sku: string; quantity: number }[];
};

const categories = [
    { name: 'Handbags', description: 'Structured handbags, totes, shoulder bags, and evening pieces.' },
    { name: 'Shoes', description: 'Statement heels, flats, boots, and refined everyday shoes.' },
    { name: 'Scarves', description: 'Cashmere and silk scarves for polished finishing touches.' },
    { name: 'Accessories', description: 'Belts, wallets, cardholders, and small polished finishing pieces.' },
];

const products: SeedProduct[] = [
    {
        name: 'Coach Terri Shoulder Bag',
        category: 'Handbags',
        description: 'A compact shoulder bag with refined structure, soft polish, and day-to-night versatility.',
        price: 7000,
        imageUrl: 'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=1200&q=80',
        is_featured: true,
        variants: [
            { sku: 'BAG-COACH-TERRI-BLK', color: 'Black', stock: 8, low_stock_threshold: 3 },
            { sku: 'BAG-COACH-TERRI-PNK', color: 'Pink', stock: 3, low_stock_threshold: 3 },
        ],
    },
    {
        name: 'Milano Leather Tote',
        category: 'Handbags',
        description: 'A spacious leather tote designed for workdays, errands, and travel with a clean luxury profile.',
        price: 9200,
        imageUrl: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=80',
        is_featured: true,
        variants: [
            { sku: 'BAG-MILANO-TOTE-TAN', color: 'Tan', stock: 12, low_stock_threshold: 4 },
            { sku: 'BAG-MILANO-TOTE-ESP', color: 'Espresso', stock: 6, low_stock_threshold: 4 },
        ],
    },
    {
        name: 'Avery Mini Crossbody',
        category: 'Handbags',
        description: 'A small crossbody with a polished silhouette, ideal for evenings and light daily carry.',
        price: 5600,
        imageUrl: 'https://images.unsplash.com/photo-1605733160314-4fc7dac4bb16?auto=format&fit=crop&w=1200&q=80',
        sale_price: 4990,
        variants: [
            { sku: 'BAG-AVERY-MINI-CRM', color: 'Cream', stock: 5, low_stock_threshold: 2 },
            { sku: 'BAG-AVERY-MINI-BLK', color: 'Black', stock: 9, low_stock_threshold: 2 },
        ],
    },
    {
        name: 'Serena Block Heel',
        category: 'Shoes',
        description: 'Comfortable block heels with a sleek finish for dinners, events, and office styling.',
        price: 4800,
        imageUrl: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=1200&q=80',
        is_featured: true,
        variants: [
            { sku: 'SHO-SERENA-BLK-38', color: 'Black', size: '38', stock: 7, low_stock_threshold: 2 },
            { sku: 'SHO-SERENA-BLK-39', color: 'Black', size: '39', stock: 4, low_stock_threshold: 2 },
            { sku: 'SHO-SERENA-NUD-38', color: 'Nude', size: '38', stock: 2, low_stock_threshold: 2 },
        ],
    },
    {
        name: 'Noelle Satin Mule',
        category: 'Shoes',
        description: 'An elegant satin mule with a soft shine and easy slip-on styling.',
        price: 4300,
        imageUrl: 'https://images.unsplash.com/photo-1515347619252-60a4bf4fff4f?auto=format&fit=crop&w=1200&q=80',
        variants: [
            { sku: 'SHO-NOELLE-CHP-37', color: 'Champagne', size: '37', stock: 5, low_stock_threshold: 2 },
            { sku: 'SHO-NOELLE-CHP-38', color: 'Champagne', size: '38', stock: 6, low_stock_threshold: 2 },
            { sku: 'SHO-NOELLE-CHP-39', color: 'Champagne', size: '39', stock: 0, low_stock_threshold: 2 },
        ],
    },
    {
        name: 'Cashmere Wrap Scarf',
        category: 'Scarves',
        description: 'A soft cashmere wrap for layered warmth and understated elegance.',
        price: 3900,
        imageUrl: 'https://images.unsplash.com/photo-1601762603339-fd61e28b698a?auto=format&fit=crop&w=1200&q=80',
        variants: [
            { sku: 'SCF-CASH-WRAP-OAT', color: 'Oatmeal', stock: 10, low_stock_threshold: 3 },
            { sku: 'SCF-CASH-WRAP-GRY', color: 'Grey', stock: 4, low_stock_threshold: 3 },
        ],
    },
    {
        name: 'Luna Chain Shoulder Bag',
        category: 'Handbags',
        description: 'A polished chain-strap bag with a compact body and elevated evening finish.',
        price: 7800,
        imageUrl: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=1200&q=80',
        is_featured: true,
        variants: [
            { sku: 'BAG-LUNA-CHAIN-BLK', color: 'Black', stock: 11, low_stock_threshold: 3 },
            { sku: 'BAG-LUNA-CHAIN-BRG', color: 'Burgundy', stock: 4, low_stock_threshold: 3 },
        ],
    },
    {
        name: 'Florence Bucket Bag',
        category: 'Handbags',
        description: 'A soft bucket bag with easy capacity and a refined drawstring silhouette.',
        price: 8400,
        imageUrl: 'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?auto=format&fit=crop&w=1200&q=80',
        variants: [
            { sku: 'BAG-FLORENCE-BUCKET-CML', color: 'Camel', stock: 9, low_stock_threshold: 3 },
            { sku: 'BAG-FLORENCE-BUCKET-OLV', color: 'Olive', stock: 2, low_stock_threshold: 3 },
        ],
    },
    {
        name: 'Monroe Evening Clutch',
        category: 'Handbags',
        description: 'A slim evening clutch with a satin finish for dinners, weddings, and formal events.',
        price: 3600,
        imageUrl: 'https://images.unsplash.com/photo-1585488433867-6e40ff2b12c9?auto=format&fit=crop&w=1200&q=80',
        sale_price: 3190,
        variants: [
            { sku: 'BAG-MONROE-CLUTCH-BLK', color: 'Black', stock: 13, low_stock_threshold: 4 },
            { sku: 'BAG-MONROE-CLUTCH-GLD', color: 'Gold', stock: 5, low_stock_threshold: 4 },
        ],
    },
    {
        name: 'Valentina Leather Flat',
        category: 'Shoes',
        description: 'A clean leather flat built for everyday movement with an elegant pointed silhouette.',
        price: 3900,
        imageUrl: 'https://images.unsplash.com/photo-1562273138-f46be4ebdf33?auto=format&fit=crop&w=1200&q=80',
        variants: [
            { sku: 'SHO-VALENTINA-BLK-37', color: 'Black', size: '37', stock: 8, low_stock_threshold: 2 },
            { sku: 'SHO-VALENTINA-BLK-38', color: 'Black', size: '38', stock: 10, low_stock_threshold: 2 },
            { sku: 'SHO-VALENTINA-BLK-39', color: 'Black', size: '39', stock: 3, low_stock_threshold: 2 },
            { sku: 'SHO-VALENTINA-TAN-38', color: 'Tan', size: '38', stock: 6, low_stock_threshold: 2 },
        ],
    },
    {
        name: 'Bianca Ankle Boot',
        category: 'Shoes',
        description: 'A refined ankle boot with a stable heel and smooth upper for cooler days.',
        price: 6200,
        imageUrl: 'https://images.unsplash.com/photo-1605733160314-4fc7dac4bb16?auto=format&fit=crop&w=1200&q=80',
        is_featured: true,
        variants: [
            { sku: 'SHO-BIANCA-BLK-38', color: 'Black', size: '38', stock: 5, low_stock_threshold: 2 },
            { sku: 'SHO-BIANCA-BLK-39', color: 'Black', size: '39', stock: 3, low_stock_threshold: 2 },
            { sku: 'SHO-BIANCA-CHC-39', color: 'Chocolate', size: '39', stock: 2, low_stock_threshold: 2 },
        ],
    },
    {
        name: 'Silk Twill Scarf',
        category: 'Scarves',
        description: 'A lightweight silk twill scarf with a polished drape and subtle sheen.',
        price: 2900,
        imageUrl: 'https://images.unsplash.com/photo-1580477667995-2b94f01c9516?auto=format&fit=crop&w=1200&q=80',
        variants: [
            { sku: 'SCF-SILK-TWILL-NVY', color: 'Navy', stock: 7, low_stock_threshold: 3 },
            { sku: 'SCF-SILK-TWILL-RSE', color: 'Rose', stock: 4, low_stock_threshold: 3 },
        ],
    },
    {
        name: 'Ribbed Cashmere Beanie',
        category: 'Accessories',
        description: 'A soft ribbed beanie for refined warmth and relaxed weekend styling.',
        price: 2500,
        imageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80',
        variants: [
            { sku: 'ACC-CASH-BEANIE-CRM', color: 'Cream', stock: 9, low_stock_threshold: 3 },
            { sku: 'ACC-CASH-BEANIE-GRY', color: 'Grey', stock: 5, low_stock_threshold: 3 },
        ],
    },
    {
        name: 'Slim Leather Cardholder',
        category: 'Accessories',
        description: 'A slim leather cardholder with clean slots and a compact shape for small bags.',
        price: 1800,
        imageUrl: 'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=1200&q=80',
        sale_price: 1500,
        variants: [
            { sku: 'ACC-CARDHOLDER-BLK', color: 'Black', stock: 15, low_stock_threshold: 5 },
            { sku: 'ACC-CARDHOLDER-TAN', color: 'Tan', stock: 8, low_stock_threshold: 5 },
        ],
    },
];

const shippingLocations: SeedShippingLocation[] = [
    { name: 'Nairobi CBD', price: 250 },
    { name: 'Westlands', price: 350 },
    { name: 'Kilimani', price: 350 },
    { name: 'Karen', price: 550 },
    { name: 'Thika Road', price: 450 },
    { name: 'Mombasa Road', price: 500 },
];

const discountCodes: SeedDiscountCode[] = [
    { code: 'INSTA10', value: 10, min_order_amount: 3000, usage_limit: 100, used_count: 2 },
    { code: 'BAGSTREET15', value: 15, min_order_amount: 8000, usage_limit: 50, used_count: 1 },
    { code: 'WELCOME5', value: 5, min_order_amount: 0, usage_limit: 200, used_count: 0 },
    { code: 'VIP20', value: 20, min_order_amount: 12000, usage_limit: 20, used_count: 0 },
    { code: 'OLDSALE', value: 25, min_order_amount: 5000, usage_limit: 30, used_count: 6, expires_at: '2025-01-01T00:00:00.000Z', is_active: false },
];

const orders: SeedOrder[] = [
    {
        ref: 'demo-order-paid-1',
        status: 'DELIVERED',
        payment_status: 'PAID',
        customer_name: 'James Kiratu',
        customer_phone: '254798169252',
        shipping_location: 'Nairobi CBD',
        address_line1: 'Mama Ngina Street',
        city: 'Nairobi',
        state: 'Nairobi',
        discount_code: 'INSTA10',
        discount_amount: 700,
        created_days_ago: 9,
        items: [{ sku: 'BAG-COACH-TERRI-BLK', quantity: 1 }],
    },
    {
        ref: 'demo-order-processing-1',
        status: 'CONFIRMED',
        payment_status: 'PAID',
        customer_name: 'Amina Wanjiku',
        customer_phone: '254711222333',
        shipping_location: 'Westlands',
        address_line1: 'The Mall, Waiyaki Way',
        city: 'Nairobi',
        state: 'Nairobi',
        notes: 'Call before dispatch.',
        created_days_ago: 3,
        items: [
            { sku: 'BAG-MILANO-TOTE-TAN', quantity: 1 },
            { sku: 'ACC-CARDHOLDER-TAN', quantity: 1 },
        ],
    },
    {
        ref: 'demo-order-pending-1',
        status: 'PENDING',
        payment_status: 'UNPAID',
        customer_name: 'Grace Njeri',
        customer_phone: '254722444555',
        shipping_location: 'Kilimani',
        address_line1: 'Dennis Pritt Road',
        city: 'Nairobi',
        state: 'Nairobi',
        created_days_ago: 1,
        items: [{ sku: 'SHO-SERENA-NUD-38', quantity: 1 }],
    },
    {
        ref: 'demo-order-shipped-1',
        status: 'CONFIRMED',
        payment_status: 'PAID',
        customer_name: 'Linda Moraa',
        customer_phone: '254733555777',
        shipping_location: 'Karen',
        address_line1: 'Karen Plains Road',
        city: 'Nairobi',
        state: 'Nairobi',
        discount_code: 'BAGSTREET15',
        discount_amount: 1260,
        created_days_ago: 2,
        items: [{ sku: 'BAG-FLORENCE-BUCKET-CML', quantity: 1 }],
    },
    {
        ref: 'demo-order-cancelled-1',
        status: 'CANCELLED',
        payment_status: 'FAILED',
        customer_name: 'Peter Mwangi',
        customer_phone: '254700111222',
        shipping_location: 'Thika Road',
        address_line1: 'TRM Drive',
        city: 'Nairobi',
        state: 'Nairobi',
        notes: 'Customer cancelled after payment prompt failed.',
        created_days_ago: 5,
        items: [{ sku: 'SCF-SILK-TWILL-NVY', quantity: 2 }],
    },
];

const refreshImages = process.argv.includes('--refresh-images');

const fallbackPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAGUlEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAB8G4QAAAFxKxV8AAAAAElFTkSuQmCC',
    'base64'
);

function mimeFromName(name: string) {
    const ext = path.extname(name).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    return 'image/png';
}

async function fileFromProductImage(product: SeedProduct): Promise<File> {
    if (product.imagePath) {
        const file = Bun.file(product.imagePath);
        const buffer = Buffer.from(await file.arrayBuffer());
        return new File([buffer], path.basename(product.imagePath), { type: mimeFromName(product.imagePath) });
    }

    if (product.imageUrl) {
        try {
            const res = await fetch(product.imageUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const contentType = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
            const extension = contentType.includes('webp') ? 'webp' : contentType.includes('png') ? 'png' : 'jpg';
            const buffer = Buffer.from(await res.arrayBuffer());
            return new File([buffer], `${slugify(product.name)}.${extension}`, { type: contentType });
        } catch (err) {
            console.warn(`Image download failed for "${product.name}". Using placeholder.`, err);
        }
    }

    return new File([fallbackPng], `${slugify(product.name)}.png`, { type: 'image/png' });
}

async function ensureCategory(name: string, description: string) {
    const slug = slugify(name);
    const [existing] = await sql<{ id: number }[]>`SELECT id FROM categories WHERE slug = ${slug}`;
    if (existing) return existing.id;

    const [created] = await sql<{ id: number }[]>`
        INSERT INTO categories(name, slug, description)
        VALUES (${name}, ${slug}, ${description})
        RETURNING id
    `;
    console.log(`Created category: ${name}`);
    return created!.id;
}

async function upsertProduct(product: SeedProduct, categoryId: number, imageUrl: string) {
    const slug = slugify(product.name);
    const sku = `PRD-${slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 32)}`;
    const [existing] = await sql<{ id: number }[]>`SELECT id FROM products WHERE slug = ${slug}`;

    if (existing) {
        const [updated] = await sql<{ id: number }[]>`
            UPDATE products
            SET
                category_id = ${categoryId},
                name = ${product.name},
                description = ${product.description},
                price = ${product.price},
                image_url = ${imageUrl},
                is_active = true,
                is_featured = ${product.is_featured ?? false},
                sale_price = ${product.sale_price ?? null},
                sale_ends_at = ${product.sale_ends_at ?? null},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${existing.id}
            RETURNING id
        `;
        return updated!.id;
    }

    const [created] = await sql<{ id: number }[]>`
        INSERT INTO products(
            category_id, sku, name, slug, description, price, stock, image_url,
            is_active, is_featured, sale_price, sale_ends_at
        )
        VALUES (
            ${categoryId}, ${sku}, ${product.name}, ${slug}, ${product.description},
            ${product.price}, 0, ${imageUrl}, true, ${product.is_featured ?? false},
            ${product.sale_price ?? null}, ${product.sale_ends_at ?? null}
        )
        RETURNING id
    `;
    console.log(`Created product: ${product.name}`);
    return created!.id;
}

async function getProductImageUrl(product: SeedProduct) {
    if (!refreshImages) {
        const slug = slugify(product.name);
        const [existing] = await sql<{ image_url: string | null }[]>`
            SELECT image_url FROM products WHERE slug = ${slug}
        `;
        if (existing?.image_url) return existing.image_url;
    }

    const file = await fileFromProductImage(product);
    const uploaded = await imageUploadService.upload(file);
    return uploaded.url;
}

async function upsertVariant(productId: number, variant: SeedVariant) {
    const [existing] = await sql<{ id: number }[]>`SELECT id FROM product_variants WHERE sku = ${variant.sku}`;
    if (existing) {
        await sql`
            UPDATE product_variants
            SET
                product_id = ${productId},
                size = ${variant.size ?? null},
                color = ${variant.color ?? null},
                stock = ${variant.stock},
                low_stock_threshold = ${variant.low_stock_threshold ?? 5},
                price_override = ${variant.price_override ?? null},
                is_active = ${variant.is_active ?? true},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${existing.id}
        `;
        return;
    }

    await sql`
        INSERT INTO product_variants(
            product_id, sku, size, color, stock, low_stock_threshold, price_override, is_active
        )
        VALUES (
            ${productId}, ${variant.sku}, ${variant.size ?? null}, ${variant.color ?? null},
            ${variant.stock}, ${variant.low_stock_threshold ?? 5}, ${variant.price_override ?? null},
            ${variant.is_active ?? true}
        )
    `;
}

async function upsertShippingLocation(location: SeedShippingLocation) {
    const [existing] = await sql<{ id: number }[]>`
        SELECT id FROM shipping_locations WHERE LOWER(name) = LOWER(${location.name})
    `;
    if (existing) {
        await sql`
            UPDATE shipping_locations
            SET price = ${location.price}, is_active = ${location.is_active ?? true}
            WHERE id = ${existing.id}
        `;
        return existing.id;
    }

    const [created] = await sql<{ id: number }[]>`
        INSERT INTO shipping_locations(name, price, is_active)
        VALUES (${location.name}, ${location.price}, ${location.is_active ?? true})
        RETURNING id
    `;
    console.log(`Created shipping location: ${location.name}`);
    return created!.id;
}

async function upsertDiscountCode(discount: SeedDiscountCode) {
    const code = discount.code.toUpperCase();
    const [existing] = await sql<{ id: number }[]>`
        SELECT id FROM discount_codes WHERE UPPER(code) = ${code}
    `;
    if (existing) {
        await sql`
            UPDATE discount_codes
            SET
                value = ${discount.value},
                min_order_amount = ${discount.min_order_amount ?? 0},
                usage_limit = ${discount.usage_limit ?? null},
                used_count = ${discount.used_count ?? 0},
                expires_at = ${discount.expires_at ?? null},
                is_active = ${discount.is_active ?? true}
            WHERE id = ${existing.id}
        `;
        return existing.id;
    }

    const [created] = await sql<{ id: number }[]>`
        INSERT INTO discount_codes(code, value, min_order_amount, usage_limit, used_count, expires_at, is_active)
        VALUES (
            ${code},
            ${discount.value},
            ${discount.min_order_amount ?? 0},
            ${discount.usage_limit ?? null},
            ${discount.used_count ?? 0},
            ${discount.expires_at ?? null},
            ${discount.is_active ?? true}
        )
        RETURNING id
    `;
    console.log(`Created promo code: ${code}`);
    return created!.id;
}

function demoCustomerEmail(order: SeedOrder) {
    return `${slugify(order.customer_name)}@demo.bagstreet.local`;
}

async function ensureCustomer(order: SeedOrder) {
    const email = demoCustomerEmail(order);
    const [existing] = await sql<{ id: number }[]>`SELECT id FROM users WHERE email = ${email}`;
    if (existing) return existing.id;

    const passwordHash = await Bun.password.hash('Customer@1234');
    const [created] = await sql<{ id: number }[]>`
        INSERT INTO users(email, full_name, password_hash, role, is_active)
        VALUES (${email}, ${order.customer_name}, ${passwordHash}, 'CUSTOMER', true)
        RETURNING id
    `;
    return created!.id;
}

async function seedOrder(order: SeedOrder, shippingLocationIds: Map<string, number>) {
    const [existing] = await sql<{ id: number }[]>`
        SELECT id FROM orders WHERE notes LIKE ${`%seed:${order.ref}%`}
    `;
    if (existing) {
        console.log(`Order already exists: ${order.ref}`);
        return existing.id;
    }

    const shippingLocationId = shippingLocationIds.get(order.shipping_location);
    if (!shippingLocationId) throw new Error(`Missing shipping location: ${order.shipping_location}`);

    const rows = [];
    for (const item of order.items) {
        const [variant] = await sql<{
            id: number;
            product_id: number;
            sku: string;
            size: string | null;
            color: string | null;
            price_override: string | null;
            product_price: string;
            sale_price: string | null;
            sale_ends_at: string | null;
        }[]>`
            SELECT
                pv.id, pv.product_id, pv.sku, pv.size, pv.color, pv.price_override,
                p.price AS product_price, p.sale_price, p.sale_ends_at
            FROM product_variants pv
            JOIN products p ON p.id = pv.product_id
            WHERE pv.sku = ${item.sku}
        `;
        if (!variant) throw new Error(`Missing variant for order ${order.ref}: ${item.sku}`);
        const saleIsActive = variant.sale_price != null
            && (!variant.sale_ends_at || new Date(variant.sale_ends_at).getTime() > Date.now());
        const unitPrice = variant.price_override != null
            ? parseFloat(variant.price_override)
            : saleIsActive
                ? parseFloat(variant.sale_price!)
                : parseFloat(variant.product_price);
        rows.push({ ...item, variant, unitPrice, subtotal: unitPrice * item.quantity });
    }

    const [shipping] = await sql<{ price: string }[]>`
        SELECT price FROM shipping_locations WHERE id = ${shippingLocationId}
    `;
    const itemsTotal = rows.reduce((sum, row) => sum + row.subtotal, 0);
    const shippingCost = parseFloat(shipping?.price ?? '0');
    const discountAmount = order.discount_amount ?? 0;
    const totalAmount = Math.max(0, itemsTotal - discountAmount) + shippingCost;
    const createdAt = new Date(Date.now() - order.created_days_ago * 24 * 60 * 60 * 1000).toISOString();
    const userId = await ensureCustomer(order);
    const customerEmail = demoCustomerEmail(order);
    const shippingAddress = {
        full_name: order.customer_name,
        email: customerEmail,
        phone: order.customer_phone,
        address_line1: order.address_line1,
        address_line2: '',
        city: order.city,
        state: order.state,
        postal_code: '',
        country: 'Kenya',
    };

    const [createdOrder] = await sql<{ id: number }[]>`
        INSERT INTO orders(
            user_id, status, total_amount, shipping_address, notes, created_at, updated_at,
            shipping_location_id, shipping_cost, payment_status, discount_code, discount_amount,
            customer_name, customer_phone, customer_email
        )
        VALUES (
            ${userId}, ${order.status}, ${totalAmount}, ${JSON.stringify(shippingAddress)}::jsonb,
            ${`${order.notes ?? 'Demo order'} seed:${order.ref}`}, ${createdAt}, ${createdAt},
            ${shippingLocationId}, ${shippingCost}, ${order.payment_status}, ${order.discount_code ?? null},
            ${discountAmount}, ${order.customer_name}, ${order.customer_phone}, ${customerEmail}
        )
        RETURNING id
    `;

    for (const row of rows) {
        await sql`
            INSERT INTO order_items(
                order_id, product_id, variant_id, variant_sku, variant_size, variant_color,
                quantity, unit_price, subtotal, created_at
            )
            VALUES (
                ${createdOrder!.id}, ${row.variant.product_id}, ${row.variant.id}, ${row.variant.sku},
                ${row.variant.size}, ${row.variant.color}, ${row.quantity}, ${row.unitPrice},
                ${row.subtotal}, ${createdAt}
            )
        `;
    }

    if (order.payment_status === 'PAID') {
        await sql`
            INSERT INTO payment_transactions(
                order_id, provider, provider_reference, merchant_reference, checkout_url, amount,
                currency, status, payment_method, confirmation_code, result_desc, raw_payload, created_at, updated_at
            )
            VALUES (
                ${createdOrder!.id}, 'pesapal', ${`seed-pesapal-${order.ref}`}, ${`BS-SEED-${order.ref}`},
                ${null}, ${totalAmount}, 'KES', 'COMPLETED', 'SEED', ${`SEED${createdOrder!.id}`},
                'Seed payment completed', ${JSON.stringify({ seed: true, order_ref: order.ref })}::jsonb,
                ${createdAt}, ${createdAt}
            )
            ON CONFLICT (provider, merchant_reference) DO NOTHING
        `;
    }

    if (order.discount_code && discountAmount > 0) {
        const [discount] = await sql<{ id: number }[]>`
            SELECT id FROM discount_codes WHERE UPPER(code) = ${order.discount_code.toUpperCase()}
        `;
        if (discount) {
            await sql`
                INSERT INTO discount_code_usages(code_id, order_id, phone, discount_amount, created_at)
                VALUES (${discount.id}, ${createdOrder!.id}, ${order.customer_phone}, ${discountAmount}, ${createdAt})
                ON CONFLICT (code_id, phone) DO NOTHING
            `;
        }
    }

    console.log(`Created order: ${order.ref}`);
    return createdOrder!.id;
}

async function seedProducts() {
    await migrateDatabase();

    const categoryIds = new Map<string, number>();
    for (const category of categories) {
        categoryIds.set(category.name, await ensureCategory(category.name, category.description));
    }

    for (const product of products) {
        const categoryId = categoryIds.get(product.category);
        if (!categoryId) throw new Error(`Missing category: ${product.category}`);

        const imageUrl = await getProductImageUrl(product);
        const productId = await upsertProduct(product, categoryId, imageUrl);

        for (const variant of product.variants) {
            await upsertVariant(productId, variant);
        }

        console.log(`Seeded product: ${product.name} (${product.variants.length} variants)`);
    }

    const shippingLocationIds = new Map<string, number>();
    for (const location of shippingLocations) {
        shippingLocationIds.set(location.name, await upsertShippingLocation(location));
    }

    for (const discount of discountCodes) {
        await upsertDiscountCode(discount);
    }

    await sql`
        INSERT INTO settings(key, value)
        VALUES ('free_delivery_threshold', '10000')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
    `;

    for (const order of orders) {
        await seedOrder(order, shippingLocationIds);
    }

    await sql.end();
    console.log('Demo seed complete.');
}

seedProducts().catch(async (err) => {
    console.error(err);
    await sql.end();
    process.exit(1);
});
