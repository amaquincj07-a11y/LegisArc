"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { toPlaceStorageKey } from "@/lib/supabase/lgu-mapper";
import {
  createAdminObjectStorage,
  resolveSignedUrl,
  RESOLUTION_PDF_BUCKET,
} from "@/lib/infrastructure/storage";
import {
  mapResolutionRowToDocument,
  RESOLUTION_SELECT,
  type ResolutionRow,
} from "@/lib/supabase/resolution-mapper";
import type { LegislativeDocument } from "@/lib/types";

export type PublicActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

async function resolveLguId(
  province: string,
  municipality: string
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("lgus")
    .select("id")
    .eq("province", toPlaceStorageKey(province))
    .eq("municipality", toPlaceStorageKey(municipality))
    .maybeSingle();

  if (error || !data) return null;
  return data.id as string;
}

async function createSignedPdfUrl(storagePath: string): Promise<string> {
  return resolveSignedUrl(
    createAdminObjectStorage(),
    RESOLUTION_PDF_BUCKET,
    storagePath
  );
}

export async function fetchPublicResolutionsAction(
  province: string,
  municipality: string
): Promise<PublicActionResult<LegislativeDocument[]>> {
  try {
    const lguId = await resolveLguId(province, municipality);
    if (!lguId) {
      return { success: true, data: [] };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("resolutions")
      .select(RESOLUTION_SELECT)
      .eq("lgu_id", lguId)
      .eq("is_public", true)
      .eq("status", "published")
      .order("series_year", { ascending: false })
      .order("resolution_number", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    const documents = ((data ?? []) as ResolutionRow[]).map((row) =>
      mapResolutionRowToDocument(row, "")
    );

    return { success: true, data: documents };
  } catch {
    return { success: false, error: "Failed to load resolutions." };
  }
}

export async function fetchPublicResolutionByIdAction(
  id: string,
  province: string,
  municipality: string
): Promise<PublicActionResult<LegislativeDocument>> {
  try {
    const lguId = await resolveLguId(province, municipality);
    if (!lguId) {
      return { success: false, error: "Resolution not found." };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("resolutions")
      .select(RESOLUTION_SELECT)
      .eq("id", id)
      .eq("lgu_id", lguId)
      .eq("is_public", true)
      .eq("status", "published")
      .maybeSingle();

    if (error || !data) {
      return { success: false, error: "Resolution not found." };
    }

    const row = data as ResolutionRow;
    const pdfUrl = await createSignedPdfUrl(row.pdf_storage_path);

    return {
      success: true,
      data: mapResolutionRowToDocument(row, pdfUrl),
    };
  } catch {
    return { success: false, error: "Failed to load resolution." };
  }
}
