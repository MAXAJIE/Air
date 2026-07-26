import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveGroup } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(reqQ.data ?? []).map((r) => (
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
                  onValueChange={(v) =>
                    patch.mutate({
                      id: r.id,
                      values: { assigned_to_user_id: v, status: "assigned" },
                    })
                  }
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
        {(reqQ.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">{t("req.empty")}</p>
        )}
      </div>
    </div>
  );
}
