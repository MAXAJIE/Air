/**
 * Human-readable durations.
 *
 * Countdowns used to be rendered as raw minutes:seconds, which turned a
 * two-day deadline into "2880:00". These helpers roll a duration up into
 * days / hours / minutes and only fall back to seconds for the last minute.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** e.g. "2d 4h", "3h 20m", "18m", "45s". Always at most two units. */
export function formatDuration(ms: number): string {
  const abs = Math.max(0, Math.floor(Math.abs(ms)));

  if (abs >= DAY) {
    const days = Math.floor(abs / DAY);
    const hours = Math.floor((abs % DAY) / HOUR);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (abs >= HOUR) {
    const hours = Math.floor(abs / HOUR);
    const mins = Math.floor((abs % HOUR) / MINUTE);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  if (abs >= MINUTE) {
    return `${Math.floor(abs / MINUTE)}m`;
  }
  return `${Math.floor(abs / 1000)}s`;
}

/**
 * How often a countdown of this size needs to re-render. A deadline days away
 * does not need a 1s interval; the last minute does.
 */
export function tickInterval(ms: number): number {
  const abs = Math.abs(ms);
  if (abs >= HOUR) return MINUTE;
  if (abs >= MINUTE) return 15_000;
  return 1_000;
}
