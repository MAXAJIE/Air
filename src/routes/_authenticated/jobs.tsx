import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  List,
  ListChecks,
  PartyPopper,
  Play,
  Send,
  Timer,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState, ListSkeleton, PageHeader } from "@/components/app-shell";
import { PhotoPicker } from "@/components/photo-picker";
import { SignedPhoto } from "@/components/signed-photo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthUser } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { formatDuration, tickInterval } from "@/lib/duration";
import {
  holdIdleLogout,
  isIdleLogoutHeld,
  releaseIdleLogout,
} from "@/lib/session-hygiene";
import { jobStatusChipClass } from "@/lib/status-colors";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({
    meta: [
      { title: "My jobs — Keyward" },
      { name: "description", content: "Your assigned jobs and tasks." },
      { property: "og:title", content: "My jobs — Keyward" },
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

type SortKey = "due" | "status" | "name";

/** Order used by the "status" sort: work to do first, finished work last. */
const STATUS_WEIGHT: Record<Task["status"], number> = {
  in_progress: 0,
  pending: 1,
  submitted: 2,
  done: 3,
};

/**
 * Fetch a job's checklist items. Shared between the checklist UI, the
 * accept-card preview and the submit gate, so every surface reads the same
 * cached data (React Query de-dupes by queryKey — no double network hit).
 */
function useJobItems(jobId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["job-items", jobId],
    enabled: !!jobId && enabled,
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

/**
 * Live countdown to a deadline, in human units ("2d 4h", "35m", "45s").
 * `running` is false once the job is submitted or approved — finished work
 * must not keep ticking.
 */
function useCountdown(dueAt: string | null, running: boolean) {
  const [now, setNow] = useState(() => Date.now());

  const ms = dueAt ? new Date(dueAt).getTime() - now : 0;
  const interval = tickInterval(ms);

  useEffect(() => {
    if (!dueAt || !running) return;
    const id = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(id);
    // Re-arming on the interval bucket (not on `ms`) keeps the timer stable.
  }, [dueAt, running, interval]);

  if (!dueAt) return null;
  return { overdue: ms < 0, label: formatDuration(ms), running };
}

function DueLine({ task }: { task: Task }) {
  const t = useT();
  const running = task.status === "pending" || task.status === "in_progress";
  const countdown = useCountdown(task.due_at, running);
  if (!task.due_at) return null;

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      <span>
        {t("task.due")} {new Date(task.due_at).toLocaleString()}
      </span>
      {countdown && (
        <span
          className={`inline-flex items-center gap-1 ${
            countdown.running && countdown.overdue ? "font-medium text-destructive" : ""
          }`}
        >
          <Timer className="h-3.5 w-3.5" aria-hidden="true" />
          {!countdown.running
            ? t("task.timerStopped")
            : countdown.overdue
              ? `${t("task.overdueBy")} ${countdown.label}`
              : `${countdown.label} ${t("task.left")}`}
        </span>
      )}
    </p>
  );
}

function StatusChip({ status }: { status: Task["status"] }) {
  const t = useT();
  return (
    <span className={jobStatusChipClass(status)}>
      {status === "in_progress"
        ? t("task.inProgress")
        : status === "submitted"
          ? t("task.submitted")
          : status === "done"
            ? t("task.done")
            : t("task.pending")}
    </span>
  );
}

function JobsPage() {
  const t = useT();
  const { data: user } = useAuthUser();
  const qc = useQueryClient();
  const [sort, setSort] = useState<SortKey>("due");

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
      // Hold the idle logout while the user is actively working on a task.
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
      // Release the hold: the inactivity clock resumes.
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

  const rows = useMemo(() => {
    const list = [...(tasksQ.data ?? [])];
    const byDue = (a: Task, b: Task) => {
      if (!a.due_at && !b.due_at) return 0;
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return a.due_at.localeCompare(b.due_at);
    };
    if (sort === "name") list.sort((a, b) => a.title.localeCompare(b.title) || byDue(a, b));
    else if (sort === "status")
      list.sort((a, b) => STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status] || byDue(a, b));
    else list.sort(byDue);
    return list;
  }, [tasksQ.data, sort]);

  return (
    <>
      <PageHeader title={t("nav.jobs")} />

      {rows.length > 0 && (
        <div className="mb-3 flex justify-end">
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-8 w-[180px] text-xs" aria-label={t("task.sortBy")}>
              <SelectValue placeholder={t("task.sortBy")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due">{t("task.sortDue")}</SelectItem>
              <SelectItem value="status">{t("task.sortStatus")}</SelectItem>
              <SelectItem value="name">{t("task.sortName")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {tasksQ.isLoading ? (
        <ListSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="grid gap-2">
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
  const style = { animationDelay: `${index * 40}ms` };
  if (task.status === "pending") return <OfferCard task={task} style={style} onAccept={onAccept} />;
  if (task.status === "in_progress")
    return <ActiveCard task={task} style={style} onSubmit={onSubmit} />;
  return <FinishedCard task={task} style={style} />;
}

/**
 * Not accepted yet: a small widget with the job name, how many steps it has
 * and the step names only. The full brief (tips, photo pickers) appears once
 * the cleaner accepts.
 */
function OfferCard({
  task,
  style,
  onAccept,
}: {
  task: Task;
  style: React.CSSProperties;
  onAccept: () => void;
}) {
  const t = useT();
  const itemsQ = useJobItems(task.cleaning_job_id);
  const items = itemsQ.data ?? [];

  return (
    <article
      className="surface animate-card-enter space-y-2 p-3 transition-shadow hover:shadow-[var(--shadow-lift)]"
      style={style}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</h3>
        <StatusChip status={task.status} />
      </header>
      <DueLine task={task} />

      {items.length > 0 && (
        <div className="rounded-md bg-muted/50 p-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
            {t("task.stepCount").replace("{n}", String(items.length))}
          </p>
          <ol className="mt-1 space-y-0.5 text-xs">
            {items.map((item, i) => (
              <li key={item.id} className="truncate">
                {i + 1}. {item.description}
              </li>
            ))}
          </ol>
        </div>
      )}

      <footer className="flex justify-end">
        <Button size="sm" onClick={onAccept}>
          <Play className="h-4 w-4" aria-hidden="true" />
          {t("task.accept")}
        </Button>
      </footer>
    </article>
  );
}

/** Accepted and being worked on: the full brief. */
function ActiveCard({
  task,
  style,
  onSubmit,
}: {
  task: Task;
  style: React.CSSProperties;
  onSubmit: () => void;
}) {
  const t = useT();
  const itemsQ = useJobItems(task.cleaning_job_id);
  const missingRequiredPhotos = (itemsQ.data ?? []).filter(
    (i) => i.requires_photo && !i.photo_url,
  );
  const submitBlocked = missingRequiredPhotos.length > 0;

  return (
    <article
      className="surface animate-card-enter space-y-2 p-3 transition-shadow hover:shadow-[var(--shadow-lift)] sm:p-4"
      style={style}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium sm:text-base">{task.title}</h3>
        <StatusChip status={task.status} />
      </header>
      <DueLine task={task} />
      {task.description && (
        <p className="text-xs text-muted-foreground sm:text-sm">{task.description}</p>
      )}

      {task.cleaning_job_id && <ChecklistPanel jobId={task.cleaning_job_id} readOnly={false} />}

      <footer className="flex flex-wrap items-center justify-end gap-2">
        {submitBlocked && (
          <span className="w-full text-right text-xs text-amber-600 dark:text-amber-400">
            {t("task.photoBlocking").replace("{n}", String(missingRequiredPhotos.length))}
          </span>
        )}
        <Button
          size="sm"
          disabled={submitBlocked}
          onClick={onSubmit}
          title={submitBlocked ? t("task.photoBlockingShort") : undefined}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {t("task.submit")}
        </Button>
      </footer>
    </article>
  );
}

/**
 * Submitted or approved: collapsed to a one-line widget (name + status).
 * The countdown is stopped and the checklist sits behind a toggle, so a day
 * of finished work does not fill the screen.
 */
function FinishedCard({ task, style }: { task: Task; style: React.CSSProperties }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="surface animate-card-enter p-2.5" style={style}>
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <CheckCircle2
          className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
        <StatusChip status={task.status} />
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-t border-border pt-2">
          <DueLine task={task} />
          {task.cleaning_job_id && <ChecklistPanel jobId={task.cleaning_job_id} readOnly />}
        </div>
      )}
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
