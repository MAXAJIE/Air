import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ListChecks, Play, Send, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState, ListSkeleton, PageHeader } from "@/components/app-shell";
import { PhotoPicker } from "@/components/photo-picker";
import { SignedPhoto } from "@/components/signed-photo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuthUser } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  holdIdleLogout,
  isIdleLogoutHeld,
  releaseIdleLogout,
} from "@/lib/session-hygiene";
import { jobStatusChipClass } from "@/lib/status-colors";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({
    meta: [
      { title: "Jobs — Keyward" },
      { name: "description", content: "Your assigned jobs and tasks." },
      { property: "og:title", content: "Jobs — Keyward" },
      { property: "og:description", content: "Your assigned jobs and tasks." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JobsPage,
});

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "submitted" | "done";
  due_at: string | null;
  cleaning_job_id: string | null;
  proof_photo_path: string | null;
  source: string | null;
};

function useCountdown(dueAt: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!dueAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [dueAt]);
  if (!dueAt) return null;
  const ms = new Date(dueAt).getTime() - now;
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const mins = Math.floor(abs / 60000);
  const secs = Math.floor((abs % 60000) / 1000);
  return { overdue, label: `${mins}:${secs.toString().padStart(2, "0")}` };
}

function JobsPage() {
  const t = useT();
  const { data: user } = useAuthUser();
  const qc = useQueryClient();

  const tasksQ = useQuery({
    queryKey: ["my-jobs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, description, status, due_at, cleaning_job_id, proof_photo_path, source",
        )
        .eq("assigned_to_user_id", user!.id)
        .neq("status", "done")
        .order("due_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as Task[];
    },
    refetchInterval: 30_000,
  });

  const accept = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ status: "in_progress" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Hold the 15-min idle logout while the user is actively working on a task.
      holdIdleLogout();
      qc.invalidateQueries({ queryKey: ["my-jobs", user?.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const submit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ status: "submitted" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Release the hold: the 15-minute inactivity clock resumes.
      releaseIdleLogout();
      qc.invalidateQueries({ queryKey: ["my-jobs", user?.id] });
      toast.success(t("common.saved"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  // If the user reloads with an in-progress task and no hold, re-acquire it.
  useEffect(() => {
    const anyInProgress = (tasksQ.data ?? []).some((task) => task.status === "in_progress");
    if (anyInProgress && !isIdleLogoutHeld()) holdIdleLogout();
  }, [tasksQ.data]);

  const rows = tasksQ.data ?? [];

  return (
    <>
      <PageHeader title={t("nav.jobs")} />
      {tasksQ.isLoading ? (
        <ListSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="grid gap-3">
          {rows.map((task, index) => (
            <TaskCard
              key={task.id}
              index={index}
              task={task}
              onAccept={() => accept.mutate(task.id)}
              onSubmit={() => submit.mutate(task.id)}
            />
          ))}
        </section>
      )}
    </>
  );
}

function TaskCard({
  task,
  index,
  onAccept,
  onSubmit,
}: {
  task: Task;
  index: number;
  onAccept: () => void;
  onSubmit: () => void;
}) {
  const t = useT();
  const countdown = useCountdown(task.due_at);
  const [proof, setProof] = useState<string | null>(task.proof_photo_path);
  const [saveProof, setSaveProof] = useState(false);

  const savePhoto = async (path: string | null) => {
    setProof(path);
    setSaveProof(true);
    const { error } = await supabase
      .from("tasks")
      .update({ proof_photo_path: path })
      .eq("id", task.id);
    setSaveProof(false);
    if (error) toast.error(error.message);
  };

  return (
    <article className="surface space-y-2 animate-card-enter p-3 transition-shadow hover:shadow-[var(--shadow-lift)] sm:space-y-3 sm:p-4" style={{ animationDelay: `${index * 40}ms` }}>
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-base font-medium">{task.title}</h3>
        <span className={jobStatusChipClass(task.status)}>
          {task.status === "in_progress"
            ? t("task.inProgress")
            : task.status === "submitted"
              ? t("task.submitted")
              : t("task.pending")}
        </span>
        {countdown && (
          <span
            className={`inline-flex items-center gap-1 text-xs ${
              countdown.overdue ? "font-medium text-destructive" : "text-muted-foreground"
            }`}
          >
            <Timer className="h-3.5 w-3.5" aria-hidden="true" />
            {countdown.overdue ? `-${countdown.label}` : countdown.label}
          </span>
        )}
      </header>
      {task.description && (
        <p className="text-sm text-muted-foreground">{task.description}</p>
      )}

      {task.cleaning_job_id && (
        <ChecklistPanel jobId={task.cleaning_job_id} readOnly={task.status !== "in_progress"} />
      )}

      {task.status !== "pending" && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
            {t("task.proof")}
          </p>
          {task.status === "in_progress" ? (
            <PhotoPicker
              value={proof}
              onChange={savePhoto}
              folder="task-proof"
              label={t("task.proof")}
            />
          ) : proof ? (
            <SignedPhoto path={proof} alt={t("task.proof")} className="h-32 w-full rounded-md object-cover" />
          ) : (
            <p className="text-xs text-muted-foreground">{t("task.noProof")}</p>
          )}
        </div>
      )}

      <footer className="flex flex-wrap justify-end gap-2">
        {task.status === "pending" && (
          <Button size="sm" onClick={onAccept}>
            <Play className="h-4 w-4" aria-hidden="true" />
            {t("task.accept")}
          </Button>
        )}
        {task.status === "in_progress" && (
          <Button size="sm" disabled={saveProof} onClick={onSubmit}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {t("task.submit")}
          </Button>
        )}
        {task.status === "submitted" && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t("task.submitted")}
          </span>
        )}
      </footer>
    </article>
  );
}

function ChecklistPanel({ jobId, readOnly }: { jobId: string; readOnly: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const itemsQ = useQuery({
    queryKey: ["job-items", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_job_items")
        .select("id, description, is_checked, photo_url, sort_order")
        .eq("cleaning_job_id", jobId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const toggle = useMutation({
    mutationFn: async (item: { id: string; is_checked: boolean }) => {
      const { error } = await supabase
        .from("cleaning_job_items")
        .update({ is_checked: item.is_checked })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-items", jobId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const setPhoto = useMutation({
    mutationFn: async (item: { id: string; photo_url: string | null }) => {
      const { error } = await supabase
        .from("cleaning_job_items")
        .update({ photo_url: item.photo_url })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-items", jobId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const items = itemsQ.data ?? [];
  if (items.length === 0) return null;

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="rounded-md border border-border p-3 text-sm">
          <label className="flex items-start gap-2">
            <Checkbox
              checked={item.is_checked}
              disabled={readOnly}
              onCheckedChange={(v) =>
                toggle.mutate({ id: item.id, is_checked: v === true })
              }
            />
            <span className="min-w-0 flex-1">{item.description}</span>
          </label>
          {!readOnly && (
            <div className="mt-2">
              <PhotoPicker
                value={item.photo_url}
                onChange={(path) => setPhoto.mutate({ id: item.id, photo_url: path })}
                folder="job-item"
                label={t("task.proof")}
              />
            </div>
          )}
          {readOnly && item.photo_url && (
            <SignedPhoto
              path={item.photo_url}
              alt={item.description}
              className="mt-2 h-24 w-full rounded-md object-cover"
            />
          )}
        </li>
      ))}
    </ul>
  );
}
