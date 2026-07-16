import type { ObjectStorage, StorageBody } from "./types";

/**
 * Structural client shape for Supabase JS storage.
 * `from()` is typed loosely so cookie SSR + service-role clients both assign.
 */
export type SupabaseStorageClient = {
  storage: {
    // Supabase Client generics are too narrow for a portable port; runtime is identical.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (bucket: string) => any;
  };
};

export function createSupabaseObjectStorage(
  client: SupabaseStorageClient
): ObjectStorage {
  return {
    async upload({ bucket, key, body, contentType, upsert = false }) {
      const { error } = await client.storage.from(bucket).upload(key, body as StorageBody, {
        contentType,
        upsert,
      });
      return { error: error?.message ?? null };
    },

    async remove(bucket, keys) {
      if (keys.length === 0) return { error: null };
      const { error } = await client.storage.from(bucket).remove(keys);
      return { error: error?.message ?? null };
    },

    async createSignedUrl({
      bucket,
      key,
      expiresInSeconds,
      downloadFileName,
    }) {
      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUrl(
          key,
          expiresInSeconds,
          downloadFileName ? { download: downloadFileName } : undefined
        );

      if (error || !data?.signedUrl) {
        return { url: null, error: error?.message ?? "Failed to sign URL." };
      }

      return { url: data.signedUrl as string, error: null };
    },

    async createSignedUrls({ bucket, keys, expiresInSeconds }) {
      const urls = new Map<string, string>();
      if (keys.length === 0) return { urls, error: null };

      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUrls(keys, expiresInSeconds);

      for (const item of data ?? []) {
        if (item.path && item.signedUrl) {
          urls.set(item.path as string, item.signedUrl as string);
        }
      }

      return {
        urls,
        error: error?.message ?? null,
      };
    },
  };
}
