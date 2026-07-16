"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { MAX_FILE_SIZE } from "@/lib/constants";
import {
  createObjectStorage,
  resolveSignedUrl,
  buildResolutionPdfPath,
  RESOLUTION_PDF_BUCKET,
} from "@/lib/infrastructure/storage";
import {
  mapResolutionRowToDocument,
  RESOLUTION_SELECT,
  type ResolutionRow,
} from "@/lib/supabase/resolution-mapper";
import { recordLGUActivity } from "@/lib/activity-log";
import { createClient } from "@/lib/supabase/server";
import { requireLGUSession } from "@/lib/supabase/require-lgu-user";
import type { LegislativeDocument } from "@/lib/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

async function createSignedPdfUrl(
  supabase: SupabaseServerClient,
  storagePath: string
): Promise<string> {
  return resolveSignedUrl(
    createObjectStorage(supabase),
    RESOLUTION_PDF_BUCKET,
    storagePath
  );
}

async function bumpDocumentCount(
  supabase: SupabaseServerClient,
  lguId: string,
  delta: 1 | -1
) {
  const { data: lgu } = await supabase
    .from("lgus")
    .select("document_count")
    .eq("id", lguId)
    .single();

  const current = lgu?.document_count ?? 0;
  const next = Math.max(0, current + delta);

  await supabase.from("lgus").update({ document_count: next }).eq("id", lguId);
}

export async function fetchResolutionsAction(): Promise<
  ActionResult<LegislativeDocument[]>
> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const { data, error: queryError } = await session.supabase
    .from("resolutions")
    .select(RESOLUTION_SELECT)
    .eq("lgu_id", session.lguId)
    .order("series_year", { ascending: false })
    .order("resolution_number", { ascending: true });

  if (queryError) {
    return { success: false, error: queryError.message };
  }

  const documents = ((data ?? []) as ResolutionRow[]).map((row) =>
    mapResolutionRowToDocument(row, "")
  );

  return { success: true, data: documents };
}

export async function fetchResolutionByIdAction(
  id: string
): Promise<ActionResult<LegislativeDocument>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const { data, error: queryError } = await session.supabase
    .from("resolutions")
    .select(RESOLUTION_SELECT)
    .eq("id", id)
    .eq("lgu_id", session.lguId)
    .single();

  if (queryError || !data) {
    return { success: false, error: "Resolution not found." };
  }

  const row = data as ResolutionRow;
  const pdfUrl = await createSignedPdfUrl(session.supabase, row.pdf_storage_path);

  return {
    success: true,
    data: mapResolutionRowToDocument(row, pdfUrl),
  };
}

export async function createResolutionAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const resolutionNumber = String(formData.get("resolutionNumber") ?? "").trim();
  const seriesYear = Number(formData.get("seriesYear"));
  const title = String(formData.get("title") ?? "").trim();
  const authorSponsor = String(formData.get("authorSponsor") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const pdfFile = formData.get("pdf");

  if (!title || !category || !seriesYear) {
    return { success: false, error: "Please fill in all required fields." };
  }

  if (!(pdfFile instanceof File) || pdfFile.size === 0) {
    return { success: false, error: "A PDF document is required." };
  }

  if (pdfFile.type !== "application/pdf") {
    return { success: false, error: "Only PDF files are accepted." };
  }

  if (pdfFile.size > MAX_FILE_SIZE) {
    return { success: false, error: "File size must be less than 25MB." };
  }

  const resolutionId = randomUUID();
  const storagePath = buildResolutionPdfPath(session.lguId, resolutionId);
  const storage = createObjectStorage(session.supabase);

  const { error: uploadError } = await storage.upload({
    bucket: RESOLUTION_PDF_BUCKET,
    key: storagePath,
    body: pdfFile,
    contentType: "application/pdf",
    upsert: false,
  });

  if (uploadError) {
    return { success: false, error: uploadError };
  }

  const { error: insertError } = await session.supabase.from("resolutions").insert({
    id: resolutionId,
    lgu_id: session.lguId,
    resolution_number: resolutionNumber,
    series_year: seriesYear,
    title,
    author_sponsor: authorSponsor,
    category,
    pdf_storage_path: storagePath,
    status: "published",
    is_public: true,
    created_by: session.userId,
  });

  if (insertError) {
    await storage.remove(RESOLUTION_PDF_BUCKET, [storagePath]);
    return { success: false, error: insertError.message };
  }

  await bumpDocumentCount(session.supabase, session.lguId, 1);

  await recordLGUActivity({
    session,
    action: "upload",
    module: "resolutions",
    entityId: resolutionId,
    entityTitle: title,
    details: `Uploaded resolution ${resolutionNumber || "—"} — ${title}`,
  });

  revalidatePath("/admin/resolutions");
  revalidatePath("/resolutions");
  return { success: true, data: { id: resolutionId } };
}

export async function updateResolutionAction(
  id: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const resolutionNumber = String(formData.get("resolutionNumber") ?? "").trim();
  const seriesYear = Number(formData.get("seriesYear"));
  const title = String(formData.get("title") ?? "").trim();
  const authorSponsor = String(formData.get("authorSponsor") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const pdfFile = formData.get("pdf");

  if (!title || !category || !seriesYear) {
    return { success: false, error: "Please fill in all required fields." };
  }

  const { data: existing, error: fetchError } = await session.supabase
    .from("resolutions")
    .select("id, pdf_storage_path")
    .eq("id", id)
    .eq("lgu_id", session.lguId)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: "Resolution not found." };
  }

  let storagePath = existing.pdf_storage_path as string;

  if (pdfFile instanceof File && pdfFile.size > 0) {
    if (pdfFile.type !== "application/pdf") {
      return { success: false, error: "Only PDF files are accepted." };
    }
    if (pdfFile.size > MAX_FILE_SIZE) {
      return { success: false, error: "File size must be less than 25MB." };
    }

    const { error: uploadError } = await createObjectStorage(
      session.supabase
    ).upload({
      bucket: RESOLUTION_PDF_BUCKET,
      key: storagePath,
      body: pdfFile,
      contentType: "application/pdf",
      upsert: true,
    });

    if (uploadError) {
      return { success: false, error: uploadError };
    }
  }

  const { error: updateError } = await session.supabase
    .from("resolutions")
    .update({
      resolution_number: resolutionNumber,
      series_year: seriesYear,
      title,
      author_sponsor: authorSponsor,
      category,
      pdf_storage_path: storagePath,
    })
    .eq("id", id)
    .eq("lgu_id", session.lguId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  await recordLGUActivity({
    session,
    action: "edit",
    module: "resolutions",
    entityId: id,
    entityTitle: title,
    details: `Updated resolution ${resolutionNumber || "—"} — ${title}`,
  });

  revalidatePath("/admin/resolutions");
  revalidatePath(`/admin/resolutions/${id}`);
  revalidatePath("/resolutions");
  revalidatePath(`/resolutions/${id}`);
  return { success: true, data: { id } };
}

export async function deleteResolutionAction(
  id: string
): Promise<ActionResult<null>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const { data: existing, error: fetchError } = await session.supabase
    .from("resolutions")
    .select("id, pdf_storage_path, title, resolution_number")
    .eq("id", id)
    .eq("lgu_id", session.lguId)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: "Resolution not found." };
  }

  const { error: deleteError } = await session.supabase
    .from("resolutions")
    .delete()
    .eq("id", id)
    .eq("lgu_id", session.lguId);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  await createObjectStorage(session.supabase).remove(RESOLUTION_PDF_BUCKET, [
    existing.pdf_storage_path as string,
  ]);

  await bumpDocumentCount(session.supabase, session.lguId, -1);

  await recordLGUActivity({
    session,
    action: "delete",
    module: "resolutions",
    entityId: id,
    entityTitle: existing.title as string,
    details: `Deleted resolution ${existing.resolution_number || "—"} — ${existing.title}`,
  });

  revalidatePath("/admin/resolutions");
  revalidatePath("/resolutions");
  return { success: true, data: null };
}

export async function toggleResolutionPublishAction(
  id: string
): Promise<ActionResult<LegislativeDocument>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const { data: existing, error: fetchError } = await session.supabase
    .from("resolutions")
    .select(RESOLUTION_SELECT)
    .eq("id", id)
    .eq("lgu_id", session.lguId)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: "Resolution not found." };
  }

  const row = existing as ResolutionRow;
  const isPublished = row.status === "published" && row.is_public;

  const { error: updateError } = await session.supabase
    .from("resolutions")
    .update({
      status: isPublished ? "draft" : "published",
      is_public: !isPublished,
    })
    .eq("id", id)
    .eq("lgu_id", session.lguId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  const updatedRow: ResolutionRow = {
    ...row,
    status: isPublished ? "draft" : "published",
    is_public: !isPublished,
  };
  const pdfUrl = await createSignedPdfUrl(
    session.supabase,
    updatedRow.pdf_storage_path
  );

  await recordLGUActivity({
    session,
    action: isPublished ? "edit" : "publish",
    module: "resolutions",
    entityId: id,
    entityTitle: row.title,
    details: isPublished
      ? `Unpublished resolution ${row.resolution_number || "—"} from public portal`
      : `Published resolution ${row.resolution_number || "—"} to public portal`,
  });

  revalidatePath("/admin/resolutions");
  revalidatePath(`/admin/resolutions/${id}`);
  revalidatePath("/resolutions");
  revalidatePath(`/resolutions/${id}`);

  return {
    success: true,
    data: mapResolutionRowToDocument(updatedRow, pdfUrl),
  };
}
