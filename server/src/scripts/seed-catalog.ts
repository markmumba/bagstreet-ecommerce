/**
 * Seeds the storefront catalogue (Bags, Shoes, Scarves, Pajamas) from a folder of product photos.
 *
 *   bun run seed:catalog --images <dir>           # add/update products, keep existing data
 *   bun run seed:catalog --images <dir> --reset   # wipe products, categories AND orders first
 *
 * Images go through the normal upload pipeline (resized WebP in MinIO), so seeded products
 * look exactly like ones created in the admin.
 */
import 'dotenv/config';
import path from 'path';
import { sql } from '../lib/db';
import { migrateDatabase } from '../lib/migrations';
import { imageUploadService } from '../services/image-upload-service';
import { slugify } from '../lib/util';

type CatalogVariant = { color?: string; size?: string; stock: number };

type CatalogProduct = {
    image: string;
    name: string;
    category: string;
    description: string;
    price: number;
    sale_price?: number;
    is_featured?: boolean;
    variants: CatalogVariant[];
};

const SHOE_SIZES = ['36', '37', '38', '39', '40', '41'];
const PJ_SIZES = ['S', 'M', 'L', 'XL'];

const categories = [
    { name: 'Bags', description: 'Totes, top handles and shoulder bags — chosen for structure, finish and everyday ease.' },
    { name: 'Shoes', description: 'Flats, loafers and sandals with a polished, comfortable edge.' },
    { name: 'Scarves', description: 'Printed and fringed scarves to finish every look.' },
    { name: 'Pajamas', description: 'Soft piped sets for slow mornings and easy evenings.' },
];

/** Spread stock across sizes so some show "Only N left" on the storefront. */
function sized(color: string, sizes: string[], stocks: number[]): CatalogVariant[] {
    return sizes.map((size, i) => ({ color, size, stock: stocks[i % stocks.length]! }));
}

const products: CatalogProduct[] = [
    // ── Bags ──────────────────────────────────────────────────────────────
    {
        image: 'bag1.jpeg',
        name: 'Coach City Tote — Signature Cherry',
        category: 'Bags',
        description: 'A roomy open tote in Coach signature coated canvas with smooth dark-brown handles. Finished with a glossy cherry bag charm and gold hang-tag hardware. Fits a laptop, a water bottle and the rest of your day.',
        price: 8500,
        is_featured: true,
        variants: [{ color: 'Brown', stock: 6 }],
    },
    {
        image: 'bag2.jpeg',
        name: 'Orlisse Winged Tote',
        category: 'Bags',
        description: 'A sculpted tote with fanned side wings in a deep burgundy smooth finish, accented with slim gold bar hardware. Structured enough for the office, soft enough for every day.',
        price: 9200,
        is_featured: true,
        variants: [{ color: 'Burgundy', stock: 5 }],
    },
    {
        image: 'bag3.jpeg',
        name: 'Ferragamo Hug Mini Top Handle',
        category: 'Bags',
        description: 'A compact top-handle bag in forest green with signature gold Gancini hardware, a matching leather tag and a detachable shoulder strap. A polished finishing piece for day or evening.',
        price: 12500,
        is_featured: true,
        variants: [{ color: 'Forest Green', stock: 3 }],
    },
    {
        image: 'bag4.jpeg',
        name: 'Coach Sierra Dome Satchel',
        category: 'Bags',
        description: 'A classic dome satchel in black crossgrain with rolled top handles, a zip-around closure and a detachable crossbody strap. Gold-tone hardware and the Coach hang tag finish it.',
        price: 7800,
        variants: [{ color: 'Black', stock: 8 }],
    },
    {
        image: 'bag5.jpeg',
        name: 'Coach Mollie Tote 25',
        category: 'Bags',
        description: 'The smaller Mollie in Coach signature canvas with buckled black handles and a detachable crossbody strap. Carry it by hand or wear it across the body.',
        price: 6900,
        variants: [{ color: 'Brown / Black', stock: 7 }],
    },
    {
        image: 'bag6.jpeg',
        name: 'Coach Mollie Tote',
        category: 'Bags',
        description: 'The full-size Mollie tote in signature canvas with buckled black handles, side D-rings for the included strap and a gold-chain hang tag. Space for everything, without the bulk.',
        price: 7500,
        variants: [{ color: 'Brown / Black', stock: 5 }],
    },
    {
        image: 'bag7.jpeg',
        name: 'Loewe Anagram Tote',
        category: 'Bags',
        description: 'A structured canvas tote in natural ecru with the embroidered Anagram, tan leather handles and a contrast tan interior. An effortless everyday carry.',
        price: 11000,
        is_featured: true,
        variants: [{ color: 'Ecru / Tan', stock: 4 }],
    },
    {
        image: 'bag8.jpeg',
        name: 'Cherry Charm Shoulder Bag',
        category: 'Bags',
        description: 'A curved crescent shoulder bag in glossy burgundy with a top zip and a playful gold cherry charm. Tucks neatly under the arm.',
        price: 5200,
        is_featured: true,
        variants: [{ color: 'Burgundy', stock: 9 }],
    },
    {
        image: 'bag9.jpeg',
        name: 'Luna Sculpted Handle Bag',
        category: 'Bags',
        description: 'A soft half-moon bag in sage green, crowned with a sculptural polished-gold handle. A quiet statement for evenings out.',
        price: 6800,
        variants: [{ color: 'Sage', stock: 4 }],
    },
    {
        image: 'bag10.jpeg',
        name: 'Bordeaux Trapeze Top Handle',
        category: 'Bags',
        description: 'A trapeze top-handle bag in rich bordeaux with a crisp fold-over flap, fine edge stitching and a detachable shoulder strap.',
        price: 6500,
        variants: [{ color: 'Bordeaux', stock: 2 }],
    },
    {
        image: 'bag11.jpeg',
        name: 'Chocolat Turn-Lock Top Handle',
        category: 'Bags',
        description: 'A structured top-handle bag in chocolate brown with a gold turn-lock strap closure and gold feet. Timeless, ladylike and made to be carried for years.',
        price: 7200,
        variants: [{ color: 'Chocolate', stock: 6 }],
    },

    // ── Shoes ─────────────────────────────────────────────────────────────
    {
        image: 'shoe1.jpeg',
        name: 'Embellished Pointed Flats',
        category: 'Shoes',
        description: 'Pointed-toe d’Orsay flats in black, finished with fine beaded embellishment and a slim ankle strap with buckle. Evening sparkle with flat-shoe comfort.',
        price: 3900,
        variants: sized('Black', SHOE_SIZES, [3, 5, 6, 6, 4, 2]),
    },
    {
        image: 'shoe2.jpeg',
        name: 'Embossed Square-Toe Loafers',
        category: 'Shoes',
        description: 'Soft square-toe loafers in an embossed chocolate finish with a gold horseshoe buckle. Easy to slip on, polished enough for the office.',
        price: 4300,
        variants: sized('Chocolate', SHOE_SIZES, [2, 4, 6, 5, 3, 2]),
    },
    {
        image: 'shoe3.jpg',
        name: 'Crystal Strap Slide Sandals',
        category: 'Shoes',
        description: 'Square-toe slides in nude with criss-cross straps covered in rose-gold crystals and a cushioned footbed.',
        price: 3600,
        is_featured: true,
        variants: sized('Nude', SHOE_SIZES, [4, 6, 8, 6, 4, 3]),
    },

    // ── Scarves ───────────────────────────────────────────────────────────
    {
        image: 'scarf1.jpeg',
        name: 'Camellia Print Scarf',
        category: 'Scarves',
        description: 'A long satin-finish scarf in ivory printed with white camellias, green leaves and a golden chain motif, framed by a forest-green border.',
        price: 2500,
        is_featured: true,
        variants: [{ color: 'Ivory / Green', stock: 10 }],
    },
    {
        image: 'scarf2.jpeg',
        name: 'Rose Check Fringe Scarf',
        category: 'Scarves',
        description: 'A soft brushed scarf in a rose and taupe check, finished with tasselled fringe. Generous enough to wrap twice.',
        price: 2200,
        variants: [{ color: 'Rose / Taupe', stock: 12 }],
    },
    {
        image: 'scarf3.jpeg',
        name: 'Pastel Plaid Fringe Scarf',
        category: 'Scarves',
        description: 'A soft brushed scarf in a lilac, dove-grey and cream plaid with fringed ends — an easy layer for cool mornings.',
        price: 2200,
        variants: [{ color: 'Lilac / Grey', stock: 8 }],
    },

    // ── Pajamas ───────────────────────────────────────────────────────────
    {
        image: 'pj1.jpeg',
        name: 'Noir Piped Pajama Set',
        category: 'Pajamas',
        description: 'A long-sleeve button-up shirt and relaxed wide-leg trousers in soft black jersey, edged with crisp white piping and a chest pocket.',
        price: 3800,
        variants: sized('Black', PJ_SIZES, [5, 7, 6, 3]),
    },
    {
        image: 'pg2.jpeg',
        name: 'Cœur Heart Print Pajama Set',
        category: 'Pajamas',
        description: 'A soft jersey pajama set in white scattered with black hearts, with contrast piping, a notch collar and a chest pocket. Cute, cosy and made for lazy weekends.',
        price: 3500,
        is_featured: true,
        variants: sized('White', PJ_SIZES, [6, 8, 6, 4]),
    },
    {
        image: 'pj3.jpeg',
        name: 'Cœur Crinkle Cotton Pajama Set',
        category: 'Pajamas',
        description: 'A breathable crinkle-texture cotton set in cream with tiny black hearts, black piping and relaxed wide-leg trousers.',
        price: 3900,
        variants: sized('Cream', PJ_SIZES, [4, 6, 5, 2]),
    },
];

// ── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const imagesFlag = args.indexOf('--images');
const imagesDir = imagesFlag >= 0 ? args[imagesFlag + 1] : undefined;

if (!imagesDir) {
    console.error('Usage: bun run seed:catalog --images <dir> [--reset]');
    process.exit(1);
}

/** slugify() drops non-ASCII letters, so transliterate first: "Cœur" → "coeur", not "c-ur". */
function productSlug(name: string) {
    return slugify(name.replace(/œ/gi, 'oe').normalize('NFKD').replace(/[\u0300-\u036f]/g, ''));
}

function mimeFromName(name: string) {
    const ext = path.extname(name).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    return 'image/png';
}

/** Deletes every product, category and order (and what references them). Returns old image filenames. */
async function resetCatalog(): Promise<string[]> {
    const imageRows = await sql<{ url: string }[]>`
        SELECT url FROM product_images
        UNION SELECT image_url AS url FROM products WHERE image_url IS NOT NULL
    `;

    await sql.begin(async (tx: typeof sql) => {
        // Orders reference variants/products with RESTRICT, so they go first.
        await tx`DELETE FROM payment_ledger_entries`;
        await tx`DELETE FROM payment_transactions`;
        await tx`DELETE FROM mpesa_transactions`;
        await tx`DELETE FROM discount_code_usages`;
        await tx`DELETE FROM orders`; // cascades order_items
        await tx`DELETE FROM inventory_movements`;
        await tx`DELETE FROM cart_items`;
        await tx`DELETE FROM products`; // cascades product_variants, product_images
        await tx`DELETE FROM categories WHERE parent_id IS NOT NULL`;
        await tx`DELETE FROM categories`;
    });

    return [...new Set(imageRows.map((row) => row.url.split('/').pop()!).filter(Boolean))];
}

async function ensureCategory(name: string, description: string) {
    const slug = slugify(name);
    const [row] = await sql<{ id: number }[]>`
        INSERT INTO categories(name, slug, description)
        VALUES (${name}, ${slug}, ${description})
        ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP
        RETURNING id
    `;
    return row!.id;
}

async function uploadImage(fileName: string) {
    const filePath = path.join(imagesDir!, fileName);
    const buffer = Buffer.from(await Bun.file(filePath).arrayBuffer());
    const uploaded = await imageUploadService.upload(new File([buffer], fileName, { type: mimeFromName(fileName) }));
    return uploaded.url;
}

async function seedProduct(product: CatalogProduct, categoryId: number) {
    const slug = productSlug(product.name);
    const productSku = `PRD-${slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 32)}`;

    const [existing] = await sql<{ id: number; image_url: string | null }[]>`
        SELECT id, image_url FROM products WHERE slug = ${slug}
    `;
    const imageUrl = existing?.image_url ?? await uploadImage(product.image);

    const [row] = await sql<{ id: number }[]>`
        INSERT INTO products(
            category_id, sku, name, slug, description, price, stock, image_url,
            is_active, is_featured, sale_price
        )
        VALUES (
            ${categoryId}, ${productSku}, ${product.name}, ${slug}, ${product.description},
            ${product.price}, 0, ${imageUrl}, true, ${product.is_featured ?? false}, ${product.sale_price ?? null}
        )
        ON CONFLICT (slug) DO UPDATE SET
            category_id = EXCLUDED.category_id,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            price = EXCLUDED.price,
            is_active = true,
            is_featured = EXCLUDED.is_featured,
            sale_price = EXCLUDED.sale_price,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id
    `;
    const productId = row!.id;

    await sql`DELETE FROM product_images WHERE product_id = ${productId}`;
    await sql`
        INSERT INTO product_images(product_id, url, alt_text, position, is_primary)
        VALUES (${productId}, ${imageUrl}, ${product.name}, 0, true)
    `;

    for (const variant of product.variants) {
        const parts = [slug.toUpperCase().slice(0, 20), variant.color, variant.size]
            .filter(Boolean)
            .map((part) => part!.toUpperCase().replace(/[^A-Z0-9]+/g, ''));
        const variantSku = parts.join('-');

        await sql`
            INSERT INTO product_variants(product_id, sku, size, color, stock, low_stock_threshold, is_active)
            VALUES (${productId}, ${variantSku}, ${variant.size ?? null}, ${variant.color ?? null}, ${variant.stock}, 3, true)
            ON CONFLICT (sku) DO UPDATE SET
                product_id = EXCLUDED.product_id,
                size = EXCLUDED.size,
                color = EXCLUDED.color,
                stock = EXCLUDED.stock,
                is_active = true,
                updated_at = CURRENT_TIMESTAMP
        `;
    }

    const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
    console.log(`  ✓ ${product.name.padEnd(36)} ${product.category.padEnd(8)} KSh ${product.price.toLocaleString()}  ·  ${product.variants.length} variant(s), ${totalStock} in stock${product.is_featured ? '  ★' : ''}`);
}

async function main() {
    await migrateDatabase();

    if (reset) {
        console.log('Resetting catalogue and orders…');
        const oldImages = await resetCatalog();
        await Promise.all(oldImages.map((filename) => imageUploadService.delete(filename)));
        console.log(`  Removed old products, categories, orders and ${oldImages.length} stored image(s).`);
    }

    console.log('Categories…');
    const categoryIds = new Map<string, number>();
    for (const category of categories) {
        categoryIds.set(category.name, await ensureCategory(category.name, category.description));
        console.log(`  ✓ ${category.name}`);
    }

    console.log('Products…');
    for (const product of products) {
        await seedProduct(product, categoryIds.get(product.category)!);
    }

    console.log(`Done — ${products.length} products in ${categories.length} categories.`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => sql.end());
