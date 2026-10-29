import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { objectStorageConfigSchema, type ObjectStorageConfig } from "./object-storage.config";

export type ObjectMetadata = { size: number; contentType: string; etag?: string };
export type ObjectStorage = {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  inspect(key: string): Promise<ObjectMetadata>;
  downloadUrl(key: string, fileName: string): Promise<string>;
  delete(key: string): Promise<void>;
  close(): void;
};

export function privateObjectKey(programId: string, fileId = randomUUID()) {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!uuid.test(programId) || !uuid.test(fileId)) throw new Error("Invalid private file identity.");
  return `programs/${programId}/files/${fileId}`;
}
function assertKey(key: string) {
  if (!/^programs\/[a-f0-9-]{36}\/files\/[a-f0-9-]{36}$/i.test(key)) throw new Error("Invalid private object key.");
}

export function createS3ObjectStorage(config: ObjectStorageConfig, client = new S3Client({
  endpoint: config.S3_ENDPOINT, region: config.S3_REGION, forcePathStyle: config.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: config.S3_ACCESS_KEY_ID!, secretAccessKey: config.S3_SECRET_ACCESS_KEY! },
})): ObjectStorage {
  if (config.FILE_STORAGE_PROVIDER !== "s3" || !config.S3_BUCKET) throw new Error("S3 storage has not been selected.");
  const Bucket = config.S3_BUCKET;
  return {
    async put(Key, Body, ContentType) {
      assertKey(Key);
      await client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType, ContentLength: Body.byteLength }), { abortSignal: AbortSignal.timeout(30000) });
    },
    async inspect(Key) {
      assertKey(Key); const object = await client.send(new HeadObjectCommand({ Bucket, Key }), { abortSignal: AbortSignal.timeout(10000) });
      if (object.ContentLength === undefined) throw new Error("Object size is unavailable.");
      return { size: object.ContentLength, contentType: object.ContentType ?? "application/octet-stream", etag: object.ETag };
    },
    async downloadUrl(Key, fileName) {
      assertKey(Key);
      // Authorization belongs to the scoped domain API before calling this adapter. Never store this expiring URL in files.file_url.
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key, ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16)}`)}` }), { expiresIn: config.S3_SIGNED_URL_SECONDS });
    },
    async delete(Key) { assertKey(Key); await client.send(new DeleteObjectCommand({ Bucket, Key }), { abortSignal: AbortSignal.timeout(10000) }); },
    close() { client.destroy(); },
  };
}

// Lazy opt-in: existing URL attachments do not create clients or call R2 on API startup.
export function configuredObjectStorage(input: Record<string, unknown> = process.env): ObjectStorage | null {
  const config = objectStorageConfigSchema.parse(input);
  return config.FILE_STORAGE_PROVIDER === "s3" ? createS3ObjectStorage(config) : null;
}
