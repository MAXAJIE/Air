import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { History } from "lucide-react";
import { useEffect, useState } from "react";

import { ListSkeleton, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useActiveGroup, useAuthUser } from "@/hooks/use-app";
import { useT, type TranslationKey } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity — Keyward" },
      { name: "description", content: "A record of everything you have done." },
      { property: "og:title", content: "Activity — Keyward" },
      { property: "og:description", content: "A record of everything you have done." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ActivityPage,
});

type ActivityRow = {
  id: string;
  actor_user_id: string | null;
  owner_group_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};

function ActivityPage() {
  const t = useT();
  const qc = useQueryClient();
  const { data: user } = useAuthUser();
  const { groupId } = useActiveGroup();
  const [scope, setScope] = useState<"mine" | "all">("mine");

  const activityQ = useQuery({
    queryKey: ["activity", user?.id, groupId, scope],
    enabled: !!user?.id,
    staleTime: 0,
    refetchInterval: 20_000,
    queryFn: async () => {
      let query = supabase
        .from("activity_log")
        .select("id, actor_user_id, owner_group_id, action, entity_type, entity_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (scope === "mine") query = query.eq("actor_user_id", user!.id);
      else if (groupId) query = query.eq("owner_group_id", groupId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
  });

  // Keep the feed live so a fresh action shows up without a reload.
  useEffect(() => {
    const channel = supabase
      .channel("activity-log-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log" }, () => {
        qc.invalidateQueries({ queryKey: ["activity"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const label = (action: string) => {
    const key = `activity.action.${action}` as TranslationKey;
    const translated = t(key);
    return translated === key ? action.replace(/_/g, " ") : translated;
  };

  const rows = activityQ.data ?? [];

  return (
    <>
      <PageHeader title={t("activity.title")} description={t("activity.subtitle")} />

      <div className="mb-4 flex gap-2">
        {(["mine", "all"] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={scope === value ? "default" : "outline"}
            onClick={() => setScope(value)}
          >
            {t(value === "mine" ? "activity.mine" : "activity.all")}
          </Button>
        ))}
      </div>

      {activityQ.isLoading ? (
        <ListSkeleton rows={8} />
      ) : rows.length === 0 ? (
        <section className="surface p-8 text-center text-sm text-muted-foreground">
          {t("activity.empty")}
        </section>
      ) : (
        <ol className="surface divide-y divide-border">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className={cn(
                "flex items-start gap-3 px-5 py-3 text-sm animate-card-enter",
                row.actor_user_id === user?.id && "bg-muted/30",
              )}
              style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
            >
              <History className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate">{label(row.action)}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}