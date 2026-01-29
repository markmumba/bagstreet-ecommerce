import { BlobServiceClient } from "@azure/storage-blob";
import { env } from "../config/env";
import { v4 as uuidv4 } from 'uuid';
import { BadRequestError } from "@server/lib/errors";

export const imageUploadService = {
    upload: async (file: File) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
        if(!allowedTypes.includes(file.type)){
            throw new BadRequestError('Invalid file type');
        }
        const maxSize = 10 * 1024 * 1024; 
        if(file.size > maxSize){
            throw new BadRequestError('File size exceeds the maximum allowed size');
        }
        const fileName = `${uuidv4()}-${file.name}`;

        const blobServiceClient =BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(env.AZURE_STORAGE_CONTAINER_NAME);
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);

        await blockBlobClient.upload(file,file.size,{
            blobHTTPHeaders:{
                blobContentType: file.type,
            },
        });

        return {
            url: blockBlobClient.url,
            filename: fileName,
        }
    },
    delete: async(filename: string) => {
        const blobServiceClient =BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(env.AZURE_STORAGE_CONTAINER_NAME);
        const blockBlobClient = containerClient.getBlockBlobClient(filename);
        await blockBlobClient.delete();
    }
}