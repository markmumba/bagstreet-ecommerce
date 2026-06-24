import { Client } from "minio";
import { env } from "../config/env";
import { v4 as uuidv4 } from 'uuid';
import { BadRequestError } from "@server/lib/errors";
import path from "path";

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

export const imageUploadService = {
    upload: async (file: File) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            throw new BadRequestError('Invalid file type');
        }
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            throw new BadRequestError('File size exceeds the maximum allowed size');
        }

        await getBucketReady();

        const fileExtension = path.extname(file.name);
        const fileName = `${uuidv4()}${fileExtension}`;
        const buffer = Buffer.from(await file.arrayBuffer());

        await minioClient.putObject(env.MINIO_BUCKET, fileName, buffer, file.size, {
            'Content-Type': file.type,
        });

        const protocol = env.MINIO_USE_SSL ? 'https' : 'http';
        const url = `${protocol}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/${env.MINIO_BUCKET}/${fileName}`;

        return { url, filename: fileName };
    },

    delete: async (filename: string) => {
        await minioClient.removeObject(env.MINIO_BUCKET, filename);
    },
};
