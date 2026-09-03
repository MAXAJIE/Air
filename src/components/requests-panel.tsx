import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveGroup, useAuthUser } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** Guest-raised special requests for the active group, with assignment and resolve. */
export function RequestsPanel() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();

  const propsQ = useQuery({
    queryKey: ["properties", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, name")
        .eq("owner_group_id", groupId!);
      return data ?? [];
    },
  });

  // No foreign key ties memberships to profiles, so names are resolved separately.
  const workersQ = useQuery({
    queryKey: ["workers", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("owner_group_id", groupId!)
        .eq("role", "worker")
        .eq("status", "active");
      if (error) throw error;
      if (!data?.length) return [] as Array<{ user_id: string; name: string }>;
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username")
        .in(
          "user_id",
          data.map((m) => m.user_id),
        );
      return data.map((m) => {
        const p = profiles?.find((row) => row.user_id === m.user_id);
        return {
          user_id: m.user_id,
          name: p?.display_name || p?.username || m.user_id.slice(0, 8),
        };
      });
    },
  });

  const reqQ = useQuery({
    queryKey: ["requests", groupId, propsQ.data?.length],
    enabled: !!propsQ.data?.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("special_requests")
        .select("id, description, status, property_id, assigned_to_user_id, created_at")
        .in(
          "property_id",
          propsQ.data!.map((p) => p.id),
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: user } = useAuthUser();

  const patch = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: {
        status?: "assigned" | "resolved";
        assigned_to_user_id?: string | null;
        resolved_at?: string | null;
      };
    }) => {
      const { error } = await supabase.from("special_requests").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["requests"] }),
  });

  // When assigning a special request to a worker, also create a task so it
  // appears in the worker's job list and triggers a task_assigned notification.
  const assignWithTask = useMutation({
    mutationFn: async ({
      requestId,
      workerId,
    }: {
      requestId: string;
      workerId: string;
    }) => {
      // Look up the request details from our cached data
      const request = (reqQ.data ?? []).find((r) => r.id === requestId);
      if (!request) throw new Error("Request not found");

      // Update the special request status
      const { error: reqErr } = await supabase
        .from("special_requests")
        .update({ assigned_to_user_id: workerId, status: "assigned" })
        .eq("id", requestId);
      if (reqErr) throw reqErr;

      // Truncate the description for the task title
      const title =
        request.description.length > 60
          ? request.description.slice(0, 57) + "..."
          : request.description;

      // Create a task for the worker, returning its id so we can reference it
      const { data: newTask, error: taskErr } = await supabase
        .from("tasks")
        .insert({
          owner_group_id: groupId,
          assigned_to_user_id: workerId,
          property_id: request.property_id,
          title,
          description: request.description,
          created_by_user_id: user!.id,
          source: "manual",
          is_private: false,
        })
        .select("id")
        .single();
      if (taskErr) throw taskErr;

      // Also create a notification directly so the worker is alerted
      // even if the DB trigger migration hasn't been applied yet.
      const { error: notifErr } = await supabase.from("notifications").insert({
        user_id: workerId,
        type: "task_assigned",
        payload: { taskId: newTask.id, propertyId: request.property_id },
      });
      if (notifErr) throw notifErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["tasks", groupId] });
    },
    onError: (e) => {
      window.alert(e instanceof Error ? e.message : t("common.error"));
    },
  });

  // Pending assignment confirmation: { requestId, workerId, workerName }
  const [pendingAssign, setPendingAssign] = useState<{
    requestId: string;
    workerId: string;
    workerName: string;
  } | null>(null);
  // Resolved requests are history: keep the board to what still needs action.
  const [showResolved, setShowResolved] = useState(false);
  const all = reqQ.data ?? [];
  const open = all.filter((r) => r.status !== "resolved");
  const resolved = all.filter((r) => r.status === "resolved");
  const visible = showResolved ? resolved : open;

  return (
    <div className="space-y-4">
      <section className="surface space-y-2 p-5">
        <h2 className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          {t("req.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("req.about")}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("req.about1")}</li>
          <li>{t("req.about2")}</li>
          <li>{t("req.about3")}</li>
        </ul>
      </section>

      <div className="inline-flex rounded-full bg-muted p-1 text-sm">
        {([
          { value: false, label: `${t("req.openTitle")} (${open.length})` },
          { value: true, label: `${t("req.showResolved")} (${resolved.length})` },
        ] as const).map((tab) => (
          <button
            key={String(tab.value)}
            type="button"
            aria-pressed={showResolved === tab.value}
            onClick={() => setShowResolved(tab.value)}
            className={cn(
              "rounded-full px-4 py-1.5 transition-colors",
              showResolved === tab.value
                ? "bg-background font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((r) => (
          <article key={r.id} className="surface space-y-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate font-medium">
                {propsQ.data?.find((p) => p.id === r.property_id)?.name ?? "—"}
              </p>
              <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                {t(`req.status.${r.status as "open"}`)}
              </span>
            </div>
            <p className="text-sm">{r.description}</p>
            {r.status !== "resolved" && (
              <div className="space-y-2">
                <Select
                  onValueChange={(v) => {
                    const worker = (workersQ.data ?? []).find((w) => w.user_id === v);
                    if (worker) {
                      setPendingAssign({
                        requestId: r.id,
                        workerId: v,
                        workerName: worker.name,
                      });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("req.assign")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(workersQ.data ?? []).map((w) => (
                      <SelectItem key={w.user_id} value={w.user_id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    patch.mutate({
                      id: r.id,
                      values: { status: "resolved", resolved_at: new Date().toISOString() },
                    })
                  }
                >
                  {t("req.resolve")}
                </Button>
              </div>
            )}
          </article>
        ))}
        {visible.length === 0 && <p className="text-sm text-muted-foreground">{t("req.empty")}</p>}
      </div>

      {/* Confirmation dialog for assigning a worker */}
      <AlertDialog
        open={pendingAssign !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAssign(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAssign
                ? t("req.assignConfirm").replace("{name}", pendingAssign.workerName)
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={assignWithTask.isPending}
              onClick={() => {
                if (!pendingAssign) return;
                assignWithTask.mutate({
                  requestId: pendingAssign.requestId,
                  workerId: pendingAssign.workerId,
                });
                setPendingAssign(null);
              }}
            >
              {t("req.confirmAssign")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
