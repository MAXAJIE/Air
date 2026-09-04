import { CheckCircle2, PackageMinus, RotateCcw, Star } from "lucide-react";

import { SignedPhoto } from "@/components/signed-photo";
import { Button } from "@/components/ui/button";
import { COVER_HEIGHT, GRID_COLS, type CardSize, type ViewMode } from "@/components/view-toggle";
import type { Complaint, ComplaintsData, ResolutionRow } from "@/hooks/use-complaints";
import { makeNamers } from "@/hooks/use-complaints";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export function Stars({ value }: { value: number }) {
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

type CardProps = {
  complaint: Complaint;
  data: ComplaintsData | undefined;
  resolution: ResolutionRow | undefined;
  compact: boolean;
  canResolve: boolean;
  busy?: boolean;
  onToggleResolve?: (complaint: Complaint, resolve: boolean) => void;
};

/** One complaint card. `compact` drops the photo strip in small tiles. */
export function ComplaintCard({
  complaint,
  data,
  resolution,
  compact,
  canResolve,
  busy,
  onToggleResolve,
}: CardProps) {
  const t = useT();
  const { propertyName, personName } = makeNamers(data);

  const code = complaint.sessionId ? data?.roomCodes[complaint.sessionId] : null;
  const name = propertyName(complaint.propertyId);
  const roomLabel = code ? `${name} · ${t("reviews.room")} ${code}` : name;
  const cleaner = personName(complaint.cleanerUserId);
  const amenityName = (id: string) =>
    data?.amenityDefs.find((def) => def.id === id)?.name ?? id.slice(0, 8);

  const hasAmenityProblem = complaint.shortages.length > 0 || complaint.unreported.length > 0;

  return (
    <li
      className={cn(
        "space-y-3 rounded-lg border p-4",
        resolution ? "border-border bg-muted/40" : "border-destructive/30 bg-destructive/5",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{roomLabel}</p>
          <p className="text-xs text-muted-foreground">
            {t("reviews.cleanedBy")} {cleaner ?? t("reviews.unknownCleaner")} · {t("reviews.on")}{" "}
            {new Date(complaint.reportedAt).toLocaleString()}
          </p>
        </div>
        {complaint.rating != null && <Stars value={complaint.rating} />}
      </div>

      {hasAmenityProblem && (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <PackageMinus className="h-3.5 w-3.5" aria-hidden="true" />
            {t("reviews.missingAmenities")}
          </p>
          <ul className="text-sm">
            {complaint.shortages.map((shortage) => (
              <li key={shortage.id}>
                {amenityName(shortage.amenity_definition_id)}
                {": "}
                {shortage.expected_qty_snapshot - shortage.actual_qty} /{" "}
                {shortage.expected_qty_snapshot}
              </li>
            ))}
            {/* The guest skipped these entries, so nothing was confirmed present. */}
            {complaint.unreported.map((item) => (
              <li key={item.id} className="text-muted-foreground">
                {item.name}
                {": "}
                {item.expected} / {item.expected}{" "}
                <span className="text-xs">({t("reviews.notReported")})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {complaint.complaint && (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-destructive">
            {t("reviews.guestComplaint")}
          </p>
          <p className={cn("text-sm", compact && "line-clamp-3")}>{complaint.complaint}</p>
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
            {t("reviews.resolved")} · {t("reviews.resolvedBy")} {personName(resolution.resolved_by)}{" "}
            · {t("reviews.on")} {new Date(resolution.resolved_at).toLocaleString()}
          </p>
        ) : (
          <span className="text-xs font-medium uppercase tracking-wide text-destructive">
            {t("reviews.openComplaints")}
          </span>
        )}
        {canResolve && onToggleResolve && (
          <Button
            type="button"
            size="sm"
            variant={resolution ? "outline" : "default"}
            disabled={busy}
            onClick={() => onToggleResolve(complaint, !resolution)}
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
}

/** The same cards laid out as a list or as tiles, like the property catalog. */
export function ComplaintList({
  items,
  view,
  size,
  ...card
}: Omit<CardProps, "complaint" | "compact" | "resolution"> & {
  items: Complaint[];
  view: ViewMode;
  size: CardSize;
  resolutionsByKey: Map<string, ResolutionRow>;
}) {
  const { resolutionsByKey, ...rest } = card;
  return view === "list" ? (
    <ul className="space-y-4">
      {items.map((complaint) => (
        <ComplaintCard
          key={complaint.key}
          complaint={complaint}
          resolution={resolutionsByKey.get(complaint.key)}
          compact={false}
          {...rest}
        />
      ))}
    </ul>
  ) : (
    <ul className={GRID_COLS[size]}>
      {items.map((complaint) => (
        <ComplaintCard
          key={complaint.key}
          complaint={complaint}
          resolution={resolutionsByKey.get(complaint.key)}
          compact={size === "sm"}
          {...rest}
        />
      ))}
    </ul>
  );
}
