import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { Building2, Star, UserRound } from "lucide-react";
import { useEffect } from "react";

import { ListSkeleton, PageHeader, StatCard, StatsSkeleton } from "@/components/app-shell";
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
  overall_rating: number | null;
  notes: string | null;
  submitted_at: string;
};

function ReviewsPage() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const { data: profile, isLoading: profileLoading } = useProfile();

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
      const { data: properties, error: propsError } = await supabase
        .from("properties")
        .select("id, name")
        .eq("owner_group_id", groupId!);
      if (propsError) throw propsError;

      const propertyIds = (properties ?? []).map((property) => property.id);
      if (propertyIds.length === 0) {
        return {
          reviews: [] as ReviewRow[],
          stays: [] as StayReview[],
          properties: properties ?? [],
          cleaners: [],
        };
      }

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
        .select("id, property_id, overall_rating, notes, submitted_at")
        .in("property_id", propertyIds)
        .not("overall_rating", "is", null)
        .order("submitted_at", { ascending: false });

      const cleanerIds = Array.from(new Set((reviews ?? []).map((review) => review.cleaner_user_id)));
      const { data: cleaners } = cleanerIds.length
        ? await supabase
            .from("profiles")
            .select("user_id, display_name, username")
            .in("user_id", cleanerIds)
        : { data: [] };

      return {
        reviews: (reviews ?? []) as ReviewRow[],
        stays: (stays ?? []) as StayReview[],
        properties: properties ?? [],
        cleaners: cleaners ?? [],
      };
    },
  });

  // Live updates: a review submitted by a guest shows up without a reload.
  useEffect(() => {
    const channel = supabase
      .channel("reviews-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "cleaner_ratings" }, () => {
        qc.invalidateQueries({ queryKey: ["reviews"] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_condition_submissions" },
        () => {
          qc.invalidateQueries({ queryKey: ["reviews"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  if (!profileLoading && profile?.primary_role !== "owner" && profile?.primary_role !== "hr_company") {
    return <Navigate to="/dashboard" replace />;
  }

  const reviews = reviewsQ.data?.reviews ?? [];
  const stays = reviewsQ.data?.stays ?? [];
  const propertyName = (id: string) =>
    reviewsQ.data?.properties.find((property) => property.id === id)?.name ?? id.slice(0, 8);
  const cleanerName = (id: string) => {
    const cleaner = reviewsQ.data?.cleaners.find((person) => person.user_id === id);
    return cleaner?.display_name || cleaner?.username || id.slice(0, 8);
  };
  const cleanerIds = Array.from(new Set(reviews.map((review) => review.cleaner_user_id)));
  const allRatings = [
    ...reviews.map((review) => review.rating),
    ...stays.map((stay) => stay.overall_rating ?? 0).filter(Boolean),
  ];
  const average = allRatings.length
    ? (allRatings.reduce((sum, value) => sum + value, 0) / allRatings.length).toFixed(1)
    : "—";

  return (
    <>
      <PageHeader title={t("reviews.title")} description={t("reviews.subtitle")} />
      {reviewsQ.isLoading ? (
        <div className="space-y-6">
          <StatsSkeleton count={3} />
          <ListSkeleton rows={6} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label={t("reviews.average")} value={average} icon={Star} delay={0} />
            <StatCard label={t("reviews.count")} value={allRatings.length} icon={Building2} delay={80} />
            <StatCard label={t("reviews.pickCleaner")} value={cleanerIds.length} icon={UserRound} delay={160} />
          </div>

          {cleanerIds.length === 0 && stays.length === 0 ? (
            <section className="surface p-8 text-center text-sm text-muted-foreground">
              {t("reviews.empty")}
            </section>
          ) : (
            <>
            <div className="grid gap-4 lg:grid-cols-2">
              {cleanerIds.map((cleanerId, index) => {
                const cleanerReviews = reviews.filter((review) => review.cleaner_user_id === cleanerId);
                const cleanerAverage = (
                  cleanerReviews.reduce((sum, review) => sum + review.rating, 0) / cleanerReviews.length
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
                        <li key={review.id} className="space-y-2 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-muted-foreground">
                              {t("reviews.forProperty")} {propertyName(review.property_id)} · {t("reviews.on")} {new Date(review.created_at).toLocaleDateString()}
                            </span>
                            <span className="flex shrink-0 items-center gap-0.5">
                              {Array.from({ length: 5 }, (_, star) => (
                                <Star
                                  key={star}
                                  className={cn(
                                    "h-3.5 w-3.5",
                                    star < review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30",
                                  )}
                                  aria-hidden="true"
                                />
                              ))}
                            </span>
                          </div>
                          {review.comment && <p className="text-foreground">{review.comment}</p>}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>

            {stays.length > 0 && (
              <section className="surface space-y-3 p-5">
                <header>
                  <h2 className="text-lg">{t("reviews.stays")}</h2>
                  <p className="text-sm text-muted-foreground">{t("reviews.staysSubtitle")}</p>
                </header>
                <ul className="divide-y divide-border text-sm">
                  {stays.map((stay) => (
                    <li key={stay.id} className="space-y-2 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-muted-foreground">
                          {t("reviews.forProperty")} {propertyName(stay.property_id)} · {t("reviews.on")}{" "}
                          {new Date(stay.submitted_at).toLocaleDateString()}
                        </span>
                        <span className="flex shrink-0 items-center gap-0.5">
                          {Array.from({ length: 5 }, (_, star) => (
                            <Star
                              key={star}
                              className={cn(
                                "h-3.5 w-3.5",
                                star < (stay.overall_rating ?? 0)
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-muted-foreground/30",
                              )}
                              aria-hidden="true"
                            />
                          ))}
                        </span>
                      </div>
                      {stay.notes && <p className="text-foreground">{stay.notes}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            </>
          )}
        </div>
      )}
    </>
  );
}