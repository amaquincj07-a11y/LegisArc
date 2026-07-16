"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { toPlaceStorageKey } from "@/lib/supabase/lgu-mapper";
import {
  COMMITTEE_SELECT,
  mapCommitteeRowToCommittee,
  type CommitteeRow,
} from "@/lib/supabase/committee-mapper";
import {
  mapSBMemberRowToMember,
  SB_MEMBER_PLACEHOLDER_IMAGE,
  SB_MEMBER_SELECT,
  type SBMemberRow,
} from "@/lib/supabase/sb-member-mapper";
import {
  createAdminObjectStorage,
  SIGNED_URL_TTL_SECONDS,
  SB_MEMBER_PHOTO_BUCKET,
} from "@/lib/infrastructure/storage";
import { COMMITTEE_YEAR_TERMS } from "@/lib/constants";
import type { Committee, SBMember, SBMemberPositionSlot } from "@/lib/types";

export type PublicActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type PublicSBChartData = {
  sbMembers: SBMember[];
  committees: Committee[];
};

const CURRENT_TERM = COMMITTEE_YEAR_TERMS[0];

const SB_MEMBER_LOOKUP_SELECT = "id, name, position_slot, position";

type SBMemberLookupRow = {
  id: string;
  name: string;
  position_slot: SBMemberPositionSlot;
  position: string;
};

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

function mapLookupRowToMember(row: SBMemberLookupRow): SBMember {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    positionSlot: row.position_slot,
    yearTerm: CURRENT_TERM,
    committees: [],
  };
}

async function mapRowsWithSignedUrls(rows: SBMemberRow[]): Promise<SBMember[]> {
  const pathsToSign = [
    ...new Set(
      rows
        .map((row) => row.image_storage_path)
        .filter((path): path is string => Boolean(path))
    ),
  ];

  const signedUrlByPath = new Map<string, string>();

  if (pathsToSign.length > 0) {
    const { urls } = await createAdminObjectStorage().createSignedUrls({
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

    return {
      ...mapSBMemberRowToMember(row, imageUrl),
      yearTerm: CURRENT_TERM,
    };
  });
}

export async function fetchPublicSBChartAction(
  province: string,
  municipality: string
): Promise<PublicActionResult<PublicSBChartData>> {
  try {
    const lguId = await resolveLguId(province, municipality);
    if (!lguId) {
      return { success: true, data: { sbMembers: [], committees: [] } };
    }

    const supabase = createAdminClient();

    const [membersResult, committeesResult, lookupResult] = await Promise.all([
      supabase
        .from("sb_members")
        .select(SB_MEMBER_SELECT)
        .eq("lgu_id", lguId)
        .order("created_at", { ascending: true }),
      supabase
        .from("committees")
        .select(COMMITTEE_SELECT)
        .eq("lgu_id", lguId)
        .order("name", { ascending: true }),
      supabase
        .from("sb_members")
        .select(SB_MEMBER_LOOKUP_SELECT)
        .eq("lgu_id", lguId),
    ]);

    if (membersResult.error) {
      return { success: false, error: membersResult.error.message };
    }
    if (committeesResult.error) {
      return { success: false, error: committeesResult.error.message };
    }
    if (lookupResult.error) {
      return { success: false, error: lookupResult.error.message };
    }

    const memberById = new Map(
      ((lookupResult.data ?? []) as SBMemberLookupRow[]).map((row) => {
        const member = mapLookupRowToMember(row);
        return [member.id, member] as const;
      })
    );

    const sbMembers = await mapRowsWithSignedUrls(
      (membersResult.data ?? []) as SBMemberRow[]
    );

    const committees = ((committeesResult.data ?? []) as CommitteeRow[]).map(
      (row) => mapCommitteeRowToCommittee(row, memberById)
    );

    return { success: true, data: { sbMembers, committees } };
  } catch {
    return { success: false, error: "Failed to load SB chart data." };
  }
}
