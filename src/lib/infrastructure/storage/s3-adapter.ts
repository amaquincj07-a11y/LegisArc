import type { ObjectStorage } from "./types";

/**
 * DigitalOcean Spaces / S3-compatible adapter (migration target).
 *
 * Not active until STORAGE_PROVIDER=spaces|s3 and AWS/Spaces env vars are set.
 * Implement with @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner when migrating:
 * - PutObject / DeleteObject / getSignedUrl(GetObjectCommand)
 * - Map logical buckets to prefixes if using a single Spaces bucket
 *
 * Env (planned):
 *   STORAGE_PROVIDER=spaces
 *   S3_ENDPOINT=https://sgp1.digitaloceanspaces.com
 *   S3_REGION=sgp1
 *   S3_BUCKET=legisarc-documents
 *   S3_ACCESS_KEY_ID=...
 *   S3_SECRET_ACCESS_KEY=...
 *   S3_FORCE_PATH_STYLE=false
 */

function missingSpacesConfigError(): string {
  return [
    "STORAGE_PROVIDER is set to spaces/s3, but the S3 adapter is not configured yet.",
    "Keep STORAGE_PROVIDER=supabase (or unset) until you implement Spaces credentials",
    "and finish createS3ObjectStorage() with the AWS SDK.",
  ].join(" ");
}

export function createS3ObjectStorage(): ObjectStorage {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKey = process.env.S3_ACCESS_KEY_ID;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    const message = missingSpacesConfigError();
    return {
      async upload() {
        return { error: message };
      },
      async remove() {
        return { error: message };
      },
      async createSignedUrl() {
        return { url: null, error: message };
      },
      async createSignedUrls() {
        return { urls: new Map(), error: message };
      },
    };
  }

  // Credentials present but SDK wiring not shipped yet — fail loudly so
  // misconfiguration is obvious during a future cutover test.
  const message =
    "S3/Spaces credentials are set, but createS3ObjectStorage() still needs the AWS SDK implementation. See src/lib/infrastructure/storage/s3-adapter.ts.";

  return {
    async upload() {
      return { error: message };
    },
    async remove() {
      return { error: message };
    },
    async createSignedUrl() {
      return { url: null, error: message };
    },
    async createSignedUrls() {
      return { urls: new Map(), error: message };
    },
  };
}
