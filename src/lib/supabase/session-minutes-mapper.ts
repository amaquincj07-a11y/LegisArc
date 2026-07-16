import type { DocumentStatus, SessionMinutes, SessionType } from "@/lib/types";

export const SESSION_MINUTES_SELECT =
  "id, lgu_id, session_date, session_type, pdf_storage_path, status, is_public, created_by, created_at, updated_at";

export type SessionMinutesRow = {
  id: string;
  lgu_id: string;
  session_date: string;
  session_type: SessionType;
  pdf_storage_path: string;
  status: DocumentStatus;
  is_public: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export {
  MINUTES_PDF_BUCKET,
  buildMinutesPdfPath,
} from "@/lib/infrastructure/storage";

export function mapSessionMinutesRowToDocument(
  row: SessionMinutesRow,
  pdfUrl: string
): SessionMinutes {
  const createdAt = new Date(row.created_at);

  return {
    id: row.id,
    documentType: "minutes",
    sessionDate: new Date(`${row.session_date}T00:00:00`),
    sessionType: row.session_type,
    status: row.status,
    isPublic: row.is_public,
    pdfUrl,
    createdBy: row.created_by ?? "",
    createdAt,
    updatedAt: new Date(row.updated_at),
  };
}
