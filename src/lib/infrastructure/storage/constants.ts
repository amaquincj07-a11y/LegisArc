import type { DocumentType } from "@/lib/types";

/** Signed URL lifetime — keep short; regenerate on each view/download. */
export const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Logical bucket names. With Supabase these map 1:1 to Storage buckets.
 * With Spaces/S3 they can map to prefixes inside one bucket via env
 * (see s3-adapter) without changing DB keys.
 */
export const ORDINANCE_PDF_BUCKET = "ordinance-pdfs";
export const RESOLUTION_PDF_BUCKET = "resolution-pdfs";
export const MINUTES_PDF_BUCKET = "minutes-pdfs";
export const SB_MEMBER_PHOTO_BUCKET = "sb-member-photos";

/** Portable object keys — `{lguId}/{entityId}.ext` works on any object store. */
export function buildOrdinancePdfPath(lguId: string, ordinanceId: string): string {
  return `${lguId}/${ordinanceId}.pdf`;
}

export function buildResolutionPdfPath(
  lguId: string,
  resolutionId: string
): string {
  return `${lguId}/${resolutionId}.pdf`;
}

export function buildMinutesPdfPath(lguId: string, minutesId: string): string {
  return `${lguId}/${minutesId}.pdf`;
}

export function buildSBMemberPhotoPath(
  lguId: string,
  memberId: string,
  extension: string
): string {
  return `${lguId}/${memberId}.${extension}`;
}

export function getDocumentPdfBucket(documentType: DocumentType): string {
  if (documentType === "ordinance") return ORDINANCE_PDF_BUCKET;
  if (documentType === "resolution") return RESOLUTION_PDF_BUCKET;
  return MINUTES_PDF_BUCKET;
}
