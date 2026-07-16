"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { APPROPRIATION_ORDINANCE_CATEGORY, MAX_FILE_SIZE } from "@/lib/constants";
import type { OrdinanceKind } from "@/lib/types";
import {
  createObjectStorage,
  resolveSignedUrl,
  buildOrdinancePdfPath,
  ORDINANCE_PDF_BUCKET,
} from "@/lib/infrastructure/storage";
import {
  mapOrdinanceRowToDocument,
  ORDINANCE_SELECT,
  type OrdinanceRow,
} from "@/lib/supabase/ordinance-mapper";
import { recordLGUActivity } from "@/lib/activity-log";
import { createClient } from "@/lib/supabase/server";
import { requireLGUSession } from "@/lib/supabase/require-lgu-user";
import type { LegislativeDocument } from "@/lib/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function parseOrdinanceKind(
  category: string,
  rawKind: FormDataEntryValue | null
): OrdinanceKind {
  if (category !== APPROPRIATION_ORDINANCE_CATEGORY) {
    return "municipal";
  }
  return rawKind === "appropriation" ? "appropriation" : "municipal";
}

async function createSignedPdfUrl(
  supabase: SupabaseServerClient,
  storagePath: string
): Promise<string> {
  return resolveSignedUrl(
    createObjectStorage(supabase),
    ORDINANCE_PDF_BUCKET,
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

export async function fetchOrdinancesAction(): Promise<
  ActionResult<LegislativeDocument[]>
> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const { data, error: queryError } = await session.supabase
    .from("ordinances")
    .select(ORDINANCE_SELECT)
    .eq("lgu_id", session.lguId)
    .order("series_year", { ascending: false })
    .order("ordinance_number", { ascending: true });

  if (queryError) {
    return { success: false, error: queryError.message };
  }

  const documents = ((data ?? []) as OrdinanceRow[]).map((row) =>
    mapOrdinanceRowToDocument(row, "")
  );

  return { success: true, data: documents };
}

export async function fetchOrdinanceByIdAction(
  id: string
): Promise<ActionResult<LegislativeDocument>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const { data, error: queryError } = await session.supabase
    .from("ordinances")
    .select(ORDINANCE_SELECT)
    .eq("id", id)
    .eq("lgu_id", session.lguId)
    .single();

  if (queryError || !data) {
    return { success: false, error: "Ordinance not found." };
  }

  const row = data as OrdinanceRow;
  const pdfUrl = await createSignedPdfUrl(session.supabase, row.pdf_storage_path);

  return {
    success: true,
    data: mapOrdinanceRowToDocument(row, pdfUrl),
  };
}

export async function createOrdinanceAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const ordinanceNumber = String(formData.get("ordinanceNumber") ?? "").trim();
  const seriesYear = Number(formData.get("seriesYear"));
  const title = String(formData.get("title") ?? "").trim();
  const authorSponsor = String(formData.get("authorSponsor") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const ordinanceKind = parseOrdinanceKind(
    category,
    formData.get("ordinanceKind")
  );
  const pdfFile = formData.get("pdf");

  if (!ordinanceNumber || !title || !category || !seriesYear) {
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

  const ordinanceId = randomUUID();
  const storagePath = buildOrdinancePdfPath(session.lguId, ordinanceId);
  const storage = createObjectStorage(session.supabase);

  const { error: uploadError } = await storage.upload({
    bucket: ORDINANCE_PDF_BUCKET,
    key: storagePath,
    body: pdfFile,
    contentType: "application/pdf",
    upsert: false,
  });

  if (uploadError) {
    return { success: false, error: uploadError };
  }

  const { error: insertError } = await session.supabase.from("ordinances").insert({
    id: ordinanceId,
    lgu_id: session.lguId,
    ordinance_number: ordinanceNumber,
    series_year: seriesYear,
    title,
    author_sponsor: authorSponsor,
    category,
    ordinance_kind: ordinanceKind,
    pdf_storage_path: storagePath,
    status: "published",
    is_public: true,
    created_by: session.userId,
  });

  if (insertError) {
    await storage.remove(ORDINANCE_PDF_BUCKET, [storagePath]);
    return { success: false, error: insertError.message };
  }

  await bumpDocumentCount(session.supabase, session.lguId, 1);

  await recordLGUActivity({
    session,
    action: "upload",
    module: "ordinances",
    entityId: ordinanceId,
    entityTitle: title,
    details: `Uploaded ordinance ${ordinanceNumber} — ${title}`,
  });

  revalidatePath("/admin/ordinances");
  revalidatePath("/ordinances");
  return { success: true, data: { id: ordinanceId } };
}

export async function updateOrdinanceAction(
  id: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const ordinanceNumber = String(formData.get("ordinanceNumber") ?? "").trim();
  const seriesYear = Number(formData.get("seriesYear"));
  const title = String(formData.get("title") ?? "").trim();
  const authorSponsor = String(formData.get("authorSponsor") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const ordinanceKind = parseOrdinanceKind(
    category,
    formData.get("ordinanceKind")
  );
  const pdfFile = formData.get("pdf");

  if (!ordinanceNumber || !title || !category || !seriesYear) {
    return { success: false, error: "Please fill in all required fields." };
  }

  const { data: existing, error: fetchError } = await session.supabase
    .from("ordinances")
    .select("id, pdf_storage_path")
    .eq("id", id)
    .eq("lgu_id", session.lguId)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: "Ordinance not found." };
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
      bucket: ORDINANCE_PDF_BUCKET,
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
    .from("ordinances")
    .update({
      ordinance_number: ordinanceNumber,
      series_year: seriesYear,
      title,
      author_sponsor: authorSponsor,
      category,
      ordinance_kind: ordinanceKind,
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
    module: "ordinances",
    entityId: id,
    entityTitle: title,
    details: `Updated ordinance ${ordinanceNumber} — ${title}`,
  });

  revalidatePath("/admin/ordinances");
  revalidatePath(`/admin/ordinances/${id}`);
  revalidatePath("/ordinances");
  revalidatePath(`/ordinances/${id}`);
  return { success: true, data: { id } };
}

export async function deleteOrdinanceAction(
  id: string
): Promise<ActionResult<null>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const { data: existing, error: fetchError } = await session.supabase
    .from("ordinances")
    .select("id, pdf_storage_path, title, ordinance_number")
    .eq("id", id)
    .eq("lgu_id", session.lguId)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: "Ordinance not found." };
  }

  const { error: deleteError } = await session.supabase
    .from("ordinances")
    .delete()
    .eq("id", id)
    .eq("lgu_id", session.lguId);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  await createObjectStorage(session.supabase).remove(ORDINANCE_PDF_BUCKET, [
    existing.pdf_storage_path as string,
  ]);

  await bumpDocumentCount(session.supabase, session.lguId, -1);

  await recordLGUActivity({
    session,
    action: "delete",
    module: "ordinances",
    entityId: id,
    entityTitle: existing.title as string,
    details: `Deleted ordinance ${existing.ordinance_number} — ${existing.title}`,
  });

  revalidatePath("/admin/ordinances");
  revalidatePath("/ordinances");
  return { success: true, data: null };
}

export async function toggleOrdinancePublishAction(
  id: string
): Promise<ActionResult<LegislativeDocument>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const { data: existing, error: fetchError } = await session.supabase
    .from("ordinances")
    .select(ORDINANCE_SELECT)
    .eq("id", id)
    .eq("lgu_id", session.lguId)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: "Ordinance not found." };
  }

  const row = existing as OrdinanceRow;
  const isPublished = row.status === "published" && row.is_public;

  const { error: updateError } = await session.supabase
    .from("ordinances")
    .update({
      status: isPublished ? "draft" : "published",
      is_public: !isPublished,
    })
    .eq("id", id)
    .eq("lgu_id", session.lguId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  const updatedRow: OrdinanceRow = {
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
    module: "ordinances",
    entityId: id,
    entityTitle: row.title,
    details: isPublished
      ? `Unpublished ordinance ${row.ordinance_number} from public portal`
      : `Published ordinance ${row.ordinance_number} to public portal`,
  });

  revalidatePath("/admin/ordinances");
  revalidatePath(`/admin/ordinances/${id}`);
  revalidatePath("/ordinances");
  revalidatePath(`/ordinances/${id}`);

  return {
    success: true,
    data: mapOrdinanceRowToDocument(updatedRow, pdfUrl),
  };
}
