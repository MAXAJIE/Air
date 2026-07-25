import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app-shell";
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

export const Route = createFileRoute("/_authenticated/requests")({
  head: () => ({
    meta: [
      { title: "Guest requests — Keyward" },
      { name: "description", content: "Special requests raised by guests during their stay." },
      { property: "og:title", content: "Guest requests — Keyward" },
      { property: "og:description", content: "Special requests raised by guests during their stay." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RequestsPage,
});

function RequestsPage() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();

  const propsQ = useQuery({
    queryKey: ["properties", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("id, name").eq("owner_group_id", groupId!);
      return data ?? [];
    },
  });

  const workersQ = useQuery({
    queryKey: ["workers", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data } = await supabase
        .from("memberships")
        .select("user_id, profiles:profiles!memberships_user_id_fkey(display_name, username)")
        .eq("owner_group_id", groupId!)
        .eq("role", "worker")
        .eq("status", "active");
      return data ?? [];
    },
  });

  const reqQ = useQuery({
    queryKey: ["requests", groupId, propsQ.data?.length],
    enabled: !!propsQ.data?.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("special_requests")
        .select("id, description, status, property_id, assigned_to_user_id, created_at")
        .in("property_id", propsQ.data!.map((p) => p.id))
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
    <>
      <PageHeader title={t("req.title")} />
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
                    patch.mutate({ id: r.id, values: { assigned_to_user_id: v, status: "assigned" } })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("req.assign")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(workersQ.data ?? []).map((w) => {
                      const p = w.profiles as unknown as
                        | { display_name: string | null; username: string }
                        | null;
                      return (
                        <SelectItem key={w.user_id} value={w.user_id}>
                          {p?.display_name || p?.username || w.user_id.slice(0, 8)}
                        </SelectItem>
                      );
                    })}
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
          <p className="text-sm text-muted-foreground">{t("common.none")}</p>
        )}
      </div>
    </>
  );
}
