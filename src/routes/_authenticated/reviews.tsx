import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, createFileRoute, useLocation } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  PackageMinus,
  RotateCcw,
  Star,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ListSkeleton, PageHeader, StatCard, StatsSkeleton } from "@/components/app-shell";
import { SignedPhoto } from "@/components/signed-photo";
import {
  COVER_HEIGHT,
  GRID_COLS,
  ViewToggle,
  useViewPrefs,
  type CardSize,
  type ViewMode,
} from "@/components/view-toggle";
import { Button } from "@/components/ui/button";
import { useActiveGroup, useProfile } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reviews")({
  head: () => ({
    meta: [
      { title: "Reviews — Keyward" },
      { name: "description", content: "Guest ratings and cleaning feedback." },
      { property: "og:title", content: "Reviews — Keyward" },
      { property: "og:description", content: "Guest ratings and cleaning feedback." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReviewsPage,
});

type ReviewRow = {
  id: string;
  cleaner_user_id: string;
  cleaning_job_id: string | null;
  property_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

type StayReview = {
  id: string;
  property_id: string;
  customer_session_id: string | null;
  overall_rating: number | null;
  notes: string | null;
  submitted_at: string;
};

type PhotoRow = { id: string; submission_id: string; photo_url: string };

type ShortageRow = {
  id: string;
  property_id: string;
  customer_session_id: string | null;
  amenity_definition_id: string;
  actual_qty: number;
  expected_qty_snapshot: number;
  checked_at: string;
};

type JobRow = {
  id: string;
  property_id: string;
  assigned_to_user_id: string | null;
  completed_at: string | null;
};

type ResolutionRow = {
  id: string;
  property_id: string;
  complaint_key: string;
  resolution_note: string | null;
  resolved_by: string;
  resolved_at: string;
};

/** One guest-reported problem: hygiene photos, written notes, missing items. */
type Complaint = {
  key: string;
  propertyId: string;
  sessionId: string | null;
  reportedAt: string;
  rating: number | null;
  notes: string | null;
  photos: PhotoRow[];
  shortages: ShortageRow[];
};

/** Reviews and complaints share one dataset but are two separate surfaces. */
type Tab = "reviews" | "complaints";

function Stars({ value }: { value: number }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {Array.from({ length: 5 }, (_, star) => (
        <Star
          key={star}
          className={cn(
            "h-3.5 w-3.5",
            star < value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30",
          )}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function ReviewsPage() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const location = useLocation();
  const complaintsRef = useRef<HTMLElement | null>(null);

  // Notifications deep-link here with ?section=complaints.
  const wantsComplaints =
    new URLSearchParams(location.searchStr ?? "").get("section") === "complaints";

  const [tab, setTab] = useState<Tab>(wantsComplaints ? "complaints" : "reviews");

  // Complaint cards can be read as a list or as compact tiles, exactly like
  // the property catalog. The choice is remembered per browser.
  const prefs = useViewPrefs("complaints");
  const initialPrefs = prefs.read();
  const [view, setView] = useState<ViewMode>(initialPrefs.view);
  const [size, setSize] = useState<CardSize>(initialPrefs.size);
  const setViewMode = (v: ViewMode) => {
    setView(v);
    prefs.write({ view: v, size });
  };
  const setCardSize = (s: CardSize) => {
    setSize(s);
    prefs.write({ view, size: s });
  };

  const reviewsQ = useQuery({
    queryKey: ["reviews", groupId],
    enabled: !!groupId,
    // Guest reviews land at unpredictable times: never serve a stale cache and
    // poll as a safety net on top of the realtime subscription below.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 20_000,
    queryFn: async () => {
      const empty = {
        reviews: [] as ReviewRow[],
        stays: [] as StayReview[],
        photos: [] as PhotoRow[],
        shortages: [] as ShortageRow[],
        amenityNames: {} as Record<string, string>,
        roomCodes: {} as Record<string, string>,
        jobs: [] as JobRow[],
        properties: [] as { id: string; name: string }[],
        cleaners: [] as { user_id: string; display_name: string | null; username: string | null }[],
        resolutions: [] as ResolutionRow[],
      };

      const { data: properties, error: propsError } = await supabase
        .from("properties")
        .select("id, name")
        .eq("owner_group_id", groupId!);
      if (propsError) throw propsError;

      const propertyIds = (properties ?? []).map((property) => property.id);
      if (propertyIds.length === 0) return { ...empty, properties: properties ?? [] };

      const { data: reviews, error: reviewsError } = await supabase
        .from("cleaner_ratings")
        .select("id, cleaner_user_id, cleaning_job_id, property_id, rating, comment, created_at")
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false });
      if (reviewsError) throw reviewsError;

      // Guests can also rate the stay itself (room condition step). Those
      // ratings never referenced a cleaner, so they were invisible here.
      const { data: stays } = await supabase
        .from("room_condition_submissions")
        .select("id, property_id, customer_session_id, overall_rating, notes, submitted_at")
        .in("property_id", propertyIds)
        .order("submitted_at", { ascending: false });

      const stayRows = (stays ?? []) as StayReview[];
      const submissionIds = stayRows.map((stay) => stay.id);
      const sessionIds = stayRows
        .map((stay) => stay.customer_session_id)
        .filter((id): id is string => !!id);

      // Hygiene evidence attached to a stay report.
      const { data: photos } = submissionIds.length
        ? await supabase
            .from("room_condition_photos")
            .select("id, submission_id, photo_url")
            .in("submission_id", submissionIds)
        : { data: [] as PhotoRow[] };

      // Missing/short amenities counted by the guest.
      const { data: checks } = await supabase
        .from("amenity_checks")
        .select(
          "id, property_id, customer_session_id, amenity_definition_id, actual_qty, expected_qty_snapshot, checked_at",
        )
        .in("property_id", propertyIds)
        .eq("role", "customer")
        .eq("is_discrepancy", true)
        .order("checked_at", { ascending: false });

      // Only a shortage is a complaint; a guest counting extra items is not.
      const shortages = ((checks ?? []) as ShortageRow[]).filter(
        (check) => check.actual_qty < check.expected_qty_snapshot,
      );

      const amenityIds = Array.from(new Set(shortages.map((row) => row.amenity_definition_id)));
      const { data: amenities } = amenityIds.length
        ? await supabase.from("amenity_definitions").select("id, name").in("id", amenityIds)
        : { data: [] as { id: string; name: string }[] };

      const allSessionIds = Array.from(
        new Set([
          ...sessionIds,
          ...shortages.map((row) => row.customer_session_id).filter((id): id is string => !!id),
        ]),
      );
      const { data: sessions } = allSessionIds.length
        ? await supabase.from("customer_sessions").select("id, room_code").in("id", allSessionIds)
        : { data: [] as { id: string; room_code: string }[] };

      // "Who cleaned it": the last clean completed before the guest reported.
      const { data: jobs } = await supabase
        .from("cleaning_jobs")
        .select("id, property_id, assigned_to_user_id, completed_at")
        .in("property_id", propertyIds)
        .not("assigned_to_user_id", "is", null)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false });

      const jobRows = (jobs ?? []) as JobRow[];

      // Which complaints the owner already dealt with.
      const { data: resolutions } = await supabase
        .from("complaint_resolutions")
        .select("id, property_id, complaint_key, resolution_note, resolved_by, resolved_at")
        .in("property_id", propertyIds);

      const resolutionRows = (resolutions ?? []) as ResolutionRow[];

      const cleanerIds = Array.from(
        new Set([
          ...(reviews ?? []).map((review) => review.cleaner_user_id),
          ...jobRows.map((job) => job.assigned_to_user_id).filter((id): id is string => !!id),
          ...resolutionRows.map((row) => row.resolved_by),
        ]),
      );
      const { data: cleaners } = cleanerIds.length
        ? await supabase
            .from("profiles")
            .select("user_id, display_name, username")
            .in("user_id", cleanerIds)
        : { data: [] };

      return {
        reviews: (reviews ?? []) as ReviewRow[],
        stays: stayRows,
        photos: (photos ?? []) as PhotoRow[],
        shortages,
        amenityNames: Object.fromEntries((amenities ?? []).map((row) => [row.id, row.name])),
        roomCodes: Object.fromEntries((sessions ?? []).map((row) => [row.id, row.room_code])),
        jobs: jobRows,
        properties: properties ?? [],
        cleaners: cleaners ?? [],
        resolutions: resolutionRows,
      };
    },
  });

  // Live updates: a review submitted by a guest shows up without a reload.
  useEffect(() => {
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
    };
    const channel = supabase
      .channel("reviews-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cleaner_ratings" },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_condition_submissions" },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_condition_photos" },
        invalidate,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "amenity_checks" }, invalidate)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaint_resolutions" },
        invalidate,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const reviews = useMemo(() => reviewsQ.data?.reviews ?? [], [reviewsQ.data]);
  const stays = useMemo(() => reviewsQ.data?.stays ?? [], [reviewsQ.data]);

  // A complaint is: hygiene photos, a written note, or a counted shortage.
  const complaints = useMemo<Complaint[]>(() => {
    const data = reviewsQ.data;
    if (!data) return [];

    const photosBySubmission = new Map<string, PhotoRow[]>();
    for (const photo of data.photos) {
      const list = photosBySubmission.get(photo.submission_id) ?? [];
      list.push(photo);
      photosBySubmission.set(photo.submission_id, list);
    }

    const shortagesBySession = new Map<string, ShortageRow[]>();
    const orphanShortages: ShortageRow[] = [];
    for (const shortage of data.shortages) {
      if (!shortage.customer_session_id) {
        orphanShortages.push(shortage);
        continue;
      }
      const list = shortagesBySession.get(shortage.customer_session_id) ?? [];
      list.push(shortage);
      shortagesBySession.set(shortage.customer_session_id, list);
    }

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
      });
    }

    // Shortages counted without a stay report still deserve a card.
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
      });
    }

    return built.sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
  }, [reviewsQ.data]);

  const resolutionsByKey = useMemo(() => {
    const map = new Map<string, ResolutionRow>();
    for (const row of reviewsQ.data?.resolutions ?? []) map.set(row.complaint_key, row);
    return map;
  }, [reviewsQ.data]);

  const openComplaints = complaints.filter((complaint) => !resolutionsByKey.has(complaint.key));
  const resolvedComplaints = complaints.filter((complaint) => resolutionsByKey.has(complaint.key));

  // Only the owner can close a complaint out; the migration enforces the same
  // rule at the database level, this just hides a button that would fail.
  const canResolve = profile?.primary_role === "owner";

  const resolveM = useMutation({
    mutationFn: async ({ complaint, resolve }: { complaint: Complaint; resolve: boolean }) => {
      if (resolve) {
        const { error } = await supabase.from("complaint_resolutions").insert({
          property_id: complaint.propertyId,
          complaint_key: complaint.key,
          resolved_by: profile!.user_id,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("complaint_resolutions")
          .delete()
          .eq("complaint_key", complaint.key);
        if (error) throw error;
      }
      return resolve;
    },
    onSuccess: (resolve) => {
      toast.success(resolve ? t("reviews.resolveSaved") : t("reviews.reopenSaved"));
      qc.invalidateQueries({ queryKey: ["reviews"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t("common.error"));
    },
  });

  useEffect(() => {
    if (!wantsComplaints || reviewsQ.isLoading) return;
    setTab("complaints");
    complaintsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [wantsComplaints, reviewsQ.isLoading, complaints.length]);

  if (
    !profileLoading &&
    profile?.primary_role !== "owner" &&
    profile?.primary_role !== "hr_company"
  ) {
    return <Navigate to="/dashboard" replace />;
  }

  const propertyName = (id: string) =>
    reviewsQ.data?.properties.find((property) => property.id === id)?.name ?? id.slice(0, 8);
  const personName = (id: string) => {
    const person = reviewsQ.data?.cleaners.find((candidate) => candidate.user_id === id);
    return person?.display_name || person?.username || id.slice(0, 8);
  };
  const cleanerName = personName;
  const roomLabel = (complaint: Complaint) => {
    const code = complaint.sessionId ? reviewsQ.data?.roomCodes[complaint.sessionId] : null;
    const name = propertyName(complaint.propertyId);
    return code ? `${name} · ${t("reviews.room")} ${code}` : name;
  };
  /** The cleaner responsible: last clean completed before the guest reported. */
  const cleanerForComplaint = (complaint: Complaint) => {
    const job = (reviewsQ.data?.jobs ?? []).find(
      (candidate) =>
        candidate.property_id === complaint.propertyId &&
        !!candidate.completed_at &&
        candidate.completed_at <= complaint.reportedAt,
    );
    return job?.assigned_to_user_id ? cleanerName(job.assigned_to_user_id) : null;
  };

  const cleanerIds = Array.from(new Set(reviews.map((review) => review.cleaner_user_id)));
  const allRatings = [
    ...reviews.map((review) => review.rating),
    ...stays.map((stay) => stay.overall_rating ?? 0).filter(Boolean),
  ];
  const average = allRatings.length
    ? (allRatings.reduce((sum, value) => sum + value, 0) / allRatings.length).toFixed(1)
    : "—";
  const ratedStays = stays.filter((stay) => !!stay.overall_rating);

  /** One complaint card. `compact` drops the photo strip in small tiles. */
  const ComplaintCard = ({ complaint, compact }: { complaint: Complaint; compact: boolean }) => {
    const cleaner = cleanerForComplaint(complaint);
    const resolution = resolutionsByKey.get(complaint.key);
    return (
      <li
        className={cn(
          "space-y-3 rounded-lg border p-4",
          resolution
            ? "border-border bg-muted/40"
            : "border-destructive/30 bg-destructive/5",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{roomLabel(complaint)}</p>
            <p className="text-xs text-muted-foreground">
              {t("reviews.cleanedBy")} {cleaner ?? t("reviews.unknownCleaner")} · {t("reviews.on")}{" "}
              {new Date(complaint.reportedAt).toLocaleString()}
            </p>
          </div>
          {complaint.rating != null && <Stars value={complaint.rating} />}
        </div>

        {complaint.shortages.length > 0 && (
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <PackageMinus className="h-3.5 w-3.5" aria-hidden="true" />
              {t("reviews.missingAmenities")}
            </p>
            <ul className="text-sm">
              {complaint.shortages.map((shortage) => (
                <li key={shortage.id}>
                  {reviewsQ.data?.amenityNames[shortage.amenity_definition_id] ??
                    shortage.amenity_definition_id.slice(0, 8)}
                  {": "}
                  {shortage.actual_qty} / {shortage.expected_qty_snapshot}
                </li>
              ))}
            </ul>
          </div>
        )}

        {complaint.notes && (
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("reviews.guestNotes")}
            </p>
            <p className={cn("text-sm", compact && "line-clamp-3")}>{complaint.notes}</p>
          </div>
        )}

        {complaint.photos.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("reviews.hygienePhotos")}
            </p>
            <div className="flex flex-wrap gap-2">
              {(compact ? complaint.photos.slice(0, 2) : complaint.photos).map((photo) => (
                <SignedPhoto
                  key={photo.id}
                  path={photo.photo_url}
                  alt={t("reviews.hygienePhotos")}
                  className={cn("w-24", compact ? COVER_HEIGHT.sm : "h-24")}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
          {resolution ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              {t("reviews.resolved")} · {t("reviews.resolvedBy")}{" "}
              {personName(resolution.resolved_by)} · {t("reviews.on")}{" "}
              {new Date(resolution.resolved_at).toLocaleString()}
            </p>
          ) : (
            <span className="text-xs font-medium uppercase tracking-wide text-destructive">
              {t("reviews.openComplaints")}
            </span>
          )}
          {canResolve && (
            <Button
              type="button"
              size="sm"
              variant={resolution ? "outline" : "default"}
              disabled={resolveM.isPending}
              onClick={() => resolveM.mutate({ complaint, resolve: !resolution })}
            >
              {resolution ? (
                <>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {t("reviews.reopen")}
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {t("reviews.resolve")}
                </>
              )}
            </Button>
          )}
        </div>
      </li>
    );
  };

  const ComplaintList = ({ items }: { items: Complaint[] }) =>
    view === "list" ? (
      <ul className="space-y-4">
        {items.map((complaint) => (
          <ComplaintCard key={complaint.key} complaint={complaint} compact={false} />
        ))}
      </ul>
    ) : (
      <ul className={GRID_COLS[size]}>
        {items.map((complaint) => (
          <ComplaintCard key={complaint.key} complaint={complaint} compact={size === "sm"} />
        ))}
      </ul>
    );

  return (
    <>
      <PageHeader title={t("reviews.title")} description={t("reviews.subtitle")} />

      {/* Reviews / complaints switch. Reviews is the default surface; every
          complaint lives behind the complaints side of this toggle. */}
      <div className="mb-6 inline-flex rounded-lg border border-border p-1">
        {(["reviews", "complaints"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              tab === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "reviews" ? t("reviews.tabReviews") : t("reviews.tabComplaints")}
            {value === "complaints" && openComplaints.length > 0 && (
              <span className="ml-2 rounded-full bg-destructive/15 px-1.5 py-0.5 text-xs text-destructive">
                {openComplaints.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {reviewsQ.isLoading ? (
        <div className="space-y-6">
          <StatsSkeleton count={3} />
          <ListSkeleton rows={6} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label={t("reviews.average")} value={average} icon={Star} delay={0} />
            <StatCard
              label={t("reviews.count")}
              value={allRatings.length}
              icon={Building2}
              delay={80}
            />
            <StatCard
              label={t("reviews.pickCleaner")}
              value={cleanerIds.length}
              icon={UserRound}
              delay={160}
            />
            <StatCard
              label={t("reviews.complaints")}
              value={openComplaints.length}
              icon={AlertTriangle}
              delay={240}
            />
          </div>

          {tab === "reviews" ? (
            cleanerIds.length === 0 && ratedStays.length === 0 ? (
              <section className="surface p-8 text-center text-sm text-muted-foreground">
                {t("reviews.empty")}
              </section>
            ) : (
              <>
                {/* Feedback: ratings only. Anything a guest complained about
                    lives behind the complaints toggle, with room and cleaner. */}
                <div className="grid gap-4 lg:grid-cols-2">
                  {cleanerIds.map((cleanerId, index) => {
                    const cleanerReviews = reviews.filter(
                      (review) => review.cleaner_user_id === cleanerId,
                    );
                    const cleanerAverage = (
                      cleanerReviews.reduce((sum, review) => sum + review.rating, 0) /
                      cleanerReviews.length
                    ).toFixed(1);
                    return (
                      <section
                        key={cleanerId}
                        className="surface space-y-4 p-5 animate-card-enter"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <header className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="truncate text-lg">{cleanerName(cleanerId)}</h2>
                            <p className="text-sm text-muted-foreground">
                              {cleanerReviews.length} {t("reviews.count").toLowerCase()}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary">
                            <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                            {cleanerAverage}
                          </span>
                        </header>

                        <ul className="divide-y divide-border text-sm">
                          {cleanerReviews.map((review) => (
                            <li
                              key={review.id}
                              className="flex items-center justify-between gap-3 py-3"
                            >
                              <span className="min-w-0 truncate text-muted-foreground">
                                {t("reviews.forProperty")} {propertyName(review.property_id)} ·{" "}
                                {t("reviews.on")} {new Date(review.created_at).toLocaleDateString()}
                              </span>
                              <Stars value={review.rating} />
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>

                {ratedStays.length > 0 && (
                  <section className="surface space-y-3 p-5">
                    <header>
                      <h2 className="text-lg">{t("reviews.stays")}</h2>
                      <p className="text-sm text-muted-foreground">{t("reviews.staysSubtitle")}</p>
                    </header>
                    <ul className="divide-y divide-border text-sm">
                      {ratedStays.map((stay) => (
                        <li key={stay.id} className="flex items-center justify-between gap-3 py-3">
                          <span className="min-w-0 truncate text-muted-foreground">
                            {t("reviews.forProperty")} {propertyName(stay.property_id)} ·{" "}
                            {t("reviews.on")} {new Date(stay.submitted_at).toLocaleDateString()}
                          </span>
                          <Stars value={stay.overall_rating ?? 0} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )
          ) : (
            /* Complaints: hygiene photos, missing amenities, guest notes. */
            <section
              id="complaints"
              ref={complaintsRef}
              className={cn(
                "surface space-y-4 p-5 scroll-mt-28",
                wantsComplaints && "ring-2 ring-destructive/40",
              )}
            >
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  <div>
                    <h2 className="text-lg">{t("reviews.complaints")}</h2>
                    <p className="text-sm text-muted-foreground">
                      {t("reviews.complaintsSubtitle")}
                    </p>
                  </div>
                </div>
                {/* Same arrangement control as the property catalog. */}
                <ViewToggle view={view} onView={setViewMode} size={size} onSize={setCardSize} />
              </header>

              {openComplaints.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t("reviews.complaintsEmpty")}
                </p>
              ) : (
                <ComplaintList items={openComplaints} />
              )}

              <div className="space-y-3 border-t border-border pt-4">
                <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  {t("reviews.resolvedComplaints")}
                </h3>
                {resolvedComplaints.length === 0 ? (
                  <p className="py-2 text-center text-sm text-muted-foreground">
                    {t("reviews.resolvedEmpty")}
                  </p>
                ) : (
                  <ComplaintList items={resolvedComplaints} />
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
