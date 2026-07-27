import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ListChecks, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ListSkeleton, PageHeader } from "@/components/app-shell";
import { SignedPhoto } from "@/components/signed-photo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useActiveGroup, useProfile } from "@/hooks/use-app";
import { useGroupMembers } from "@/hooks/use-group-members";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { jobStatusChipClass, statusChipClass } from "@/lib/status-colors";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — Keyward" },
      { name: "description", content: "Assign, track and approve tasks across your property team." },
      { property: "og:title", content: "Tasks — Keyward" },
      {
        property: "og:description",
        content: "Assign, track and approve tasks across your property team.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TasksPage,
});

type TaskStatus = "pending" | "in_progress" | "submitted" | "done";

const FILTERS: Array<TaskStatus | "all"> = ["all", "pending", "in_progress", "submitted", "done"];

function TasksPage() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const { data: profile } = useProfile();
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const isOwner = profile?.primary_role === "owner";

  const tasksQ = useQuery({
    queryKey: ["tasks", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, description, status, due_at, source, is_private, assigned_to_user_id, property_id, cleaning_job_id, proof_photo_path, created_at",
        )
        .eq("owner_group_id", groupId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const peopleQ = useGroupMembers(groupId);

  const templatesQ = useQuery({
    queryKey: ["templates", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_templates")
        .select("id, name")
        .eq("owner_group_id", groupId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

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

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", groupId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", groupId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const nameOf = (userId: string | null) => {
    if (!userId) return t("common.unassigned");
    return (peopleQ.data ?? []).find((p) => p.user_id === userId)?.name ?? userId.slice(0, 8);
  };

  const tasks = (tasksQ.data ?? []).filter((task) => filter === "all" || task.status === filter);
  const openTask = (tasksQ.data ?? []).find((task) => task.id === openId) ?? null;

  return (
    <>
      <PageHeader title={t("task.title")} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? "secondary" : "ghost"}
              onClick={() => setFilter(value)}
            >
              {value === "all"
                ? t("task.filterAll")
                : value === "in_progress"
                  ? t("task.inProgress")
                  : value === "submitted"
                    ? t("task.submitted")
                    : value === "done"
                      ? t("task.done")
                      : t("task.pending")}
            </Button>
          ))}
        </div>
        {isOwner && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("task.create")}
          </Button>
        )}
      </div>

      {tasksQ.isLoading ? (
        <ListSkeleton rows={5} />
      ) : (
      <section className="surface divide-y divide-border">
        {tasks.map((task, index) => (
          <article key={task.id} className="flex flex-wrap items-center gap-2 p-3 sm:gap-3 sm:p-4 animate-card-enter transition-colors hover:bg-accent/40" style={{ animationDelay: `${index * 40}ms` }}>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  className="truncate text-left text-sm font-medium underline-offset-4 hover:underline"
                  onClick={() => setOpenId(task.id)}
                >
                  {task.title}
                </button>
                <span
                  className={`shrink-0 ${statusChipClass(task.source === "cleaning" ? "blue" : "slate")}`}
                >
                  {task.source === "cleaning" ? t("task.fromCleaning") : t("task.manual")}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {nameOf(task.assigned_to_user_id)}
                {task.property_id
                  ? ` · ${propsQ.data?.find((p) => p.id === task.property_id)?.name ?? ""}`
                  : ""}
                {task.due_at ? ` · ${t("task.due")} ${new Date(task.due_at).toLocaleDateString()}` : ""}
              </span>
            </span>

            <span className={`shrink-0 ${jobStatusChipClass(task.status)}`}>
              {task.status === "in_progress"
                ? t("task.inProgress")
                : task.status === "submitted"
                  ? t("task.submitted")
                  : task.status === "done"
                    ? t("task.done")
                    : t("task.pending")}
            </span>

            {isOwner && task.status === "submitted" && (
              <Button size="sm" onClick={() => setStatus.mutate({ id: task.id, status: "done" })}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {t("task.approve")}
              </Button>
            )}
            {isOwner && task.status === "done" && task.source !== "cleaning" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStatus.mutate({ id: task.id, status: "pending" })}
              >
                {t("task.reopen")}
              </Button>
            )}
            {isOwner && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("common.delete")}
                onClick={() => {
                  if (window.confirm(t("task.deleteConfirm"))) remove.mutate(task.id);
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </article>
        ))}
        {tasks.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">{t("common.none")}</p>
        )}
      </section>
      )}

      {creating && groupId && profile && (
        <CreateTaskDialog
          groupId={groupId}
          createdBy={profile.user_id}
          people={(peopleQ.data ?? []).map((p) => ({
            userId: p.user_id,
            name: p.name,
            roles: p.roles,
          }))}
          properties={propsQ.data ?? []}
          templates={templatesQ.data ?? []}
          onClose={() => setCreating(false)}
        />
      )}

      {openTask && (
        <TaskDetailDialog
          task={openTask}
          assignee={nameOf(openTask.assigned_to_user_id)}
          isOwner={isOwner}
          onApprove={() => {
            setStatus.mutate({ id: openTask.id, status: "done" });
            setOpenId(null);
          }}
          onReopen={() => {
            setStatus.mutate({ id: openTask.id, status: "pending" });
            setOpenId(null);
          }}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

type CreatePerson = { userId: string; name: string; roles: string[] };
type CreateTemplate = { id: string; name: string };

const DURATION_OPTIONS = Array.from({ length: 24 }, (_, i) => (i + 1) * 5); // 5..120 min

function CreateTaskDialog({
  groupId,
  createdBy,
  people,
  properties,
  templates,
  onClose,
}: {
  groupId: string;
  createdBy: string;
  people: CreatePerson[];
  properties: Array<{ id: string; name: string }>;
  templates: CreateTemplate[];
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [jobType, setJobType] = useState<"normal" | "cleaning">("normal");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [propertyId, setPropertyId] = useState<string>("none");
  const [dueAt, setDueAt] = useState("");
  const [durationMin, setDurationMin] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [isPrivate, setIsPrivate] = useState(false);

  // Normal tasks: worker-role assignees only. Cleaning: cleaner-role only.
  const allowedRoles = jobType === "cleaning" ? ["cleaner"] : ["worker"];
  const eligiblePeople = people.filter((p) =>
    p.roles.some((r) => allowedRoles.includes(r)),
  );

  // Reset assignee when jobType flips so the picker never carries a hidden id.
  const onJobTypeChange = (next: "normal" | "cleaning") => {
    setJobType(next);
    setAssignee("");
  };

  // "When do you want the job done?" — quick-pick maps to due_at from now.
  const resolvedDueAt = () => {
    if (durationMin) return new Date(Date.now() + Number(durationMin) * 60_000).toISOString();
    return dueAt ? new Date(dueAt).toISOString() : null;
  };

  const create = useMutation({
    mutationFn: async () => {
      if (jobType === "cleaning") {
        // Materialise a cleaning job + its checklist items so cleaners see the
        // template's steps in "My jobs". A companion task row (source=cleaning)
        // is created below so both surfaces show the same amount.
        if (!templateId) throw new Error("Pick a cleaning template");
        const propertyIdVal = propertyId === "none" ? null : propertyId;
        if (!propertyIdVal) throw new Error("A property must be selected for cleaning jobs");
        const { data: template, error: tErr } = await supabase
          .from("cleaning_templates")
          .select("id, name, cleaning_template_items ( description, sort_order, requires_photo )")
          .eq("id", templateId)
          .single();
        if (tErr) throw tErr;
        const scheduled = scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString();
        const { data: job, error: jErr } = await supabase
          .from("cleaning_jobs")
          .insert({
            owner_group_id: groupId,
            property_id: propertyIdVal!, // cleaning_jobs requires a non-null property_id
            template_id: templateId,
            scheduled_at: scheduled,
            assigned_to_user_id: assignee || null,
            status: "pending",
          })
          .select("id")
          .single();
        if (jErr) throw jErr;
        const items = (template?.cleaning_template_items ?? []) as Array<{
          description: string;
          sort_order: number;
          requires_photo: boolean | null;
        }>;
        if (items.length > 0) {
          const { error: iErr } = await supabase.from("cleaning_job_items").insert(
            items.map((it) => ({
              cleaning_job_id: job!.id,
              description: it.description,
              sort_order: it.sort_order,
              is_checked: false,
              // Freeze the template's per-item photo requirement on the job.
              requires_photo: it.requires_photo ?? false,
            })),
          );
          if (iErr) throw iErr;
        }
        const { error } = await supabase.from("tasks").insert({
          owner_group_id: groupId,
          created_by_user_id: createdBy,
          assigned_to_user_id: assignee || null,
          property_id: propertyIdVal,
          title: (title.trim() || template?.name) ?? "Cleaning",
          description: description.trim() || null,
          due_at: resolvedDueAt(),
          is_private: false,
          source: "cleaning",
          cleaning_job_id: job!.id,
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("tasks").insert({
        owner_group_id: groupId,
        created_by_user_id: createdBy,
        assigned_to_user_id: assignee || null,
        property_id: propertyId === "none" ? null : propertyId,
        title: title.trim(),
        description: description.trim() || null,
        due_at: resolvedDueAt(),
        is_private: isPrivate,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tasks", groupId] });
      toast.success(t("common.saved"));
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("task.create")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Job type</Label>
            <Select value={jobType} onValueChange={(v) => onJobTypeChange(v as "normal" | "cleaning")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal task</SelectItem>
                <SelectItem value="cleaning">Cleaning task</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-title">{t("common.name")}</Label>
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-desc">{t("common.notes")}</Label>
            <Textarea
              id="task-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("task.assignee")}</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger>
                <SelectValue placeholder={t("task.pickAssignee")} />
              </SelectTrigger>
              <SelectContent>
                {eligiblePeople.length === 0 && (
                  <SelectItem value="__none" disabled>
                    {jobType === "cleaning" ? "No cleaners in this group" : "No workers in this group"}
                  </SelectItem>
                )}
                {eligiblePeople.map((p) => (
                  <SelectItem key={p.userId} value={p.userId}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("prop.title")}</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("common.unassigned")}</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {jobType === "cleaning" && (
            <>
              <div className="space-y-2">
                <Label>Checklist template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.length === 0 && (
                      <SelectItem value="__none" disabled>
                        No cleaning templates yet
                      </SelectItem>
                    )}
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-scheduled">When to execute</Label>
                <Input
                  id="task-scheduled"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label>When do you want the job done?</Label>
            <Select value={durationMin} onValueChange={setDurationMin}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Custom / no deadline</SelectItem>
                {DURATION_OPTIONS.map((min) => (
                  <SelectItem key={min} value={String(min)}>
                    {min} min
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Sets a countdown from now. Overrides the manual due date below.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-due">{t("task.due")}</Label>
            <Input
              id="task-due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              disabled={!!durationMin}
            />
          </div>
          {jobType === "normal" && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isPrivate} onCheckedChange={(v) => setIsPrivate(v === true)} />
              {t("task.private")}
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
            {t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskDetailDialog({
  task,
  assignee,
  isOwner,
  onApprove,
  onReopen,
  onClose,
}: {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: TaskStatus;
    source: string | null;
    cleaning_job_id: string | null;
    proof_photo_path: string | null;
  };
  assignee: string;
  isOwner: boolean;
  onApprove: () => void;
  onReopen: () => void;
  onClose: () => void;
}) {
  const t = useT();

  const itemsQ = useQuery({
    queryKey: ["job-items", task.cleaning_job_id],
    enabled: !!task.cleaning_job_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_job_items")
        .select("id, description, is_checked, photo_url, sort_order, requires_photo")
        .eq("cleaning_job_id", task.cleaning_job_id!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const photos = [
    ...(task.proof_photo_path ? [task.proof_photo_path] : []),
    ...((itemsQ.data ?? []).map((i) => i.photo_url).filter(Boolean) as string[]),
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{assignee}</p>
          {task.description && <p className="text-sm">{task.description}</p>}

          {task.cleaning_job_id && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <ListChecks className="h-4 w-4" aria-hidden="true" />
                {t("task.checklist")}
              </p>
              <ul className="space-y-2">
                {(itemsQ.data ?? []).map((item) => (
                  <li key={item.id} className="rounded-md border border-border p-3 text-sm">
                    <span className="flex items-center gap-2">
                      <Checkbox checked={item.is_checked} disabled />
                      <span className="min-w-0 truncate">{item.description}</span>
                      {item.requires_photo && (
                        <span
                          className={
                            "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium " +
                            (item.photo_url
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-400")
                          }
                        >
                          {item.photo_url ? t("task.photoDone") : t("task.photoRequired")}
                        </span>
                      )}
                    </span>
                    {item.photo_url && (
                      <SignedPhoto
                        path={item.photo_url}
                        alt={item.description}
                        className="mt-2 h-32 w-full rounded-md object-cover"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">{t("task.proof")}</p>
            {photos.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("task.noProof")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {photos.map((path) => (
                  <SignedPhoto
                    key={path}
                    path={path}
                    alt={t("task.proof")}
                    className="h-32 w-full rounded-md object-cover"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        {isOwner && (task.status === "submitted" || task.status === "done") && (
          <DialogFooter>
            {task.status === "submitted" && (
              <Button onClick={onApprove}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {t("task.approve")}
              </Button>
            )}
            {task.status === "done" && task.source !== "cleaning" && (
              <Button variant="outline" onClick={onReopen}>
                {t("task.reopen")}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
