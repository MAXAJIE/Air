import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ListChecks, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
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
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

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

  const peopleQ = useQuery({
    queryKey: ["group-people", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("user_id, role, profiles:profiles!memberships_user_id_fkey(display_name, username)")
        .eq("owner_group_id", groupId!)
        .eq("status", "active");
      if (error) throw error;
      return data;
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
    const row = (peopleQ.data ?? []).find((p) => p.user_id === userId);
    const p = row?.profiles as unknown as { display_name: string | null; username: string } | null;
    return p?.display_name || p?.username || userId.slice(0, 8);
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

      <section className="surface divide-y divide-border">
        {tasks.map((task) => (
          <article key={task.id} className="flex flex-wrap items-center gap-3 p-4">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  className="truncate text-left text-sm font-medium underline-offset-4 hover:underline"
                  onClick={() => setOpenId(task.id)}
                >
                  {task.title}
                </button>
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
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

            <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs">
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
            {isOwner && task.status === "done" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStatus.mutate({ id: task.id, status: "pending" })}
              >
                {t("task.reopen")}
              </Button>
            )}
            {isOwner && task.source !== "cleaning" && (
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

      {creating && groupId && profile && (
        <CreateTaskDialog
          groupId={groupId}
          createdBy={profile.user_id}
          people={(peopleQ.data ?? []).map((p) => ({ userId: p.user_id, name: nameOf(p.user_id) }))}
          properties={propsQ.data ?? []}
          onClose={() => setCreating(false)}
        />
      )}

      {openTask && (
        <TaskDetailDialog
          task={openTask}
          assignee={nameOf(openTask.assigned_to_user_id)}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

function CreateTaskDialog({
  groupId,
  createdBy,
  people,
  properties,
  onClose,
}: {
  groupId: string;
  createdBy: string;
  people: Array<{ userId: string; name: string }>;
  properties: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [propertyId, setPropertyId] = useState<string>("none");
  const [dueAt, setDueAt] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tasks").insert({
        owner_group_id: groupId,
        created_by_user_id: createdBy,
        assigned_to_user_id: assignee || null,
        property_id: propertyId === "none" ? null : propertyId,
        title: title.trim(),
        description: description.trim() || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
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
                {people.map((p) => (
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
          <div className="space-y-2">
            <Label htmlFor="task-due">{t("task.due")}</Label>
            <Input
              id="task-due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isPrivate} onCheckedChange={(v) => setIsPrivate(v === true)} />
            {t("task.private")}
          </label>
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
  onClose,
}: {
  task: {
    id: string;
    title: string;
    description: string | null;
    cleaning_job_id: string | null;
    proof_photo_path: string | null;
  };
  assignee: string;
  onClose: () => void;
}) {
  const t = useT();

  const itemsQ = useQuery({
    queryKey: ["job-items", task.cleaning_job_id],
    enabled: !!task.cleaning_job_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_job_items")
        .select("id, description, is_checked, photo_url, sort_order")
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
      </DialogContent>
    </Dialog>
  );
}
