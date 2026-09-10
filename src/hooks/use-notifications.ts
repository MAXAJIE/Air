import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthUser } from "@/hooks/use-app";
import { supabase } from "@/integrations/supabase/client";

export type NotificationType =
  | "job_submitted"
  | "job_assigned"
  | "job_reviewed"
  | "amenity_discrepancy"
  | "special_request"
  | "payment_proof"
  | "hr_request"
  | "hr_job_submitted"
  | "hr_job_reviewed"
  | "task_assigned"
  | "task_submitted"
  | "task_approved"
  | "review_received"
  | "hygiene_complaint"
  | "low_rating";

export type NotificationPayload = {
  propertyId?: string;
  submissionId?: string;
  ratingId?: string;
  rating?: number;
  cleanerUserId?: string;
  jobId?: string;
  taskId?: string;
  orderId?: string;
  requestId?: string;
  url?: string;
};

export type AppNotification = {
  id: string;
  type: NotificationType;
  payload: NotificationPayload;
  read: boolean;
  created_at: string;
  /**
   * Optional pre-computed navigation target (populated by DB triggers or
   * server code). When present it wins over the client-side derivation
   * in `notifUrl()` — this is the seam that lets new notification kinds
   * deep-link without teaching the client a new mapping.
   */
  target_url: string | null;
};

/**
 * Page routes mapped to notification types for badge counts.
 * When a notification's `url` or route is navigated, the badge decreases.
 */
export const NOTIF_TO_ROUTE: Record<NotificationType, string> = {
  job_submitted: "/cleaning",
  job_assigned: "/jobs",
  job_reviewed: "/jobs",
  // Guest-reported problems live in the complaints section of the reviews page.
  amenity_discrepancy: "/reviews",
  special_request: "/shop",
  payment_proof: "/shop",
  hr_request: "/inbox",
  hr_job_submitted: "/inbox",
  hr_job_reviewed: "/inbox",
  // A cleaner's assigned work lives on "My jobs"; the generic task list is
  // the owner-side surface, so an assignment must not land there.
  task_assigned: "/jobs",
  task_submitted: "/tasks",
  task_approved: "/jobs",
  review_received: "/reviews",
  hygiene_complaint: "/reviews",
  low_rating: "/reviews",
};

/**
 * Some routes host more than one surface. Opening the shopping tab must not
 * silence a special-request alert, so these types also declare the section
 * they belong to and are only cleared while that section is on screen.
 */
export const NOTIF_TO_SECTION: Partial<Record<NotificationType, string>> = {
  special_request: "requests",
  payment_proof: "shop",
  amenity_discrepancy: "complaints",
  hygiene_complaint: "complaints",
  low_rating: "complaints",
};

/** Unread count for one route + section pair, used for in-page badges. */
export function countForSection(
  notifications: AppNotification[] | undefined,
  route: string,
  section: string,
): number {
  return (notifications ?? []).filter(
    (n) => NOTIF_TO_ROUTE[n.type] === route && NOTIF_TO_SECTION[n.type] === section,
  ).length;
}

/**
 * Derive a notification's navigation URL from its type and payload.
 */
export function notifUrl(notif: AppNotification): string {
  // Work handed to the person doing it always opens "My jobs", even when an
  // older stored link points at the owner-side task list.
  if (notif.type === "task_assigned" || notif.type === "task_approved") return "/jobs";
  if (notif.target_url) return notif.target_url;
  if (notif.payload.url) return notif.payload.url;
  const route = NOTIF_TO_ROUTE[notif.type] ?? "/dashboard";

  // Build query params for section/tab deep-linking
  const params = new URLSearchParams();

  if (notif.type === "special_request") {
    params.set("section", "requests");
  } else if (notif.type === "payment_proof") {
    params.set("section", "shop");
  } else if (notif.type === "job_submitted") {
    params.set("tab", "jobs");
  } else if (
    notif.type === "amenity_discrepancy" ||
    notif.type === "hygiene_complaint" ||
    notif.type === "low_rating"
  ) {
    params.set("section", "complaints");
  }

  if (notif.payload.propertyId) {
    params.set("property", notif.payload.propertyId);
  }

  const qs = params.toString();
  return qs ? `${route}?${qs}` : route;
}

/**
 * Count unread notifications per route, plus total unread.
 */
export type BadgeMap = Record<string, number>;

/** Fetch unread notifications for the current user with polling. */
export function useUnreadNotifications() {
  const { data: user } = useAuthUser();

  return useQuery({
    queryKey: ["unread-notifications", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, payload, read, created_at, target_url")
        .eq("user_id", user!.id)
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
    refetchInterval: 30_000,
  });
}

/**
 * Derive a badge count map from an array of notifications.
 * Keys are route paths, values are counts.
 */
export function computeBadges(notifications: AppNotification[]): BadgeMap {
  const badges: BadgeMap = {};
  for (const n of notifications) {
    const route = NOTIF_TO_ROUTE[n.type];
    if (!route) continue;
    badges[route] = (badges[route] ?? 0) + 1;
  }
  return badges;
}

/**
 * Mark a single notification as read.
 */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["unread-notifications"] }),
  });
}

/**
 * Mark all unread notifications as read.
 */
export function useMarkAllRead() {
  const qc = useQueryClient();
  const { data: user } = useAuthUser();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user!.id)
        .eq("read", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["unread-notifications"] }),
  });
}

/**
 * Mark unread notifications for a route as read — and, when the route has
 * sections, only the ones belonging to the section currently on screen.
 */
export function useMarkRouteRead() {
  const qc = useQueryClient();
  const { data: user } = useAuthUser();

  return useMutation({
    mutationFn: async ({ route, section }: { route: string; section?: string }) => {
      const types = (Object.keys(NOTIF_TO_ROUTE) as NotificationType[]).filter((type) => {
        if (NOTIF_TO_ROUTE[type] !== route) return false;
        const needed = NOTIF_TO_SECTION[type];
        return needed === undefined || needed === section;
      });

      if (types.length === 0) return;

      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user!.id)
        .eq("read", false)
        .in("type", types);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["unread-notifications"] }),
  });
}
