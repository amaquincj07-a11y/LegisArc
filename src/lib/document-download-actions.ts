"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DOCUMENT_DOWNLOAD_SELECT,
  mapDocumentDownloadRowToRecord,
  type DocumentDownloadRow,
} from "@/lib/supabase/document-download-mapper";
import { toPlaceStorageKey } from "@/lib/supabase/lgu-mapper";
import {
  createAdminObjectStorage,
  getDocumentPdfBucket,
  SIGNED_URL_TTL_SECONDS,
} from "@/lib/infrastructure/storage";
import { requireLGUSession } from "@/lib/supabase/require-lgu-user";
import type { DocumentDownloadRecord, DocumentType, PublicDocumentDownloadContext } from "@/lib/types";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function getDocumentTable(documentType: DocumentType) {
  if (documentType === "ordinance") return "ordinances";
  if (documentType === "resolution") return "resolutions";
  return "session_minutes";
}

function sanitizeDownloadFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned || "document";
}

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

export async function recordPublicDocumentDownloadAction(input: {
  context: PublicDocumentDownloadContext;
  requesterName?: string;
  officeOrg: string;
  purpose: string;
  consentAgreed: boolean;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const { context, requesterName, officeOrg, purpose, consentAgreed } = input;

    if (!consentAgreed) {
      return {
        success: false,
        error: "You must agree to the Privacy Notice and Terms of Use.",
      };
    }

    const trimmedOffice = officeOrg.trim();
    const trimmedPurpose = purpose.trim();

    if (!trimmedOffice) {
      return {
        success: false,
        error: "Office / Organization / Establishment is required.",
      };
    }

    if (!trimmedPurpose) {
      return { success: false, error: "Purpose is required." };
    }

    const lguId = await resolveLguId(context.province, context.municipality);
    if (!lguId) {
      return { success: false, error: "Unable to verify the selected LGU." };
    }

    const supabase = createAdminClient();
    const table = getDocumentTable(context.documentType);

    const { data: documentRow, error: documentError } = await supabase
      .from(table)
      .select("id")
      .eq("id", context.documentId)
      .eq("lgu_id", lguId)
      .eq("is_public", true)
      .eq("status", "published")
      .maybeSingle();

    if (documentError || !documentRow) {
      return { success: false, error: "Document not found or not published." };
    }

    const id = randomUUID();

    const { error } = await supabase.from("document_download_logs").insert({
      id,
      lgu_id: lguId,
      document_id: context.documentId,
      document_type: context.documentType,
      document_number: context.documentNumber?.trim() || null,
      document_title: context.documentTitle,
      document_category: context.documentCategory?.trim() || null,
      requester_name: requesterName?.trim() || null,
      office_org: trimmedOffice,
      purpose: trimmedPurpose,
      consent_agreed: true,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    try {
      revalidatePath("/admin/requests");
    } catch {
      /* static export */
    }

    return { success: true, data: { id } };
  } catch {
    return { success: false, error: "Failed to record document download." };
  }
}

export async function getPublicDocumentDownloadUrlAction(
  context: PublicDocumentDownloadContext,
  downloadFileName?: string
): Promise<ActionResult<{ url: string; fileName: string }>> {
  try {
    const lguId = await resolveLguId(context.province, context.municipality);
    if (!lguId) {
      return { success: false, error: "Unable to verify the selected LGU." };
    }

    const supabase = createAdminClient();
    const table = getDocumentTable(context.documentType);
    const bucket = getDocumentPdfBucket(context.documentType);

    const { data: documentRow, error: documentError } = await supabase
      .from(table)
      .select("id, pdf_storage_path")
      .eq("id", context.documentId)
      .eq("lgu_id", lguId)
      .eq("is_public", true)
      .eq("status", "published")
      .maybeSingle();

    if (documentError || !documentRow?.pdf_storage_path) {
      return { success: false, error: "Document not found or not published." };
    }

    const fileName = `${sanitizeDownloadFileName(
      downloadFileName || context.documentTitle || "document"
    )}.pdf`;

    const { url, error } = await createAdminObjectStorage().createSignedUrl({
      bucket,
      key: documentRow.pdf_storage_path as string,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      downloadFileName: fileName,
    });

    if (error || !url) {
      return { success: false, error: "Failed to prepare document download." };
    }

    return { success: true, data: { url, fileName } };
  } catch {
    return { success: false, error: "Failed to prepare document download." };
  }
}

export async function fetchDocumentDownloadLogsAction(): Promise<
  ActionResult<DocumentDownloadRecord[]>
> {
  try {
    const { session, error } = await requireLGUSession();
    if (error || !session) return { success: false, error: error! };

    const { data, error: queryError } = await session.supabase
      .from("document_download_logs")
      .select(DOCUMENT_DOWNLOAD_SELECT)
      .eq("lgu_id", session.lguId)
      .order("created_at", { ascending: false });

    if (queryError) {
      return { success: false, error: queryError.message };
    }

    return {
      success: true,
      data: ((data ?? []) as DocumentDownloadRow[]).map(
        mapDocumentDownloadRowToRecord
      ),
    };
  } catch {
    return { success: false, error: "Failed to load document requests." };
  }
}
