import { BlobServiceClient } from "@azure/storage-blob";
import { env } from "../config/env";
import { v4 as uuidv4 } from 'uuid';

export const imageUploadService = {
    upload: async (file: File) => {
        const fileName = `${uuidv4()}-${file.name}`;
        const blobServiceClient = new BlobServiceClient(env.AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(env.AZURE_STORAGE_CONTAINER_NAME);
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        await blockBlobClient.upload(file, file.size);
        return blockBlobClient.url;
    }
}