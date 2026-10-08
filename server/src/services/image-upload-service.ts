import { Client } from "minio";
import { env } from "../config/env";
import { v4 as uuidv4 } from 'uuid';
import { BadRequestError } from "@server/lib/errors";
import sharp from "sharp";

const minioClient = new Client({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_USE_SSL,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
});

let bucketReady: Promise<void> | null = null;

async function ensureBucket() {
    const exists = await minioClient.bucketExists(env.MINIO_BUCKET);
    if (!exists) {
        await minioClient.makeBucket(env.MINIO_BUCKET);
        await minioClient.setBucketPolicy(env.MINIO_BUCKET, JSON.stringify({
            Version: '2012-10-17',
            Statement: [{
                Effect: 'Allow',
                Principal: { AWS: ['*'] },
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${env.MINIO_BUCKET}/*`],
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

function objectUrl(fileName: string) {
    const protocol = env.MINIO_USE_SSL ? 'https' : 'http';
    return `${protocol}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/${env.MINIO_BUCKET}/${fileName}`;
}

async function uploadObject(fileName: string, buffer: Buffer, contentType: string) {
    await minioClient.putObject(env.MINIO_BUCKET, fileName, buffer, buffer.length, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
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
            Object.values<{ filename: string }>(uploaded).map((image) => minioClient.removeObject(env.MINIO_BUCKET, image.filename)),
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
            optimizedSiblingNames(filename).map((name) => minioClient.removeObject(env.MINIO_BUCKET, name)),
        );
    },
};
