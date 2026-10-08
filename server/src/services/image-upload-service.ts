import { Client } from "minio";
import { env } from "../config/env";
import { v4 as uuidv4 } from 'uuid';
import { BadRequestError } from "@server/lib/errors";
import sharp from "sharp";

const minioClient = new Client({
    endPoint: env.STORAGE_ENDPOINT,
    port: env.STORAGE_PORT,
    useSSL: env.STORAGE_USE_SSL,
    accessKey: env.STORAGE_ACCESS_KEY,
    secretKey: env.STORAGE_SECRET_KEY,
    ...(env.STORAGE_REGION ? { region: env.STORAGE_REGION } : {}),
});

let bucketReady: Promise<void> | null = null;

async function ensureBucket() {
    const exists = await minioClient.bucketExists(env.STORAGE_BUCKET);
    if (!exists) {
        await minioClient.makeBucket(env.STORAGE_BUCKET);
        await minioClient.setBucketPolicy(env.STORAGE_BUCKET, JSON.stringify({
            Version: '2012-10-17',
            Statement: [{
                Effect: 'Allow',
                Principal: { AWS: ['*'] },
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${env.STORAGE_BUCKET}/*`],
            }],
        }));
    }
}

function getBucketReady() {
    if (!bucketReady) {
        bucketReady = ensureBucket().catch((err) => {
            bucketReady = null;
            throw err;
        });
    }
    return bucketReady;
}

const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'image/webp',
    'image/heic',
    'image/heif',
];

const imageSizes = [
    { key: 'thumb', width: 160, quality: 75 },
    { key: 'medium', width: 640, quality: 80 },
    { key: 'large', width: 1200, quality: 82 },
] as const;

// Full-bleed banners (e.g. the storefront hero) need more width than product images.
const bannerSizes = [
    { key: 'banner-sm', width: 1080, quality: 80 },
    { key: 'banner', width: 2400, quality: 82 },
] as const;

/** Public URL for an object. In production the server uploads through the storage API but browsers
 * load images from STORAGE_PUBLIC_URL (e.g. the Spaces CDN), which has objects directly under it. */
export function objectUrl(fileName: string) {
    if (env.STORAGE_PUBLIC_URL) {
        return `${env.STORAGE_PUBLIC_URL.replace(/\/+$/, '')}/${fileName}`;
    }
    const protocol = env.STORAGE_USE_SSL ? 'https' : 'http';
    return `${protocol}://${env.STORAGE_ENDPOINT}:${env.STORAGE_PORT}/${env.STORAGE_BUCKET}/${fileName}`;
}

async function uploadObject(fileName: string, buffer: Buffer, contentType: string) {
    await minioClient.putObject(env.STORAGE_BUCKET, fileName, buffer, buffer.length, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        // Spaces: each image is individually public; the Space itself stays private (no listing).
        ...(env.STORAGE_OBJECT_ACL ? { 'x-amz-acl': env.STORAGE_OBJECT_ACL } : {}),
    });
}

function optimizedSiblingNames(filename: string) {
    const banner = filename.match(/^(?<base>.+)-(banner|banner-sm)\.webp$/);
    if (banner?.groups?.base) return bannerSizes.map((size) => `${banner.groups!.base}-${size.key}.webp`);

    const match = filename.match(/^(?<base>.+)-(thumb|medium|large)\.webp$/);
    if (!match?.groups?.base) return [filename];

    return imageSizes.map((size) => `${match.groups!.base}-${size.key}.webp`);
}

async function uploadSizes<const S extends readonly { key: string; width: number; quality: number }[]>(file: File, sizes: S) {
    if (!allowedTypes.includes(file.type)) {
        throw new BadRequestError('Invalid file type');
    }
    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
        throw new BadRequestError('Image must be 15MB or smaller');
    }

    await getBucketReady();

    const buffer = Buffer.from(await file.arrayBuffer());
    const baseName = uuidv4();
    const uploaded = {} as Record<S[number]['key'], { url: string; filename: string }>;

    try {
        for (const size of sizes) {
            const optimizedBuffer = await sharp(buffer, { failOn: 'none' })
                .rotate()
                .resize({ width: size.width, withoutEnlargement: true })
                .webp({ quality: size.quality })
                .toBuffer();
            const filename = `${baseName}-${size.key}.webp`;
            await uploadObject(filename, optimizedBuffer, 'image/webp');
            uploaded[size.key as S[number]['key']] = { url: objectUrl(filename), filename };
        }
    } catch {
        await Promise.allSettled(
            Object.values<{ filename: string }>(uploaded).map((image) => minioClient.removeObject(env.STORAGE_BUCKET, image.filename)),
        );
        throw new BadRequestError('Image could not be processed. Please upload a JPEG, PNG, WebP, HEIC, or HEIF image.');
    }

    return uploaded;
}

export const imageUploadService = {
    upload: async (file: File) => {
        const uploaded = await uploadSizes(file, imageSizes);
        return {
            url: uploaded.large.url,
            filename: uploaded.large.filename,
            variants: uploaded,
        };
    },

    /** Wide banner for full-bleed placements; returns desktop and phone URLs. */
    uploadBanner: async (file: File) => {
        const uploaded = await uploadSizes(file, bannerSizes);
        return {
            url: uploaded.banner.url,
            smallUrl: uploaded['banner-sm'].url,
            filename: uploaded.banner.filename,
        };
    },

    delete: async (filename: string) => {
        await Promise.allSettled(
            optimizedSiblingNames(filename).map((name) => minioClient.removeObject(env.STORAGE_BUCKET, name)),
        );
    },
};
