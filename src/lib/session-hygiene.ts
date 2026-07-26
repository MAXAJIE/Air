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
  const last = readLastActivity();
  if (last === null) return false;
  return now - last > INACTIVITY_TTL_MS;
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
