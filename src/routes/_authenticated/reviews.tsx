import { useQuery } from "@tanstack/react-query";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { Building2, Star, UserRound } from "lucide-react";

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

function ReviewsPage() {
  const t = useT();
  const { groupId } = useActiveGroup();
  const { data: profile, isLoading: profileLoading } = useProfile();

  const reviewsQ = useQuery({
    queryKey: ["reviews", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data: properties, error: propsError } = await supabase
        .from("properties")
        .select("id, name")
        .eq("owner_group_id", groupId!);
      if (propsError) throw propsError;

      const propertyIds = (properties ?? []).map((property) => property.id);
      if (propertyIds.length === 0) {
        return { reviews: [] as ReviewRow[], properties: properties ?? [], cleaners: [] };
      }

      const { data: reviews, error: reviewsError } = await supabase
        .from("cleaner_ratings")
        .select("id, cleaner_user_id, cleaning_job_id, property_id, rating, comment, created_at")
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false });
      if (reviewsError) throw reviewsError;

      const cleanerIds = Array.from(new Set((reviews ?? []).map((review) => review.cleaner_user_id)));
      const { data: cleaners } = cleanerIds.length
        ? await supabase
            .from("profiles")
            .select("user_id, display_name, username")
            .in("user_id", cleanerIds)
        : { data: [] };

      return {
        reviews: (reviews ?? []) as ReviewRow[],
        properties: properties ?? [],
        cleaners: cleaners ?? [],
      };
    },
  });

  if (!profileLoading && profile?.primary_role !== "owner" && profile?.primary_role !== "hr_company") {
    return <Navigate to="/dashboard" replace />;
  }

  const reviews = reviewsQ.data?.reviews ?? [];
  const propertyName = (id: string) =>
    reviewsQ.data?.properties.find((property) => property.id === id)?.name ?? id.slice(0, 8);
  const cleanerName = (id: string) => {
    const cleaner = reviewsQ.data?.cleaners.find((person) => person.user_id === id);
    return cleaner?.display_name || cleaner?.username || id.slice(0, 8);
  };
  const cleanerIds = Array.from(new Set(reviews.map((review) => review.cleaner_user_id)));
  const average = reviews.length
    ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)
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
            <StatCard label={t("reviews.count")} value={reviews.length} icon={Building2} delay={80} />
            <StatCard label={t("reviews.pickCleaner")} value={cleanerIds.length} icon={UserRound} delay={160} />
          </div>

          {cleanerIds.length === 0 ? (
            <section className="surface p-8 text-center text-sm text-muted-foreground">
              {t("reviews.empty")}
            </section>
          ) : (
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
          )}
        </div>
      )}
    </>
  );
}