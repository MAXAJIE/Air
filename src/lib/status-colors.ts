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
  const key: StatusColor = isStatusColor(color) ? color : "slate";
  return `status-chip status-chip-${key}`;
}

/** Small round colour swatch, used by the palette picker and list dots. */
export function statusDotClass(color: string | null | undefined): string {
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
