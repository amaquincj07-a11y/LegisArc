import { createAdminClient } from "@/lib/supabase/admin";
import { SIGNED_URL_TTL_SECONDS } from "./constants";
import { createS3ObjectStorage } from "./s3-adapter";
import {
  createSupabaseObjectStorage,
  type SupabaseStorageClient,
} from "./supabase-adapter";
import type { ObjectStorage, StorageProvider } from "./types";

export type {
  ObjectStorage,
  StorageBody,
  StorageProvider,
  StorageResult,
  SignedUrlResult,
  SignedUrlsResult,
} from "./types";

export {
  SIGNED_URL_TTL_SECONDS,
  ORDINANCE_PDF_BUCKET,
  RESOLUTION_PDF_BUCKET,
  MINUTES_PDF_BUCKET,
  SB_MEMBER_PHOTO_BUCKET,
  buildOrdinancePdfPath,
  buildResolutionPdfPath,
  buildMinutesPdfPath,
  buildSBMemberPhotoPath,
  getDocumentPdfBucket,
} from "./constants";

function resolveStorageProvider(): StorageProvider {
  const raw = (process.env.STORAGE_PROVIDER ?? "supabase").toLowerCase();
  if (raw === "spaces" || raw === "s3") return raw;
  return "supabase";
}

/**
 * Build an ObjectStorage for the active provider.
 * Supabase adapter needs the request-scoped (or admin) client for RLS/auth.
 * Spaces/S3 uses env credentials and ignores the Supabase client.
 */
export function createObjectStorage(
  supabaseClient?: SupabaseStorageClient
): ObjectStorage {
  const provider = resolveStorageProvider();

  if (provider === "spaces" || provider === "s3") {
    return createS3ObjectStorage();
  }

  if (!supabaseClient) {
    throw new Error(
      "createObjectStorage() requires a Supabase client when STORAGE_PROVIDER=supabase."
    );
  }

  return createSupabaseObjectStorage(supabaseClient);
}

/** Service-role storage (public portal downloads, bypasses storage RLS). */
export function createAdminObjectStorage(): ObjectStorage {
  return createObjectStorage(createAdminClient());
}

/** Convenience: signed view URL or empty string on failure. */
export async function resolveSignedUrl(
  storage: ObjectStorage,
  bucket: string,
  key: string | null | undefined,
  fallback = ""
): Promise<string> {
  if (!key) return fallback;

  const { url } = await storage.createSignedUrl({
    bucket,
    key,
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
  });

  return url ?? fallback;
}
