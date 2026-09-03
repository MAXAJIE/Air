import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, createFileRoute, useLocation } from "@tanstack/react-router";
import { AlertTriangle, Archive, Building2, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ListSkeleton, PageHeader, StatCard, StatsSkeleton } from "@/components/app-shell";
import { ComplaintList, Stars } from "@/components/complaint-card";
import { Button } from "@/components/ui/button";
import { ViewToggle, useViewPrefs, type CardSize, type ViewMode } from "@/components/view-toggle";
import { useActiveGroup, useProfile } from "@/hooks/use-app";
import {
  makeNamers,
  useComplaintsData,
  useSplitComplaints,
  type Complaint,
} from "@/hooks/use-complaints";
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

/** Reviews and complaints share one dataset but are two separate surfaces. */
type Tab = "reviews" | "complaints";

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

  const reviewsQ = useComplaintsData(groupId);
  const { open: openComplaints, resolved: resolvedComplaints, resolutionsByKey } =
    useSplitComplaints(reviewsQ.data);

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

  const reviews = reviewsQ.data?.reviews ?? [];
  const stays = reviewsQ.data?.stays ?? [];

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
  }, [wantsComplaints, reviewsQ.isLoading, openComplaints.length]);

  if (
    !profileLoading &&
    profile?.primary_role !== "owner" &&
    profile?.primary_role !== "hr_company"
  ) {
    return <Navigate to="/dashboard" replace />;
  }

  const { propertyName, personName } = makeNamers(reviewsQ.data);

  /** Who cleaned the room this guest stayed in, for the stay list. */
  const stayCleaner = (propertyId: string, submittedAt: string) => {
    const job = (reviewsQ.data?.jobs ?? []).find(
      (candidate) =>
        candidate.property_id === propertyId &&
        !!candidate.completed_at &&
        candidate.completed_at <= submittedAt,
    );
    return personName(job?.assigned_to_user_id ?? null);
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
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label={t("reviews.average")} value={average} icon={Star} delay={0} />
            <StatCard
              label={t("reviews.count")}
              value={allRatings.length}
              icon={Building2}
              delay={80}
            />
            <StatCard
              label={t("reviews.complaints")}
              value={openComplaints.length}
              icon={AlertTriangle}
              delay={160}
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
                            <h2 className="truncate text-lg">{personName(cleanerId)}</h2>
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
                            {t("reviews.cleanedBy")}{" "}
                            {stayCleaner(stay.property_id, stay.submitted_at) ??
                              t("reviews.unknownCleaner")}{" "}
                            · {t("reviews.on")} {new Date(stay.submitted_at).toLocaleDateString()}
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
            /* Complaints: hygiene photos, missing amenities, guest notes.
               Resolved complaints are hidden here; they live in the archive. */
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
                <ComplaintList
                  items={openComplaints}
                  view={view}
                  size={size}
                  data={reviewsQ.data}
                  resolutionsByKey={resolutionsByKey}
                  canResolve={canResolve}
                  busy={resolveM.isPending}
                  onToggleResolve={(complaint, resolve) => resolveM.mutate({ complaint, resolve })}
                />
              )}

              {/* Resolved complaints stay out of sight until asked for. */}
              <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-sm text-muted-foreground">
                  {resolvedComplaints.length} {t("reviews.resolvedComplaints").toLowerCase()}
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link to="/reviews-archive">
                    <Archive className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    {t("reviews.viewMore")}
                  </Link>
                </Button>
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
