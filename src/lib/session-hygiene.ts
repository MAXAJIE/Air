import type { QueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

/**
 * Sessions are only ever ended by inactivity: 15 minutes with no interaction.
 * Nothing else signs a user out — an unconfirmed email keeps working.
 */
export const INACTIVITY_TTL_MS = 15 * 60 * 1000;
export const PENDING_VERIFY_KEY = "keyward.pendingVerify";
export const LAST_ACTIVE_KEY = "keyward.lastActive";
/**
 * Counter of in-progress tasks that should keep the session alive.
 * While > 0, `isIdleExpired` returns false and the idle logout is paused.
 * Incremented by `holdIdleLogout` (e.g. on Accept), decremented by
 * `releaseIdleLogout` (e.g. on Submit / Cancel).
 */
export const TASK_HOLD_KEY = "keyward.taskHold";

export type PendingVerify = { email: string; at: number };

export function isVerified(user: User | null | undefined): boolean {
  return Boolean(user && (user.email_confirmed_at || user.confirmed_at));
}

export function touchActivity(at: number = Date.now()) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_ACTIVE_KEY, String(at));
}

export function readLastActivity(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LAST_ACTIVE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function clearActivity() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LAST_ACTIVE_KEY);
}

/** True once the last recorded interaction is older than the idle window. */
export function isIdleExpired(now: number = Date.now()): boolean {
  // While the user has at least one accepted, not-yet-submitted task, we
  // deliberately pause the idle logout. The 15-minute clock only counts
  // again once every hold has been released.
  if (readTaskHold() > 0) return false;
  const last = readLastActivity();
  if (last === null) return false;
  return now - last > INACTIVITY_TTL_MS;
}

function readTaskHold(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(TASK_HOLD_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function writeTaskHold(value: number) {
  if (typeof window === "undefined") return;
  const clamped = Math.max(0, Math.floor(value));
  if (clamped === 0) {
    window.localStorage.removeItem(TASK_HOLD_KEY);
  } else {
    window.localStorage.setItem(TASK_HOLD_KEY, String(clamped));
  }
}

/** Pause the idle logout while a task is being worked on. Call on Accept. */
export function holdIdleLogout() {
  writeTaskHold(readTaskHold() + 1);
  // Reset the activity clock so that when the hold is released the user
  // still has a full window before being logged out.
  touchActivity();
}

/** Release one pause. Call on Submit / Cancel. Safe to call idempotently. */
export function releaseIdleLogout() {
  writeTaskHold(readTaskHold() - 1);
  touchActivity();
}

/** True while at least one hold is active. */
export function isIdleLogoutHeld(): boolean {
  return readTaskHold() > 0;
}

/** Clear every hold. Call on hard sign-out so the next session starts clean. */
export function clearIdleLogoutHolds() {
  writeTaskHold(0);
}

/** Sign out for inactivity: keeps the account, drops only the local session + caches. */
export async function signOutForInactivity(queryClient?: QueryClient) {
  clearActivity();
  if (queryClient) {
    await queryClient.cancelQueries();
    queryClient.clear();
  }
  try {
    await supabase.auth.signOut();
  } catch {
    // session may already be gone
  }
}


export function markPendingVerification(email: string) {
  if (typeof window === "undefined") return;
  const payload: PendingVerify = { email, at: Date.now() };
  window.localStorage.setItem(PENDING_VERIFY_KEY, JSON.stringify(payload));
}

export function readPendingVerification(): PendingVerify | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_VERIFY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingVerify;
    return typeof parsed?.at === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingVerification() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PENDING_VERIFY_KEY);
}

export function isUnverified(user: User | null | undefined): boolean {
  if (!user) return false;
  return !user.email_confirmed_at && !user.confirmed_at;
}
