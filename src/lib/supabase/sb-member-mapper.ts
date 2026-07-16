import { SB_MEMBER_POSITION_SLOTS } from "@/lib/constants";
import type { SBMember, SBMemberPositionSlot } from "@/lib/types";

export const SB_MEMBER_SELECT =
  "id, lgu_id, name, position_slot, position, image_storage_path, committees, created_by, created_at, updated_at";

export type SBMemberRow = {
  id: string;
  lgu_id: string;
  name: string;
  position_slot: SBMemberPositionSlot;
  position: string;
  image_storage_path: string;
  committees: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export { SB_MEMBER_PHOTO_BUCKET, buildSBMemberPhotoPath } from "@/lib/infrastructure/storage";
export const SB_MEMBER_PLACEHOLDER_IMAGE = "/images/sb-member-placeholder.png";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export function getPositionLabelForSlot(slot: SBMemberPositionSlot): string {
  const config = SB_MEMBER_POSITION_SLOTS.find((entry) => entry.slot === slot);
  return config?.cardPosition ?? "SB Member";
}

export function getImageExtension(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export function mapSBMemberRowToMember(
  row: SBMemberRow,
  imageUrl: string
): SBMember {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    positionSlot: row.position_slot,
    yearTerm: "",
    committees: Array.isArray(row.committees) ? row.committees : [],
    imageUrl,
  };
}

export function validateMemberImage(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "Please upload an image file (JPG, PNG, or WebP).";
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return "Image must be less than 5MB.";
  }
  return null;
}
