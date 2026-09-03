import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ChevronLeft, ChevronRight, Lightbulb, List, ListChecks, PartyPopper, Play, Send, Timer, Wand2 } from "lucide-react";
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

type JobItem = {
  id: string;
  description: string;
  is_checked: boolean;
  notes: string | null;
  photo_url: string | null;
  sort_order: number;
  requires_photo: boolean;
};

/**
 * Fetch a job's checklist items. Shared between the checklist UI and the
 * submit-gate so both surfaces read the same cached data (React Query
 * de-dupes by queryKey — no double network hit).
 */
function useJobItems(jobId: string | null) {
  return useQuery({
    queryKey: ["job-items", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_job_items")
        .select("id, description, is_checked, notes, photo_url, sort_order, requires_photo")
        .eq("cleaning_job_id", jobId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as JobItem[];
    },
  });
}

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

  // Block submission while any checklist item that requires a photo is
  // still missing one. The gate applies only during the cleaner's active
  // pass (status === "in_progress"), matching when photos can be uploaded.
  const itemsQ = useJobItems(task.cleaning_job_id);
  const missingRequiredPhotos = (itemsQ.data ?? []).filter(
    (i) => i.requires_photo && !i.photo_url,
  );
  const submitBlocked =
    task.status === "in_progress" && missingRequiredPhotos.length > 0;

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
          <>
            {submitBlocked && (
              <span className="w-full text-right text-xs text-amber-600 dark:text-amber-400">
                {t("task.photoBlocking").replace(
                  "{n}",
                  String(missingRequiredPhotos.length),
                )}
              </span>
            )}
            <Button
              size="sm"
              disabled={saveProof || submitBlocked}
              onClick={onSubmit}
              title={submitBlocked ? t("task.photoBlockingShort") : undefined}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {t("task.submit")}
            </Button>
          </>
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
  const itemsQ = useJobItems(jobId);
   // Guided mode is the default for live work: one step at a time removes the
  // "wall of checkboxes" and lets the tip for that step do the teaching.
  const [guided, setGuided] = useState(true);
  const [step, setStep] = useState(0);

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

  const done = items.filter((i) => i.is_checked).length;
  const progress = Math.round((done / items.length) * 100);
  const current = items[Math.min(step, items.length - 1)]!;

  const photoBadge = (item: JobItem) =>
    item.requires_photo ? (
      <span
        className={
          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium " +
          (item.photo_url
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : "bg-amber-500/10 text-amber-700 dark:text-amber-400")
        }
      >
        {item.photo_url ? t("task.photoDone") : t("task.photoRequired")}
      </span>
    ) : null;


  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {done}/{items.length}
        </span>
        {!readOnly && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0"
            onClick={() => setGuided((v) => !v)}
          >
            {guided ? <List className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
            {guided ? t("clean.items") : t("task.guide")}
          </Button>
        )}
      </div>

      {done === items.length && (
        <p className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500/10 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <PartyPopper className="h-4 w-4" aria-hidden="true" />
          {t("task.allDone")}
        </p>
      )}

      {guided && !readOnly ? (
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">
            {t("task.step")} {Math.min(step, items.length - 1) + 1} {t("task.of")} {items.length}
          </p>
          <p className="mt-1 flex items-start gap-2 text-base font-medium">
            <span className="min-w-0 flex-1">{current.description}</span>
            {photoBadge(current)}
          </p>
          {current.notes && (
            <p className="mt-2 flex items-start gap-2 rounded-md bg-muted/60 p-2 text-sm text-muted-foreground">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {current.notes}
            </p>
          )}
          <div className="mt-3">
            <PhotoPicker
              value={current.photo_url}
              onChange={(path) => setPhoto.mutate({ id: current.id, photo_url: path })}
              folder="job-item"
              label={t("task.proof")}
            />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={step === 0}
              onClick={() => setStep((v) => Math.max(0, v - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              {t("task.prev")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1"
              onClick={() => {
               if (!current.is_checked) toggle.mutate({ id: current.id, is_checked: true });
                setStep((v) => Math.min(items.length - 1, v + 1));
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              {current.is_checked ? t("task.next") : t("task.markDone")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={step >= items.length - 1}
              onClick={() => setStep((v) => Math.min(items.length - 1, v + 1))}
              aria-label={t("task.next")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={item.id} className="rounded-md border border-border p-3 text-sm">
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={item.is_checked}
                  disabled={readOnly}
                  onCheckedChange={(v) => {
                    setStep(index);
                    toggle.mutate({ id: item.id, is_checked: v === true });
                  }}
                />
                <span className="min-w-0 flex-1">{item.description}</span>
                {photoBadge(item)}
              </label>
              {item.notes && (
                <p className="mt-1 pl-6 text-xs text-muted-foreground">{item.notes}</p>
              )}
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
      )}
    </div>
  );
}
