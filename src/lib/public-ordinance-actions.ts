"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { CATEGORY_SELECT, mapCategoryRowToCategory } from "@/lib/supabase/category-mapper";
import { toPlaceStorageKey } from "@/lib/supabase/lgu-mapper";
import {
  createAdminObjectStorage,
  resolveSignedUrl,
  ORDINANCE_PDF_BUCKET,
} from "@/lib/infrastructure/storage";
import {
  mapOrdinanceRowToDocument,
  ORDINANCE_SELECT,
  type OrdinanceRow,
} from "@/lib/supabase/ordinance-mapper";
import type { Category, LegislativeDocument } from "@/lib/types";

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
    ORDINANCE_PDF_BUCKET,
    storagePath
  );
}

export async function fetchPublicOrdinancesAction(
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
      .from("ordinances")
      .select(ORDINANCE_SELECT)
      .eq("lgu_id", lguId)
      .eq("is_public", true)
      .eq("status", "published")
      .order("series_year", { ascending: false })
      .order("ordinance_number", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    const documents = ((data ?? []) as OrdinanceRow[]).map((row) =>
      mapOrdinanceRowToDocument(row, "")
    );

    return { success: true, data: documents };
  } catch {
    return { success: false, error: "Failed to load ordinances." };
  }
}

export async function fetchPublicOrdinanceByIdAction(
  id: string,
  province: string,
  municipality: string
): Promise<PublicActionResult<LegislativeDocument>> {
  try {
    const lguId = await resolveLguId(province, municipality);
    if (!lguId) {
      return { success: false, error: "Ordinance not found." };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("ordinances")
      .select(ORDINANCE_SELECT)
      .eq("id", id)
      .eq("lgu_id", lguId)
      .eq("is_public", true)
      .eq("status", "published")
      .maybeSingle();

    if (error || !data) {
      return { success: false, error: "Ordinance not found." };
    }

    const row = data as OrdinanceRow;
    const pdfUrl = await createSignedPdfUrl(row.pdf_storage_path);

    return {
      success: true,
      data: mapOrdinanceRowToDocument(row, pdfUrl),
    };
  } catch {
    return { success: false, error: "Failed to load ordinance." };
  }
}

export async function fetchPublicOrdinanceCategoriesAction(
  province: string,
  municipality: string
): Promise<PublicActionResult<Category[]>> {
  try {
    const lguId = await resolveLguId(province, municipality);
    if (!lguId) {
      return { success: true, data: [] };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("document_categories")
      .select(CATEGORY_SELECT)
      .eq("lgu_id", lguId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: (data ?? []).map(mapCategoryRowToCategory),
    };
  } catch {
    return { success: false, error: "Failed to load categories." };
  }
}
