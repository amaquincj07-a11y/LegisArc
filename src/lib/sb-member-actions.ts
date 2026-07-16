"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { SB_MEMBER_POSITION_SLOTS } from "@/lib/constants";
import {
  createObjectStorage,
  resolveSignedUrl,
  SIGNED_URL_TTL_SECONDS,
  SB_MEMBER_PHOTO_BUCKET,
  buildSBMemberPhotoPath,
} from "@/lib/infrastructure/storage";
import {
  getImageExtension,
  getPositionLabelForSlot,
  mapSBMemberRowToMember,
  SB_MEMBER_PLACEHOLDER_IMAGE,
  SB_MEMBER_SELECT,
  validateMemberImage,
  type SBMemberRow,
} from "@/lib/supabase/sb-member-mapper";
import { recordLGUActivity } from "@/lib/activity-log";
import { createClient } from "@/lib/supabase/server";
import { requireLGUSession } from "@/lib/supabase/require-lgu-user";
import type { SBMember, SBMemberPositionSlot } from "@/lib/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const VALID_SLOTS = new Set(
  SB_MEMBER_POSITION_SLOTS.map((entry) => entry.slot)
);

async function createSignedImageUrl(
  supabase: SupabaseServerClient,
  storagePath: string
): Promise<string> {
  return resolveSignedUrl(
    createObjectStorage(supabase),
    SB_MEMBER_PHOTO_BUCKET,
    storagePath,
    SB_MEMBER_PLACEHOLDER_IMAGE
  );
}

async function mapRowsWithSignedUrls(
  supabase: SupabaseServerClient,
  rows: SBMemberRow[]
): Promise<SBMember[]> {
  const pathsToSign = [
    ...new Set(
      rows
        .map((row) => row.image_storage_path)
        .filter((path): path is string => Boolean(path))
    ),
  ];

  const signedUrlByPath = new Map<string, string>();

  if (pathsToSign.length > 0) {
    const { urls } = await createObjectStorage(supabase).createSignedUrls({
      bucket: SB_MEMBER_PHOTO_BUCKET,
      keys: pathsToSign,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    });
    for (const [path, url] of urls) {
      signedUrlByPath.set(path, url);
    }
  }

  return rows.map((row) => {
    const imageUrl = row.image_storage_path
      ? signedUrlByPath.get(row.image_storage_path) ?? SB_MEMBER_PLACEHOLDER_IMAGE
      : SB_MEMBER_PLACEHOLDER_IMAGE;
    return mapSBMemberRowToMember(row, imageUrl);
  });
}

function parsePositionSlot(value: FormDataEntryValue | null): SBMemberPositionSlot | null {
  const slot = String(value ?? "").trim();
  if (!VALID_SLOTS.has(slot as SBMemberPositionSlot)) {
    return null;
  }
  return slot as SBMemberPositionSlot;
}

export async function fetchSBMembersAction(): Promise<ActionResult<SBMember[]>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const { data, error: queryError } = await session.supabase
    .from("sb_members")
    .select(SB_MEMBER_SELECT)
    .eq("lgu_id", session.lguId)
    .order("created_at", { ascending: true });

  if (queryError) {
    return { success: false, error: queryError.message };
  }

  const members = await mapRowsWithSignedUrls(
    session.supabase,
    (data ?? []) as SBMemberRow[]
  );

  return { success: true, data: members };
}

export async function createSBMemberAction(
  formData: FormData
): Promise<ActionResult<SBMember>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const name = String(formData.get("name") ?? "").trim();
  const positionSlot = parsePositionSlot(formData.get("positionSlot"));
  const imageFile = formData.get("image");

  if (!name) {
    return { success: false, error: "Please enter the member's name." };
  }
  if (!positionSlot) {
    return { success: false, error: "Please select a position." };
  }

  const memberId = randomUUID();
  let storagePath = "";
  const storage = createObjectStorage(session.supabase);

  if (imageFile instanceof File && imageFile.size > 0) {
    const imageError = validateMemberImage(imageFile);
    if (imageError) {
      return { success: false, error: imageError };
    }

    storagePath = buildSBMemberPhotoPath(
      session.lguId,
      memberId,
      getImageExtension(imageFile)
    );

    const { error: uploadError } = await storage.upload({
      bucket: SB_MEMBER_PHOTO_BUCKET,
      key: storagePath,
      body: imageFile,
      contentType: imageFile.type,
      upsert: false,
    });

    if (uploadError) {
      return { success: false, error: uploadError };
    }
  }

  const { data, error: insertError } = await session.supabase
    .from("sb_members")
    .insert({
      id: memberId,
      lgu_id: session.lguId,
      name,
      position_slot: positionSlot,
      position: getPositionLabelForSlot(positionSlot),
      image_storage_path: storagePath,
      committees: [],
      created_by: session.userId,
    })
    .select(SB_MEMBER_SELECT)
    .single();

  if (insertError || !data) {
    if (storagePath) {
      await storage.remove(SB_MEMBER_PHOTO_BUCKET, [storagePath]);
    }
    return { success: false, error: insertError?.message ?? "Failed to add member." };
  }

  const row = data as SBMemberRow;
  const imageUrl = await createSignedImageUrl(session.supabase, row.image_storage_path);

  await recordLGUActivity({
    session,
    action: "upload",
    module: "sb_members",
    entityId: memberId,
    entityTitle: name,
    details: `Added SB member "${name}"`,
  });

  revalidatePath("/admin/sb-members");
  return { success: true, data: mapSBMemberRowToMember(row, imageUrl) };
}

export async function updateSBMemberAction(
  id: string,
  formData: FormData
): Promise<ActionResult<SBMember>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const name = String(formData.get("name") ?? "").trim();
  const positionSlot = parsePositionSlot(formData.get("positionSlot"));
  const imageFile = formData.get("image");

  if (!name) {
    return { success: false, error: "Please enter the member's name." };
  }
  if (!positionSlot) {
    return { success: false, error: "Please select a position." };
  }

  const { data: existing, error: fetchError } = await session.supabase
    .from("sb_members")
    .select(SB_MEMBER_SELECT)
    .eq("id", id)
    .eq("lgu_id", session.lguId)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: "SB member not found." };
  }

  const existingRow = existing as SBMemberRow;
  let storagePath = existingRow.image_storage_path;

  if (imageFile instanceof File && imageFile.size > 0) {
    const imageError = validateMemberImage(imageFile);
    if (imageError) {
      return { success: false, error: imageError };
    }

    storagePath = buildSBMemberPhotoPath(
      session.lguId,
      id,
      getImageExtension(imageFile)
    );

    const { error: uploadError } = await createObjectStorage(
      session.supabase
    ).upload({
      bucket: SB_MEMBER_PHOTO_BUCKET,
      key: storagePath,
      body: imageFile,
      contentType: imageFile.type,
      upsert: true,
    });

    if (uploadError) {
      return { success: false, error: uploadError };
    }
  }

  const { data, error: updateError } = await session.supabase
    .from("sb_members")
    .update({
      name,
      position_slot: positionSlot,
      position: getPositionLabelForSlot(positionSlot),
      image_storage_path: storagePath,
    })
    .eq("id", id)
    .eq("lgu_id", session.lguId)
    .select(SB_MEMBER_SELECT)
    .single();

  if (updateError || !data) {
    return { success: false, error: updateError?.message ?? "Failed to update member." };
  }

  const row = data as SBMemberRow;
  const imageUrl = await createSignedImageUrl(session.supabase, row.image_storage_path);

  await recordLGUActivity({
    session,
    action: "edit",
    module: "sb_members",
    entityId: id,
    entityTitle: name,
    details: `Updated SB member "${name}"`,
  });

  revalidatePath("/admin/sb-members");
  return { success: true, data: mapSBMemberRowToMember(row, imageUrl) };
}

export async function deleteSBMemberAction(
  id: string
): Promise<ActionResult<null>> {
  const { session, error } = await requireLGUSession();
  if (error || !session) return { success: false, error: error! };

  const { data: existing, error: fetchError } = await session.supabase
    .from("sb_members")
    .select("id, image_storage_path, name")
    .eq("id", id)
    .eq("lgu_id", session.lguId)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: "SB member not found." };
  }

  const { error: deleteError } = await session.supabase
    .from("sb_members")
    .delete()
    .eq("id", id)
    .eq("lgu_id", session.lguId);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  if (existing.image_storage_path) {
    await createObjectStorage(session.supabase).remove(SB_MEMBER_PHOTO_BUCKET, [
      existing.image_storage_path as string,
    ]);
  }

  await recordLGUActivity({
    session,
    action: "delete",
    module: "sb_members",
    entityId: id,
    entityTitle: existing.name as string,
    details: `Deleted SB member "${existing.name}"`,
  });

  revalidatePath("/admin/sb-members");
  return { success: true, data: null };
}
