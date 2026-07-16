"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { MAX_FILE_SIZE } from "@/lib/constants";
import {
  createObjectStorage,
  resolveSignedUrl,
  buildMinutesPdfPath,
  MINUTES_PDF_BUCKET,
} from "@/lib/infrastructure/storage";
import {
  mapSessionMinutesRowToDocument,
  SESSION_MINUTES_SELECT,
  type SessionMinutesRow,
} from "@/lib/supabase/session-minutes-mapper";
import { recordLGUActivity } from "@/lib/activity-log";
import { createClient } from "@/lib/supabase/server";
import { requireLGUSession } from "@/lib/supabase/require-lgu-user";
import type { SessionMinutes, SessionType } from "@/lib/types";

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
    MINUTES_PDF_BUCKET,
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

export async function fetchSessionMinutesAction(): Promise<
  ActionResult<SessionMinutes[]>
> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const { data, error: queryError } = await session.supabase
    .from("session_minutes")
    .select(SESSION_MINUTES_SELECT)
    .eq("lgu_id", session.lguId)
    .order("session_date", { ascending: false });

  if (queryError) {
    return { success: false, error: queryError.message };
  }

  const documents = ((data ?? []) as SessionMinutesRow[]).map((row) =>
    mapSessionMinutesRowToDocument(row, "")
  );

  return { success: true, data: documents };
}

export async function fetchSessionMinutesByIdAction(
  id: string
): Promise<ActionResult<SessionMinutes>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const { data, error: queryError } = await session.supabase
    .from("session_minutes")
    .select(SESSION_MINUTES_SELECT)
    .eq("id", id)
    .eq("lgu_id", session.lguId)
    .single();

  if (queryError || !data) {
    return { success: false, error: "Session minutes not found." };
  }

  const row = data as SessionMinutesRow;
  const pdfUrl = await createSignedPdfUrl(session.supabase, row.pdf_storage_path);

  return {
    success: true,
    data: mapSessionMinutesRowToDocument(row, pdfUrl),
  };
}

export async function createSessionMinutesAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const sessionDate = String(formData.get("sessionDate") ?? "").trim();
  const sessionType = String(formData.get("sessionType") ?? "regular").trim() as SessionType;
  const pdfFile = formData.get("pdf");

  if (!sessionDate) {
    return { success: false, error: "Session date is required." };
  }

  if (sessionType !== "regular" && sessionType !== "special") {
    return { success: false, error: "Invalid session type." };
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

  const minutesId = randomUUID();
  const storagePath = buildMinutesPdfPath(session.lguId, minutesId);
  const storage = createObjectStorage(session.supabase);

  const { error: uploadError } = await storage.upload({
    bucket: MINUTES_PDF_BUCKET,
    key: storagePath,
    body: pdfFile,
    contentType: "application/pdf",
    upsert: false,
  });

  if (uploadError) {
    return { success: false, error: uploadError };
  }

  const { error: insertError } = await session.supabase
    .from("session_minutes")
    .insert({
      id: minutesId,
      lgu_id: session.lguId,
      session_date: sessionDate,
      session_type: sessionType,
      pdf_storage_path: storagePath,
      status: "published",
      is_public: true,
      created_by: session.userId,
    });

  if (insertError) {
    await storage.remove(MINUTES_PDF_BUCKET, [storagePath]);
    return { success: false, error: insertError.message };
  }

  await bumpDocumentCount(session.supabase, session.lguId, 1);

  const minutesTitle = `Minutes — ${sessionDate}`;
  await recordLGUActivity({
    session,
    action: "upload",
    module: "minutes",
    entityId: minutesId,
    entityTitle: minutesTitle,
    details: `Uploaded session minutes for ${sessionDate} (${sessionType})`,
  });

  revalidatePath("/admin/minutes");
  revalidatePath("/minutes");
  return { success: true, data: { id: minutesId } };
}

export async function updateSessionMinutesAction(
  id: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const sessionDate = String(formData.get("sessionDate") ?? "").trim();
  const sessionType = String(formData.get("sessionType") ?? "regular").trim() as SessionType;
  const pdfFile = formData.get("pdf");

  if (!sessionDate) {
    return { success: false, error: "Session date is required." };
  }

  if (sessionType !== "regular" && sessionType !== "special") {
    return { success: false, error: "Invalid session type." };
  }

  const { data: existing, error: fetchError } = await session.supabase
    .from("session_minutes")
    .select("id, pdf_storage_path")
    .eq("id", id)
    .eq("lgu_id", session.lguId)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: "Session minutes not found." };
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
      bucket: MINUTES_PDF_BUCKET,
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
    .from("session_minutes")
    .update({
      session_date: sessionDate,
      session_type: sessionType,
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
    module: "minutes",
    entityId: id,
    entityTitle: `Minutes — ${sessionDate}`,
    details: `Updated session minutes for ${sessionDate} (${sessionType})`,
  });

  revalidatePath("/admin/minutes");
  revalidatePath(`/admin/minutes/${id}`);
  revalidatePath("/minutes");
  revalidatePath(`/minutes/${id}`);
  return { success: true, data: { id } };
}

export async function deleteSessionMinutesAction(
  id: string
): Promise<ActionResult<null>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const { data: existing, error: fetchError } = await session.supabase
    .from("session_minutes")
    .select("id, pdf_storage_path, session_date, session_type")
    .eq("id", id)
    .eq("lgu_id", session.lguId)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: "Session minutes not found." };
  }

  const { error: deleteError } = await session.supabase
    .from("session_minutes")
    .delete()
    .eq("id", id)
    .eq("lgu_id", session.lguId);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  await createObjectStorage(session.supabase).remove(MINUTES_PDF_BUCKET, [
    existing.pdf_storage_path as string,
  ]);

  await bumpDocumentCount(session.supabase, session.lguId, -1);

  await recordLGUActivity({
    session,
    action: "delete",
    module: "minutes",
    entityId: id,
    entityTitle: `Minutes — ${existing.session_date}`,
    details: `Deleted session minutes for ${existing.session_date} (${existing.session_type})`,
  });

  revalidatePath("/admin/minutes");
  revalidatePath("/minutes");
  return { success: true, data: null };
}

export async function toggleSessionMinutesPublishAction(
  id: string
): Promise<ActionResult<SessionMinutes>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const { data: existing, error: fetchError } = await session.supabase
    .from("session_minutes")
    .select(SESSION_MINUTES_SELECT)
    .eq("id", id)
    .eq("lgu_id", session.lguId)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: "Session minutes not found." };
  }

  const row = existing as SessionMinutesRow;
  const isPublished = row.status === "published" && row.is_public;

  const { error: updateError } = await session.supabase
    .from("session_minutes")
    .update({
      status: isPublished ? "draft" : "published",
      is_public: !isPublished,
    })
    .eq("id", id)
    .eq("lgu_id", session.lguId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  const updatedRow: SessionMinutesRow = {
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
    module: "minutes",
    entityId: id,
    entityTitle: `Minutes — ${row.session_date}`,
    details: isPublished
      ? `Unpublished session minutes for ${row.session_date} from public portal`
      : `Published session minutes for ${row.session_date} to public portal`,
  });

  revalidatePath("/admin/minutes");
  revalidatePath(`/admin/minutes/${id}`);
  revalidatePath("/minutes");
  revalidatePath(`/minutes/${id}`);

  return {
    success: true,
    data: mapSessionMinutesRowToDocument(updatedRow, pdfUrl),
  };
}
