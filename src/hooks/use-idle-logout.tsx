import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useT } from "@/i18n";
import {
  INACTIVITY_TTL_MS,
  isIdleLogoutHeld,
  isIdleExpired,
  readLastActivity,
  signOutForInactivity,
  touchActivity,
} from "@/lib/session-hygiene";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "visibilitychange"] as const;

/**
 * Verified accounts stay signed in indefinitely; this only signs them out after
 * 15 minutes without any interaction (tracked across tabs via localStorage).
 */
export function useIdleLogout() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const firing = useRef(false);

  useEffect(() => {
    let timer: number | undefined;

    const expire = async () => {
      if (firing.current) return;
      // Never expire while a task hold is active (accepted, not submitted).
      if (isIdleLogoutHeld()) {
        schedule();
        return;
      }
      firing.current = true;
      await signOutForInactivity(queryClient);
      toast.error(t("auth.idleLogout"));
      navigate({ to: "/auth", replace: true });
    };

    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      if (isIdleLogoutHeld()) {
        // Re-check every 30s while paused; picks up release() promptly.
        timer = window.setTimeout(schedule, 30_000);
        return;
      }
      const last = readLastActivity() ?? Date.now();
      const remaining = last + INACTIVITY_TTL_MS - Date.now();
      if (remaining <= 0) {
        void expire();
        return;
      }
      timer = window.setTimeout(schedule, Math.min(remaining, 30_000));
    };

    const onActivity = () => {
      if (document.visibilityState === "hidden") return;
      touchActivity();
      schedule();
    };

    if (isIdleExpired()) {
      void expire();
      return;
    }

    touchActivity();
    schedule();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    return () => {
      if (timer) window.clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity);
    };
  }, [navigate, queryClient, t]);
}
