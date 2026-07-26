import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, ClipboardList } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/app-shell";
import { useProfile } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "History — Keyward" },
      { name: "description", content: "Every task and cleaning job you have completed." },
      { property: "og:title", content: "History — Keyward" },
      { property: "og:description", content: "Every task and cleaning job you have completed." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HistoryPage,
});

function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function HistoryPage() {
  const t = useT();
  const { data: profile } = useProfile();
  const userId = profile?.id ?? null;

  const eventsQ = useQuery({
    queryKey: ["history-completions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_completion_events")
        .select("id, task_id, submitted_at")
        .eq("user_id", userId!)
        .order("submitted_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const taskIds = (eventsQ.data ?? []).map((e) => e.task_id);
  const tasksQ = useQuery({
    queryKey: ["history-tasks", taskIds.join(",")],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, status, source")
        .in("id", taskIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const taskById = new Map((tasksQ.data ?? []).map((t) => [t.id, t]));
  const events = eventsQ.data ?? [];
  const total = events.length;

  return (
    <>
      <Link
        to="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("common.back")}
      </Link>

      <PageHeader
        title={t("nav.history")}
        description={`${total} ${total === 1 ? "completion" : "completions"}`}
      />

      {eventsQ.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="surface divide-y divide-border">
          {events.map((ev) => {
            const task = taskById.get(ev.task_id);
            const isCleaning = task?.source === "cleaning";
            return (
              <li key={ev.id} className="flex items-center gap-3 p-3">
                <span
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    isCleaning ? "bg-blue-500/10 text-blue-600" : "bg-emerald-500/10 text-emerald-600"
                  }`}
                >
                  {isCleaning ? (
                    <ClipboardList className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {task?.title ?? t("common.unassigned")}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {shortDate(ev.submitted_at)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
