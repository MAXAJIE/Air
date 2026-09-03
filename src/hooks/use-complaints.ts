import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";

/**
 * Shared data layer for the reviews page and the resolved-complaints archive.
 * Both surfaces read exactly the same rows, so the fetching and the
 * complaint-building rules live here instead of being copied per route.
 */

export type ReviewRow = {
  id: string;
  cleaner_user_id: string;
  cleaning_job_id: string | null;
  property_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type StayReview = {
  id: string;
  property_id: string;
  customer_session_id: string | null;
  overall_rating: number | null;
  notes: string | null;
  submitted_at: string;
};

export type PhotoRow = { id: string; submission_id: string; photo_url: string };

export type CheckRow = {
  id: string;
  property_id: string;
  customer_session_id: string | null;
  amenity_definition_id: string;
  actual_qty: number;
  expected_qty_snapshot: number;
  checked_at: string;
  is_discrepancy: boolean;
};

export type AmenityDef = {
  id: string;
  property_id: string;
  name: string;
  expected_qty: number;
};

export type JobRow = {
  id: string;
  property_id: string;
  assigned_to_user_id: string | null;
  completed_at: string | null;
};

export type ResolutionRow = {
  id: string;
  property_id: string;
  complaint_key: string;
  resolution_note: string | null;
  resolved_by: string;
  resolved_at: string;
};

export type PersonRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
};

/** An amenity the guest never counted: reported as fully missing (0 / expected). */
export type UnreportedAmenity = { id: string; name: string; expected: number };

/** One guest-reported problem: hygiene photos, written notes, missing items. */
export type Complaint = {
  key: string;
  propertyId: string;
  sessionId: string | null;
  reportedAt: string;
  rating: number | null;
  notes: string | null;
  photos: PhotoRow[];
  shortages: CheckRow[];
  /** Amenities on the property checklist the guest left unanswered. */
  unreported: UnreportedAmenity[];
  /** Cleaner responsible: last clean completed before the guest reported. */
  cleanerUserId: string | null;
};

export type ComplaintsData = {
  reviews: ReviewRow[];
  stays: StayReview[];
  photos: PhotoRow[];
  checks: CheckRow[];
  amenityDefs: AmenityDef[];
  roomCodes: Record<string, string>;
  jobs: JobRow[];
  properties: { id: string; name: string }[];
  cleaners: PersonRow[];
  resolutions: ResolutionRow[];
};

const EMPTY: ComplaintsData = {
  reviews: [],
  stays: [],
  photos: [],
  checks: [],
  amenityDefs: [],
  roomCodes: {},
  jobs: [],
  properties: [],
  cleaners: [],
  resolutions: [],
};

/** Every row the reviews surfaces need, in one cached query. */
export function useComplaintsData(groupId: string | null | undefined) {
  return useQuery({
    queryKey: ["reviews", groupId],
    enabled: !!groupId,
    // Guest reviews land at unpredictable times: never serve a stale cache and
    // poll as a safety net on top of the realtime subscription.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 20_000,
    queryFn: async (): Promise<ComplaintsData> => {
      const { data: properties, error: propsError } = await supabase
        .from("properties")
        .select("id, name")
        .eq("owner_group_id", groupId!);
      if (propsError) throw propsError;

      const propertyIds = (properties ?? []).map((property) => property.id);
      if (propertyIds.length === 0) return { ...EMPTY, properties: properties ?? [] };

      const { data: reviews, error: reviewsError } = await supabase
        .from("cleaner_ratings")
        .select("id, cleaner_user_id, cleaning_job_id, property_id, rating, comment, created_at")
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false });
      if (reviewsError) throw reviewsError;

      const { data: stays } = await supabase
        .from("room_condition_submissions")
        .select("id, property_id, customer_session_id, overall_rating, notes, submitted_at")
        .in("property_id", propertyIds)
        .order("submitted_at", { ascending: false });

      const stayRows = (stays ?? []) as StayReview[];
      const submissionIds = stayRows.map((stay) => stay.id);

      const { data: photos } = submissionIds.length
        ? await supabase
            .from("room_condition_photos")
            .select("id, submission_id, photo_url")
            .in("submission_id", submissionIds)
        : { data: [] as PhotoRow[] };

      // Every guest amenity count, not only the short ones: an amenity with no
      // row at all is what makes "missing 2 / 2" possible.
      const { data: checks } = await supabase
        .from("amenity_checks")
        .select(
          "id, property_id, customer_session_id, amenity_definition_id, actual_qty, expected_qty_snapshot, checked_at, is_discrepancy",
        )
        .in("property_id", propertyIds)
        .eq("role", "customer")
        .order("checked_at", { ascending: false });

      const checkRows = (checks ?? []) as CheckRow[];

      const { data: amenityDefs } = await supabase
        .from("amenity_definitions")
        .select("id, property_id, name, expected_qty")
        .in("property_id", propertyIds);

      const sessionIds = Array.from(
        new Set(
          [
            ...stayRows.map((stay) => stay.customer_session_id),
            ...checkRows.map((row) => row.customer_session_id),
          ].filter((id): id is string => !!id),
        ),
      );
      const { data: sessions } = sessionIds.length
        ? await supabase.from("customer_sessions").select("id, room_code").in("id", sessionIds)
        : { data: [] as { id: string; room_code: string }[] };

      const { data: jobs } = await supabase
        .from("cleaning_jobs")
        .select("id, property_id, assigned_to_user_id, completed_at")
        .in("property_id", propertyIds)
        .not("assigned_to_user_id", "is", null)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false });

      const jobRows = (jobs ?? []) as JobRow[];

      const { data: resolutions } = await supabase
        .from("complaint_resolutions")
        .select("id, property_id, complaint_key, resolution_note, resolved_by, resolved_at")
        .in("property_id", propertyIds);

      const resolutionRows = (resolutions ?? []) as ResolutionRow[];

      const peopleIds = Array.from(
        new Set([
          ...(reviews ?? []).map((review) => review.cleaner_user_id),
          ...jobRows.map((job) => job.assigned_to_user_id).filter((id): id is string => !!id),
          ...resolutionRows.map((row) => row.resolved_by),
        ]),
      );
      const { data: people } = peopleIds.length
        ? await supabase
            .from("profiles")
            .select("user_id, display_name, username")
            .in("user_id", peopleIds)
        : { data: [] as PersonRow[] };

      return {
        reviews: (reviews ?? []) as ReviewRow[],
        stays: stayRows,
        photos: (photos ?? []) as PhotoRow[],
        checks: checkRows,
        amenityDefs: (amenityDefs ?? []) as AmenityDef[],
        roomCodes: Object.fromEntries((sessions ?? []).map((row) => [row.id, row.room_code])),
        jobs: jobRows,
        properties: properties ?? [],
        cleaners: (people ?? []) as PersonRow[],
        resolutions: resolutionRows,
      };
    },
  });
}

/** The cleaner on duty: last clean completed at or before the report. */
function cleanerFor(data: ComplaintsData, propertyId: string, reportedAt: string): string | null {
  const job = data.jobs.find(
    (candidate) =>
      candidate.property_id === propertyId &&
      !!candidate.completed_at &&
      candidate.completed_at <= reportedAt,
  );
  return job?.assigned_to_user_id ?? null;
}

/** Turn the raw rows into complaint cards. */
export function buildComplaints(data: ComplaintsData | undefined): Complaint[] {
  if (!data) return [];

  const photosBySubmission = new Map<string, PhotoRow[]>();
  for (const photo of data.photos) {
    const list = photosBySubmission.get(photo.submission_id) ?? [];
    list.push(photo);
    photosBySubmission.set(photo.submission_id, list);
  }

  // Only a shortage is a complaint; a guest counting extra items is not.
  const shortagesBySession = new Map<string, CheckRow[]>();
  const orphanShortages: CheckRow[] = [];
  const answeredBySession = new Map<string, Set<string>>();
  for (const check of data.checks) {
    if (check.customer_session_id) {
      const answered = answeredBySession.get(check.customer_session_id) ?? new Set<string>();
      answered.add(check.amenity_definition_id);
      answeredBySession.set(check.customer_session_id, answered);
    }
    if (!check.is_discrepancy || check.actual_qty >= check.expected_qty_snapshot) continue;
    if (!check.customer_session_id) {
      orphanShortages.push(check);
      continue;
    }
    const list = shortagesBySession.get(check.customer_session_id) ?? [];
    list.push(check);
    shortagesBySession.set(check.customer_session_id, list);
  }

  const defsByProperty = new Map<string, AmenityDef[]>();
  for (const def of data.amenityDefs) {
    const list = defsByProperty.get(def.property_id) ?? [];
    list.push(def);
    defsByProperty.set(def.property_id, list);
  }

  /** Checklist entries the guest never answered count as fully missing. */
  const unreportedFor = (propertyId: string, sessionId: string | null): UnreportedAmenity[] => {
    if (!sessionId) return [];
    const defs = defsByProperty.get(propertyId) ?? [];
    const answered = answeredBySession.get(sessionId) ?? new Set<string>();
    // A guest who answered nothing at all never opened the amenity step, so
    // treat the whole checklist as unanswered only when they reported something.
    return defs
      .filter((def) => !answered.has(def.id))
      .map((def) => ({ id: def.id, name: def.name, expected: def.expected_qty }));
  };

  const built: Complaint[] = [];
  const usedSessions = new Set<string>();

  for (const stay of data.stays) {
    const photos = photosBySubmission.get(stay.id) ?? [];
    const shortages = stay.customer_session_id
      ? (shortagesBySession.get(stay.customer_session_id) ?? [])
      : [];
    if (stay.customer_session_id) usedSessions.add(stay.customer_session_id);
    const hasNotes = !!stay.notes && stay.notes.trim().length > 0;
    if (photos.length === 0 && shortages.length === 0 && !hasNotes) continue;
    built.push({
      key: stay.id,
      propertyId: stay.property_id,
      sessionId: stay.customer_session_id,
      reportedAt: stay.submitted_at,
      rating: stay.overall_rating,
      notes: hasNotes ? stay.notes : null,
      photos,
      shortages,
      unreported: unreportedFor(stay.property_id, stay.customer_session_id),
      cleanerUserId: cleanerFor(data, stay.property_id, stay.submitted_at),
    });
  }

  for (const [sessionId, shortages] of shortagesBySession) {
    if (usedSessions.has(sessionId)) continue;
    built.push({
      key: `session-${sessionId}`,
      propertyId: shortages[0].property_id,
      sessionId,
      reportedAt: shortages[0].checked_at,
      rating: null,
      notes: null,
      photos: [],
      shortages,
      unreported: unreportedFor(shortages[0].property_id, sessionId),
      cleanerUserId: cleanerFor(data, shortages[0].property_id, shortages[0].checked_at),
    });
  }

  for (const shortage of orphanShortages) {
    built.push({
      key: `check-${shortage.id}`,
      propertyId: shortage.property_id,
      sessionId: null,
      reportedAt: shortage.checked_at,
      rating: null,
      notes: null,
      photos: [],
      shortages: [shortage],
      unreported: [],
      cleanerUserId: cleanerFor(data, shortage.property_id, shortage.checked_at),
    });
  }

  return built.sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
}

/** Complaints split into what still needs attention and what is closed out. */
export function useSplitComplaints(data: ComplaintsData | undefined) {
  return useMemo(() => {
    const complaints = buildComplaints(data);
    const byKey = new Map<string, ResolutionRow>();
    for (const row of data?.resolutions ?? []) byKey.set(row.complaint_key, row);
    return {
      complaints,
      resolutionsByKey: byKey,
      open: complaints.filter((complaint) => !byKey.has(complaint.key)),
      resolved: complaints.filter((complaint) => byKey.has(complaint.key)),
    };
  }, [data]);
}

/** Display name helpers shared by both surfaces. */
export function makeNamers(data: ComplaintsData | undefined) {
  const propertyName = (id: string) =>
    data?.properties.find((property) => property.id === id)?.name ?? id.slice(0, 8);
  const personName = (id: string | null) => {
    if (!id) return null;
    const person = data?.cleaners.find((candidate) => candidate.user_id === id);
    return person?.display_name || person?.username || id.slice(0, 8);
  };
  return { propertyName, personName };
}
