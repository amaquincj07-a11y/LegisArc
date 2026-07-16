/**
 * Vendor-neutral object storage port.
 *
 * Today: Supabase Storage (via supabase-adapter).
 * Later: DigitalOcean Spaces / any S3-compatible store (via s3-adapter).
 *
 * Always persist `key` (path) in Postgres — never vendor permanent URLs.
 */

export type StorageBody = File | Blob | ArrayBuffer | Buffer | Uint8Array;

export type StorageResult = {
  error: string | null;
};

export type SignedUrlResult = {
  url: string | null;
  error: string | null;
};

export type SignedUrlsResult = {
  urls: Map<string, string>;
  error: string | null;
};

export interface ObjectStorage {
  upload(input: {
    bucket: string;
    key: string;
    body: StorageBody;
    contentType: string;
    upsert?: boolean;
  }): Promise<StorageResult>;

  remove(bucket: string, keys: string[]): Promise<StorageResult>;

  createSignedUrl(input: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
    /** When set, response forces Content-Disposition: attachment */
    downloadFileName?: string;
  }): Promise<SignedUrlResult>;

  createSignedUrls(input: {
    bucket: string;
    keys: string[];
    expiresInSeconds: number;
  }): Promise<SignedUrlsResult>;
}

export type StorageProvider = "supabase" | "spaces" | "s3";
