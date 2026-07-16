import type {
  DocumentStatus,
  LegislativeDocument,
  OrdinanceKind,
} from "@/lib/types";

export const ORDINANCE_SELECT =
  "id, lgu_id, ordinance_number, series_year, title, author_sponsor, category, ordinance_kind, pdf_storage_path, status, is_public, created_by, created_at, updated_at";

export type OrdinanceRow = {
  id: string;
  lgu_id: string;
  ordinance_number: string;
  series_year: number;
  title: string;
  author_sponsor: string;
  category: string;
  ordinance_kind: OrdinanceKind;
  pdf_storage_path: string;
  status: DocumentStatus;
  is_public: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export {
  ORDINANCE_PDF_BUCKET,
  buildOrdinancePdfPath,
} from "@/lib/infrastructure/storage";

export function mapOrdinanceRowToDocument(
  row: OrdinanceRow,
  pdfUrl: string
): LegislativeDocument {
  const seriesNumber = `${row.series_year}-${row.ordinance_number}`;
  const createdAt = new Date(row.created_at);

  return {
    id: row.id,
    documentType: "ordinance",
    ordinanceKind: row.ordinance_kind,
    proposedNumber: seriesNumber,
    approvedNumber: seriesNumber,
    seriesYear: row.series_year,
    title: row.title,
    authorSponsor: row.author_sponsor,
    category: row.category,
    dateEnacted: createdAt,
    dateApproved: createdAt,
    publicationInfo: "",
    remarks: "",
    notes: "",
    repealsAmendments: "",
    status: row.status,
    isPublic: row.is_public,
    pdfUrl,
    versions: [],
    timeline: [],
    createdBy: row.created_by ?? "",
    createdAt,
    updatedAt: new Date(row.updated_at),
  };
}
