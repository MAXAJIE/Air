import type { QueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

/** Unverified accounts get 5 minutes before their local session/cache is wiped. */
export const UNVERIFIED_TTL_MS = 5 * 60 * 1000;
export const PENDING_VERIFY_KEY = "keyward.pendingVerify";

export type PendingVerify = { email: string; at: number };

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

export function isUnverifiedExpired(user: User | null | undefined): boolean {
  if (!isUnverified(user)) return false;
  const created = user?.created_at ? Date.parse(user.created_at) : Date.now();
  return Date.now() - created > UNVERIFIED_TTL_MS;
}

/** Wipe every trace of the unverified attempt: session, query cache, app storage. */
export async function purgeUnverifiedSession(queryClient?: QueryClient) {
  clearPendingVerification();
  if (queryClient) {
    await queryClient.cancelQueries();
    queryClient.clear();
  }
  try {
    await supabase.auth.signOut();
  } catch {
    // session may already be gone
  }
  if (typeof window !== "undefined") {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("keyward.") || key.startsWith("sb-")) window.localStorage.removeItem(key);
    }
    window.sessionStorage.clear();
  }
}
