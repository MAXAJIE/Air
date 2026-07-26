import type React from "react";
/**
 * Status colours live as semantic utilities in styles.css (`status-chip-*`).
 * Components never hardcode colour values — they map a status to a palette key.
 */
export const STATUS_COLORS = ["slate", "blue", "green", "amber", "rose", "violet"] as const;

export type StatusColor = (typeof STATUS_COLORS)[number];

export function isStatusColor(value: string | null | undefined): value is StatusColor {
  return !!value && (STATUS_COLORS as readonly string[]).includes(value);
}

/** Chip classes for an explicit palette key (falls back to slate). */
export function statusChipClass(color: string | null | undefined): string {
  if (isHexColor(color)) return "status-chip";
  const key: StatusColor = isStatusColor(color) ? color : "slate";
  return `status-chip status-chip-${key}`;
}

/** Small round colour swatch, used by the palette picker and list dots. */
export function statusDotClass(color: string | null | undefined): string {
  if (isHexColor(color)) return "inline-block h-4 w-4 rounded-full";
  const key: StatusColor = isStatusColor(color) ? color : "slate";
  return `status-dot-${key}`;
}

/** Cleaning-job / task lifecycle → palette key. */
export function jobStatusColor(status: string | null | undefined): StatusColor {
  switch (status) {
    case "pending":
      return "amber";
    case "in_progress":
      return "blue";
    case "submitted":
      return "violet";
    case "reviewed":
    case "done":
      return "green";
    default:
      return "slate";
  }
}

export function jobStatusChipClass(status: string | null | undefined): string {
  return statusChipClass(jobStatusColor(status));
}

/** True when `color` is a #RRGGBB / #RGB hex value chosen from the color wheel. */
export function isHexColor(value: string | null | undefined): value is string {
  return !!value && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

/**
 * Inline styles for a status chip when the color is an arbitrary hex value.
 * Returns an empty object for palette-key colors (styles.css utilities apply).
 */
export function statusChipStyle(color: string | null | undefined): React.CSSProperties {
  if (!isHexColor(color)) return {};
  return {
    backgroundColor: color!,
    color: readableTextOn(color!),
    borderColor: "transparent",
  };
}

/** Inline style for a status dot when the color is an arbitrary hex value. */
export function statusDotStyle(color: string | null | undefined): React.CSSProperties {
  if (!isHexColor(color)) return {};
  return { backgroundColor: color! };
}

/** Pick black/white text for adequate contrast on the supplied hex background. */
function readableTextOn(hex: string): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // Rec. 601 luma.
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.6 ? "#111827" : "#ffffff";
}
