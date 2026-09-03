import { LayoutGrid, List, Maximize2, Minimize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ViewMode = "grid" | "list";
export type CardSize = "sm" | "md" | "lg";

const SIZES: CardSize[] = ["sm", "md", "lg"];

export const GRID_COLS: Record<CardSize, string> = {
  sm: "grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5",
  md: "grid gap-4 sm:grid-cols-2 xl:grid-cols-3",
  lg: "grid gap-5 lg:grid-cols-2",
};

/**
 * Card covers keep the 3:2 shape the cropper uses, so an image positioned in
 * the crop dialog is shown whole instead of being re-cropped by the card.
 */
export const COVER_HEIGHT: Record<CardSize, string> = {
  sm: "aspect-[3/2]",
  md: "aspect-[3/2]",
  lg: "aspect-[3/2]",
};

/** Grid/list switch plus a card-density stepper, shared by every catalog surface. */
export function ViewToggle({
  view,
  onView,
  size,
  onSize,
}: {
  view: ViewMode;
  onView: (v: ViewMode) => void;
  size: CardSize;
  onSize: (s: CardSize) => void;
}) {
  const index = SIZES.indexOf(size);
  return (
    <div className="flex items-center gap-1">
      <div className="flex rounded-md border border-border p-0.5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Grid view"
          aria-pressed={view === "grid"}
          className={cn("h-7 w-7", view === "grid" && "bg-secondary")}
          onClick={() => onView("grid")}
        >
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="List view"
          aria-pressed={view === "list"}
          className={cn("h-7 w-7", view === "list" && "bg-secondary")}
          onClick={() => onView("list")}
        >
          <List className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
      {view === "grid" && (
        <div className="flex rounded-md border border-border p-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Smaller cards"
            disabled={index === 0}
            onClick={() => onSize(SIZES[Math.max(0, index - 1)])}
          >
            <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Larger cards"
            disabled={index === SIZES.length - 1}
            onClick={() => onSize(SIZES[Math.min(SIZES.length - 1, index + 1)])}
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}

/** Remembers the chosen layout per surface without a round-trip. */
export function useViewPrefs(key: string) {
  const storageKey = `keyward.view.${key}`;
  const read = (): { view: ViewMode; size: CardSize } => {
    if (typeof window === "undefined") return { view: "grid", size: "md" };
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return { view: "grid", size: "md" };
      const parsed = JSON.parse(raw) as { view: ViewMode; size: CardSize };
      return { view: parsed.view === "list" ? "list" : "grid", size: SIZES.includes(parsed.size) ? parsed.size : "md" };
    } catch {
      return { view: "grid", size: "md" };
    }
  };
  const write = (value: { view: ViewMode; size: CardSize }) => {
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey, JSON.stringify(value));
  };
  return { read, write };
}
