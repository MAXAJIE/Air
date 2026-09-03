import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";

import { ListSkeleton, PageHeader } from "@/components/app-shell";
import { ComplaintList } from "@/components/complaint-card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ViewToggle, useViewPrefs, type CardSize, type ViewMode } from "@/components/view-toggle";
import { useActiveGroup, useProfile } from "@/hooks/use-app";
import { makeNamers, useComplaintsData, useSplitComplaints } from "@/hooks/use-complaints";
import { useT } from "@/i18n";

export const Route = createFileRoute("/_authenticated/reviews-archive")({
  head: () => ({
    meta: [
      { title: "Resolved complaints — Keyward" },
      { name: "description", content: "Every complaint that has been closed out." },
      { property: "og:title", content: "Resolved complaints — Keyward" },
      { property: "og:description", content: "Every complaint that has been closed out." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ComplaintArchivePage,
});

const ANY = "__any";

function ComplaintArchivePage() {
  const t = useT();
  const { groupId } = useActiveGroup();
  const { data: profile, isLoading: profileLoading } = useProfile();

  // Same arrangement control (and stored preference) as the complaints tab.
  const prefs = useViewPrefs("complaints");
  const initialPrefs = prefs.read();
  const [view, setView] = useState<ViewMode>(initialPrefs.view);
  const [size, setSize] = useState<CardSize>(initialPrefs.size);

  const [property, setProperty] = useState(ANY);
  const [cleaner, setCleaner] = useState(ANY);
  const [stars, setStars] = useState(ANY);
  const [amenity, setAmenity] = useState(ANY);

  const reviewsQ = useComplaintsData(groupId);
  const { resolved, resolutionsByKey } = useSplitComplaints(reviewsQ.data);
  const { propertyName, personName } = makeNamers(reviewsQ.data);

  if (
    !profileLoading &&
    profile?.primary_role !== "owner" &&
    profile?.primary_role !== "hr_company"
  ) {
    return <Navigate to="/dashboard" replace />;
  }

  const cleanerIds = Array.from(
    new Set(resolved.map((complaint) => complaint.cleanerUserId).filter((id): id is string => !!id)),
  );

  const items = resolved.filter((complaint) => {
    if (property !== ANY && complaint.propertyId !== property) return false;
    if (cleaner !== ANY && complaint.cleanerUserId !== cleaner) return false;
    if (stars !== ANY && String(complaint.rating ?? 0) !== stars) return false;
    if (amenity === "with" && complaint.shortages.length + complaint.unreported.length === 0)
      return false;
    if (amenity === "without" && complaint.shortages.length + complaint.unreported.length > 0)
      return false;
    return true;
  });

  const filter = (
    id: string,
    label: string,
    value: string,
    onValue: (v: string) => void,
    options: { value: string; label: string }[],
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onValue}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{t("reviews.filterAll")}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <>
      <Link
        to="/reviews"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("common.back")}
      </Link>
      <PageHeader title={t("reviews.archiveTitle")} description={t("reviews.archiveSubtitle")} />

      <section className="surface space-y-4 p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {items.length} {t("reviews.resolvedComplaints").toLowerCase()}
          </p>
          <ViewToggle
            view={view}
            onView={(v) => {
              setView(v);
              prefs.write({ view: v, size });
            }}
            size={size}
            onSize={(s) => {
              setSize(s);
              prefs.write({ view, size: s });
            }}
          />
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {filter(
            "filter-property",
            t("reviews.filterProperty"),
            property,
            setProperty,
            (reviewsQ.data?.properties ?? []).map((row) => ({
              value: row.id,
              label: propertyName(row.id),
            })),
          )}
          {filter(
            "filter-cleaner",
            t("reviews.filterCleaner"),
            cleaner,
            setCleaner,
            cleanerIds.map((id) => ({ value: id, label: personName(id) ?? id.slice(0, 8) })),
          )}
          {filter(
            "filter-stars",
            t("reviews.filterStars"),
            stars,
            setStars,
            [5, 4, 3, 2, 1, 0].map((value) => ({
              value: String(value),
              label: value === 0 ? t("reviews.noRating") : `${value}★`,
            })),
          )}
          {filter("filter-amenity", t("reviews.filterAmenity"), amenity, setAmenity, [
            { value: "with", label: t("reviews.amenityProblem") },
            { value: "without", label: t("reviews.amenityFine") },
          ])}
        </div>

        {reviewsQ.isLoading ? (
          <ListSkeleton rows={5} />
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("reviews.archiveEmpty")}
          </p>
        ) : (
          <ComplaintList
            items={items}
            view={view}
            size={size}
            data={reviewsQ.data}
            resolutionsByKey={resolutionsByKey}
            canResolve={false}
          />
        )}
      </section>
    </>
  );
}
