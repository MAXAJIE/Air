import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthUser } from "@/hooks/use-app";
import { supabase } from "@/integrations/supabase/client";

type NotificationType =
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
  | "task_approved";

export type NotificationPayload = {
  propertyId?: string;
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
};

/**
 * Page routes mapped to notification types for badge counts.
 * When a notification's `url` or route is navigated, the badge decreases.
 */
export const NOTIF_TO_ROUTE: Record<NotificationType, string> = {
  job_submitted: "/cleaning",
  job_assigned: "/jobs",
  job_reviewed: "/jobs",
  amenity_discrepancy: "/cleaning",
  special_request: "/shop",
  payment_proof: "/shop",
  hr_request: "/inbox",
  hr_job_submitted: "/inbox",
  hr_job_reviewed: "/inbox",
  task_assigned: "/tasks",
  task_submitted: "/tasks",
  task_approved: "/tasks",
};

/**
 * Derive a notification's navigation URL from its type and payload.
 */
export function notifUrl(notif: AppNotification): string {
  if (notif.payload.url) return notif.payload.url;
  const route = NOTIF_TO_ROUTE[notif.type] ?? "/dashboard";

  // Build query params for section/tab deep-linking
  const params = new URLSearchParams();

  if (notif.type === "special_request") {
    params.set("section", "requests");
  } else if (notif.type === "payment_proof") {
    params.set("section", "shop");
  } else if (notif.type === "job_submitted" || notif.type === "amenity_discrepancy") {
    params.set("tab", "jobs");
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
        .select("id, type, payload, read, created_at")
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
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", id);
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
 * Mark all unread notifications for a given route as read.
 */
export function useMarkRouteRead() {
  const qc = useQueryClient();
  const { data: user } = useAuthUser();

  return useMutation({
    mutationFn: async (route: string) => {
      const types = Object.entries(NOTIF_TO_ROUTE)
        .filter(([, r]) => r === route)
        .map(([type]) => type);

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


