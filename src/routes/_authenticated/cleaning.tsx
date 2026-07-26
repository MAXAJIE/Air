import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Eye, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { PhotoPicker } from "@/components/photo-picker";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useActiveGroup } from "@/hooks/use-app";
import { useGroupMembers, type GroupMember } from "@/hooks/use-group-members";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { jobStatusChipClass, statusChipClass } from "@/lib/status-colors";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cleaning")({
  head: () => ({
    meta: [
      { title: "Cleaning — Keyward" },
      { name: "description", content: "Checklist templates and photo-verified cleaning jobs." },
      { property: "og:title", content: "Cleaning — Keyward" },
      { property: "og:description", content: "Checklist templates and photo-verified cleaning jobs." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CleaningPage,
});

function CleaningPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t("clean.title")} />
      <Tabs defaultValue="jobs">
        <TabsList>
          <TabsTrigger value="jobs">{t("clean.jobs")}</TabsTrigger>
          <TabsTrigger value="templates">{t("clean.templates")}</TabsTrigger>
        </TabsList>
        <TabsContent value="jobs" className="mt-4">
          <JobsPanel />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}

type JobStatus = "pending" | "in_progress" | "submitted" | "reviewed";

type JobRow = {
  id: string;
  status: JobStatus;
  property_id: string;
  template_id: string | null;
  scheduled_at: string | null;
  assigned_to_user_id: string | null;
  started_at: string | null;
  completed_at: string | null;
};

/** ISO timestamp -> value accepted by <input type="datetime-local">. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** Copy the template's steps onto a job so later template edits never rewrite history. */
async function snapshotTemplate(jobId: string, templateId: string) {
  const { data: items, error } = await supabase
    .from("cleaning_template_items")
    .select("description, sort_order")
    .eq("template_id", templateId)
    .order("sort_order");
  if (error) throw error;
  if (!items?.length) return;
  const { error: insertError } = await supabase.from("cleaning_job_items").insert(
    items.map((item, index) => ({
      cleaning_job_id: jobId,
      description: item.description,
      sort_order: item.sort_order ?? index + 1,
    })),
  );
  if (insertError) throw insertError;
}

function JobsPanel() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const [propertyId, setPropertyId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [assignType, setAssignType] = useState<"direct" | "hr_company">("direct");
  const [assignee, setAssignee] = useState("");
  const [hrCompanyId, setHrCompanyId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [editingJob, setEditingJob] = useState<JobRow | null>(null);
  const [previewJob, setPreviewJob] = useState<JobRow | null>(null);

  const propsQ = useQuery({
    queryKey: ["properties", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, default_template_id")
        .eq("owner_group_id", groupId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const templatesQ = useQuery({
    queryKey: ["templates", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_templates")
        .select("id, name")
        .eq("owner_group_id", groupId!);
      if (error) throw error;
      return data;
    },
  });

  // Cleaners AND workers of this group can take a clean.
  const cleanersQ = useGroupMembers(groupId, ["cleaner", "worker"]);

  // HR companies affiliated with this group
  const hrCompaniesQ = useQuery({
    queryKey: ["hr-affiliations-select", groupId],
    enabled: !!groupId && assignType === "hr_company",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_affiliations")
        .select("hr_company_user_id")
        .eq("owner_group_id", groupId!)
        .eq("status", "active");
      if (error) throw error;
      if (!data?.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username")
        .in("user_id", data.map((h) => h.hr_company_user_id));
      return data.map((h) => ({
        userId: h.hr_company_user_id,
        name:
          profiles?.find((p) => p.user_id === h.hr_company_user_id)?.display_name ||
          profiles?.find((p) => p.user_id === h.hr_company_user_id)?.username ||
          h.hr_company_user_id.slice(0, 8),
      }));
    },
  });

  const jobsQ = useQuery({
    queryKey: ["jobs", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_jobs")
        .select(
          "id, status, property_id, template_id, scheduled_at, assigned_to_user_id, started_at, completed_at",
        )
        .eq("owner_group_id", groupId!)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data as JobRow[];
    },
  });

  // A clean is only schedulable once time, cleaner, property and template are all set.
  const missing: string[] = [];
  if (!propertyId) missing.push(t("clean.property"));
  if (!templateId) missing.push(t("clean.template"));
  if (assignType === "direct" && !assignee) missing.push(t("clean.assignDirect"));
  if (assignType === "hr_company" && !hrCompanyId) missing.push(t("clean.assignHr"));
  if (!scheduledAt) missing.push(t("clean.scheduledAt"));
  const canCreate = missing.length === 0;

  const createJob = useMutation({
    mutationFn: async () => {
      if (!canCreate) throw new Error(`${t("clean.jobIncomplete")} ${missing.join(", ")}`);
      const insertData: Record<string, unknown> = {
        owner_group_id: groupId!,
        property_id: propertyId,
        template_id: templateId,
        scheduled_at: new Date(scheduledAt).toISOString(),
        status: "pending",
      };
      if (assignType === "direct") {
        insertData.assigned_via = "direct";
        insertData.assigned_to_user_id = assignee;
      } else {
        insertData.assigned_via = "hr_request";
        insertData.assigned_hr_company_id = hrCompanyId;
      }
      const { data: job, error } = await supabase
        .from("cleaning_jobs")
        .insert(insertData as never)
        .select("id")
        .single();
      if (error) throw error;
      await snapshotTemplate(job.id, templateId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["jobs", groupId] });
      await qc.invalidateQueries({ queryKey: ["tasks", groupId] });
      setPropertyId("");
      setTemplateId("");
      setAssignType("direct");
      setAssignee("");
      setHrCompanyId("");
      setScheduledAt("");
      toast.success(t("clean.jobCreated"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const review = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cleaning_jobs").update({ status: "reviewed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["jobs", groupId] });
      await qc.invalidateQueries({ queryKey: ["tasks", groupId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const removeJob = useMutation({
    mutationFn: async (job: JobRow) => {
      if (job.status !== "pending") throw new Error(t("clean.jobLocked"));
      const { error } = await supabase.from("cleaning_jobs").delete().eq("id", job.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["jobs", groupId] });
      await qc.invalidateQueries({ queryKey: ["tasks", groupId] });
      toast.success(t("clean.jobDeleted"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const propertyName = (id: string) => propsQ.data?.find((p) => p.id === id)?.name ?? "—";
  const cleanerName = (id: string | null) =>
    id ? (cleanersQ.data?.find((c) => c.user_id === id)?.name ?? id.slice(0, 8)) : t("common.unassigned");

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
      <section className="surface space-y-4 p-5">
        <h2 className="text-lg">{t("clean.newJob")}</h2>
        <div className="space-y-2">
          <Label>{t("clean.property")}</Label>
          <Select
            value={propertyId}
            onValueChange={(value) => {
              setPropertyId(value);
              const fallback = propsQ.data?.find((p) => p.id === value)?.default_template_id;
              if (!templateId && fallback) setTemplateId(fallback);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("clean.property")} />
            </SelectTrigger>
            <SelectContent>
              {(propsQ.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("clean.template")}</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger>
              <SelectValue placeholder={t("clean.template")} />
            </SelectTrigger>
            <SelectContent>
              {(templatesQ.data ?? []).map((tpl) => (
                <SelectItem key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("clean.instanceNote")}</p>
        </div>
        {/* Assign type toggle */}
        <div className="space-y-2">
          <Label>{t("clean.assignTo")}</Label>
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => { setAssignType("direct"); setHrCompanyId(""); }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                assignType === "direct" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
              {t("clean.assignDirect")}
            </button>
            <button
              type="button"
              onClick={() => { setAssignType("hr_company"); setAssignee(""); }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                assignType === "hr_company" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t("clean.assignHr")}
            </button>
          </div>
        </div>

        {assignType === "direct" ? (
          <div className="space-y-2">
            <Label>{t("clean.assignDirect")}</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger>
                <SelectValue placeholder={t("clean.assignTo")} />
              </SelectTrigger>
              <SelectContent>
                {(cleanersQ.data ?? []).map((c) => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(cleanersQ.data ?? []).length === 0 && !cleanersQ.isLoading && (
              <p className="text-xs text-muted-foreground">{t("clean.noCleaners")}</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label>{t("clean.assignHr")}</Label>
            <Select value={hrCompanyId} onValueChange={setHrCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder={t("clean.assignHr")} />
              </SelectTrigger>
              <SelectContent>
                {(hrCompaniesQ.data ?? []).map((h) => (
                  <SelectItem key={h.userId} value={h.userId}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(hrCompaniesQ.data ?? []).length === 0 && !hrCompaniesQ.isLoading && (
              <p className="text-xs text-muted-foreground">{t("people.companies")}</p>
            )}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="sched">{t("clean.scheduledAt")}</Label>
          <Input
            id="sched"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>
        {!canCreate && (
          <p className="text-xs text-muted-foreground">
            {t("clean.jobIncomplete")} {missing.join(", ")}
          </p>
        )}
        <Button
          className="w-full"
          disabled={!canCreate || createJob.isPending}
          onClick={() => createJob.mutate()}
        >
          {t("clean.newJob")}
        </Button>
      </section>

      <section className="surface p-5">
        <h2 className="mb-1 text-lg">{t("clean.jobs")}</h2>
        <p className="mb-3 text-xs text-muted-foreground">{t("clean.jobsMirrored")}</p>
        <ul className="divide-y divide-border text-sm">
          {(jobsQ.data ?? []).map((j) => (
            <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{propertyName(j.property_id)}</span>
                  <span className={statusChipClass("blue")}>{t("task.fromCleaning")}</span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  {j.scheduled_at ? new Date(j.scheduled_at).toLocaleString() : "—"} ·{" "}
                  {cleanerName(j.assigned_to_user_id)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={jobStatusChipClass(j.status)}>
                  {t(`clean.status.${j.status}`)}
                </span>
                {j.status === "submitted" && (
                  <Button size="sm" variant="outline" onClick={() => review.mutate(j.id)}>
                    {t("clean.review")}
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label={t("tpl.preview")}
                  onClick={() => setPreviewJob(j)}
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label={t("common.edit")}
                  disabled={j.status !== "pending"}
                  title={j.status === "pending" ? t("common.edit") : t("clean.jobLocked")}
                  onClick={() => setEditingJob(j)}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label={t("common.delete")}
                  disabled={j.status !== "pending" || removeJob.isPending}
                  title={j.status === "pending" ? t("common.delete") : t("clean.jobLocked")}
                  onClick={() => {
                    if (window.confirm(t("clean.jobDeleteConfirm"))) removeJob.mutate(j);
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </span>
            </li>
          ))}
          {(jobsQ.data ?? []).length === 0 && (
            <li className="py-6 text-center text-muted-foreground">{t("common.none")}</li>
          )}
        </ul>
      </section>

      {editingJob && (
        <JobEditDialog
          job={editingJob}
          groupId={groupId!}
          properties={propsQ.data ?? []}
          templates={templatesQ.data ?? []}
          cleaners={cleanersQ.data ?? []}
          onClose={() => setEditingJob(null)}
        />
      )}
      {previewJob && (
        <JobPreviewDialog
          job={previewJob}
          propertyName={propertyName(previewJob.property_id)}
          cleanerName={cleanerName(previewJob.assigned_to_user_id)}
          onClose={() => setPreviewJob(null)}
        />
      )}
    </div>
  );
}

/** Pending jobs stay fully editable; once a cleaner starts, the job is frozen. */
function JobEditDialog({
  job,
  groupId,
  properties,
  templates,
  cleaners,
  onClose,
}: {
  job: JobRow;
  groupId: string;
  properties: Array<{ id: string; name: string }>;
  templates: Array<{ id: string; name: string }>;
  cleaners: GroupMember[];
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [propertyId, setPropertyId] = useState(job.property_id);
  const [templateId, setTemplateId] = useState(job.template_id ?? "");
  const [assignee, setAssignee] = useState(job.assigned_to_user_id ?? "");
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(job.scheduled_at));

  const complete = Boolean(propertyId && templateId && assignee && scheduledAt);

  const save = useMutation({
    mutationFn: async () => {
      if (!complete) throw new Error(t("clean.jobIncomplete"));
      const { error } = await supabase
        .from("cleaning_jobs")
        .update({
          property_id: propertyId,
          template_id: templateId,
          assigned_to_user_id: assignee,
          scheduled_at: new Date(scheduledAt).toISOString(),
        })
        .eq("id", job.id);
      if (error) throw error;

      // A different template means a fresh snapshot of the steps.
      if (templateId !== (job.template_id ?? "")) {
        const { error: deleteError } = await supabase
          .from("cleaning_job_items")
          .delete()
          .eq("cleaning_job_id", job.id);
        if (deleteError) throw deleteError;
        await snapshotTemplate(job.id, templateId);
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["jobs", groupId] });
      await qc.invalidateQueries({ queryKey: ["tasks", groupId] });
      await qc.invalidateQueries({ queryKey: ["job-items", job.id] });
      toast.success(t("common.saved"));
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("clean.editJob")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("clean.property")}</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger>
                <SelectValue placeholder={t("clean.property")} />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("clean.template")}</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder={t("clean.template")} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("clean.assignDirect")}</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger>
                <SelectValue placeholder={t("clean.assignDirect")} />
              </SelectTrigger>
              <SelectContent>
                {cleaners.map((c) => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-sched">{t("clean.scheduledAt")}</Label>
            <Input
              id="edit-sched"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!complete || save.isPending} onClick={() => save.mutate()}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JobPreviewDialog({
  job,
  propertyName,
  cleanerName,
  onClose,
}: {
  job: JobRow;
  propertyName: string;
  cleanerName: string;
  onClose: () => void;
}) {
  const t = useT();
  const itemsQ = useQuery({
    queryKey: ["job-items", job.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_job_items")
        .select("id, description, is_checked, sort_order")
        .eq("cleaning_job_id", job.id)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("clean.jobPreview")}</DialogTitle>
        </DialogHeader>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("clean.property")}</dt>
            <dd className="text-right font-medium">{propertyName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("clean.assignDirect")}</dt>
            <dd className="text-right font-medium">{cleanerName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("clean.scheduledAt")}</dt>
            <dd className="text-right font-medium">
              {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t("common.status")}</dt>
            <dd>
              <span className={jobStatusChipClass(job.status)}>{t(`clean.status.${job.status}`)}</span>
            </dd>
          </div>
        </dl>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("clean.checklist")}</p>
          <ol className="space-y-2">
            {(itemsQ.data ?? []).map((item, index) => (
              <li key={item.id} className="rounded-lg border border-border p-3 text-sm">
                <span className="font-medium">
                  {index + 1}. {item.description}
                </span>
                {item.is_checked && (
                  <span className={`ml-2 ${statusChipClass("green")}`}>{t("clean.itemDone")}</span>
                )}
              </li>
            ))}
            {(itemsQ.data ?? []).length === 0 && (
              <li className="py-4 text-center text-sm text-muted-foreground">{t("tpl.empty")}</li>
            )}
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type TemplateItem = {
  id: string;
  description: string;
  notes: string | null;
  requires_photo: boolean;
  sort_order: number;
};

type DraftItem = { key: string; description: string; notes: string; requires_photo: boolean };

function TemplatesPanel() {
  const t = useT();
  const [kind, setKind] = useState<"cleaning" | "amenity">("cleaning");

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setKind("cleaning")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm transition-colors",
            kind === "cleaning" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          {t("tpl.kindCleaning")}
        </button>
        <button
          type="button"
          onClick={() => setKind("amenity")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm transition-colors",
            kind === "amenity" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          {t("tpl.kindAmenity")}
        </button>
      </div>
      {kind === "cleaning" ? <CleaningTemplatesPanel /> : <AmenityTemplatesPanel />}
    </div>
  );
}

type AmenityDraft = {
  key: string;
  name: string;
  expected_qty: string;
  notes: string;
  image_path: string | null;
};

/**
 * Amenity checklists are group-level templates, exactly like cleaning checklists.
 * The one difference: every amenity item can carry a reference photo.
 */
function AmenityTemplatesPanel() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [applyTo, setApplyTo] = useState<Record<string, string>>({});

  const templatesQ = useQuery({
    queryKey: ["amenity-templates", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amenity_templates")
        .select("id, name, amenity_template_items(id)")
        .eq("owner_group_id", groupId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const propsQ = useQuery({
    queryKey: ["properties", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, default_template_id")
        .eq("owner_group_id", groupId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("amenity_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["amenity-templates", groupId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const apply = useMutation({
    mutationFn: async ({ templateId, propertyId }: { templateId: string; propertyId: string }) => {
      const { error } = await supabase.rpc("apply_amenity_template", {
        p_property: propertyId,
        p_template: templateId,
        p_replace: true,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["amenities"] });
      toast.success(t("amen.applied"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg">{t("amen.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("amen.help")}</p>
        </div>
        <Button onClick={() => setEditing({ id: null })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("amen.new")}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(templatesQ.data ?? []).map((tpl) => (
          <article key={tpl.id} className="surface flex flex-col gap-3 p-5">
            <div>
              <h3 className="truncate font-medium">{tpl.name}</h3>
              <p className="text-xs text-muted-foreground">
                {(tpl.amenity_template_items as unknown as unknown[])?.length ?? 0} {t("tpl.itemCount")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setPreviewId(tpl.id)}>
                <Eye className="h-4 w-4" aria-hidden="true" />
                {t("tpl.preview")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing({ id: tpl.id })}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                {t("common.edit")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("common.delete")}
                onClick={() => {
                  if (window.confirm(t("amen.deleteConfirm"))) remove.mutate(tpl.id);
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="mt-auto space-y-2 border-t border-border pt-3">
              <Label className="text-xs text-muted-foreground">{t("amen.applyTo")}</Label>
              <div className="flex gap-2">
                <Select
                  value={applyTo[tpl.id] ?? ""}
                  onValueChange={(value) => setApplyTo((prev) => ({ ...prev, [tpl.id]: value }))}
                >
                  <SelectTrigger className="min-w-0 flex-1">
                    <SelectValue placeholder={t("clean.property")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(propsQ.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!applyTo[tpl.id] || apply.isPending}
                  onClick={() => {
                    const propertyId = applyTo[tpl.id];
                    if (!propertyId) return;
                    if (window.confirm(t("amen.applyConfirm")))
                      apply.mutate({ templateId: tpl.id, propertyId });
                  }}
                >
                  {t("amen.apply")}
                </Button>
              </div>
            </div>
          </article>
        ))}
        {(templatesQ.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">{t("common.none")}</p>
        )}
      </div>

      {editing && groupId && (
        <AmenityTemplateDialog
          templateId={editing.id}
          groupId={groupId}
          onClose={() => setEditing(null)}
        />
      )}
      {previewId && (
        <AmenityTemplatePreview templateId={previewId} onClose={() => setPreviewId(null)} />
      )}
    </section>
  );
}

function useAmenityTemplateItems(templateId: string | null) {
  return useQuery({
    queryKey: ["amenity-template-items", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amenity_template_items")
        .select("id, name, expected_qty, notes, image_path, sort_order")
        .eq("template_id", templateId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

function AmenityTemplateDialog({
  templateId,
  groupId,
  onClose,
}: {
  templateId: string | null;
  groupId: string;
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const existing = useAmenityTemplateItems(templateId);
  const [name, setName] = useState("");
  const [items, setItems] = useState<AmenityDraft[]>([]);
  const [hydrated, setHydrated] = useState(templateId === null);

  const nameQ = useQuery({
    queryKey: ["amenity-template", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amenity_templates")
        .select("name")
        .eq("id", templateId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (hydrated || !templateId) return;
    if (nameQ.data && existing.data) {
      setName(nameQ.data.name);
      setItems(
        existing.data.map((i) => ({
          key: i.id,
          name: i.name,
          expected_qty: String(i.expected_qty),
          notes: i.notes ?? "",
          image_path: i.image_path,
        })),
      );
      setHydrated(true);
    }
  }, [hydrated, templateId, nameQ.data, existing.data]);

  const save = useMutation({
    mutationFn: async () => {
      let id = templateId;
      if (id) {
        const { error } = await supabase
          .from("amenity_templates")
          .update({ name: name.trim() })
          .eq("id", id);
        if (error) throw error;
        const { error: deleteError } = await supabase
          .from("amenity_template_items")
          .delete()
          .eq("template_id", id);
        if (deleteError) throw deleteError;
      } else {
        const { data, error } = await supabase
          .from("amenity_templates")
          .insert({ owner_group_id: groupId, name: name.trim() })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      }
      const rows = items
        .filter((i) => i.name.trim())
        .map((i, index) => ({
          template_id: id!,
          name: i.name.trim(),
          expected_qty: Number(i.expected_qty) || 0,
          notes: i.notes.trim() || null,
          image_path: i.image_path,
          sort_order: index + 1,
        }));
      if (rows.length) {
        const { error } = await supabase.from("amenity_template_items").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["amenity-templates", groupId] });
      await qc.invalidateQueries({ queryKey: ["amenity-template-items", templateId] });
      toast.success(t("common.saved"));
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{templateId ? t("amen.edit") : t("amen.new")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amen-name">{t("clean.templateName")}</Label>
            <Input id="amen-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t("amen.items")}</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setItems((prev) => [
                    ...prev,
                    {
                      key: crypto.randomUUID(),
                      name: "",
                      expected_qty: "1",
                      notes: "",
                      image_path: null,
                    },
                  ])
                }
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("amen.addItem")}
              </Button>
            </div>

            {items.length === 0 && (
              <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                {t("tpl.empty")}
              </p>
            )}

            {items.map((item, index) => (
              <div key={item.key} className="rounded-lg border border-border p-3">
                <div className="flex items-start gap-3">
                  <span className="mt-2 w-5 shrink-0 text-xs text-muted-foreground">{index + 1}.</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]">
                      <Input
                        value={item.name}
                        placeholder={t("prop.amenityName")}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((row) =>
                              row.key === item.key ? { ...row, name: e.target.value } : row,
                            ),
                          )
                        }
                      />
                      <Input
                        type="number"
                        min={0}
                        value={item.expected_qty}
                        aria-label={t("prop.expected")}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((row) =>
                              row.key === item.key ? { ...row, expected_qty: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </div>
                    <Textarea
                      rows={2}
                      value={item.notes}
                      placeholder={t("tpl.itemNotes")}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((row) =>
                            row.key === item.key ? { ...row, notes: e.target.value } : row,
                          ),
                        )
                      }
                    />
                    <PhotoPicker
                      value={item.image_path}
                      folder="amenities"
                      label={t("amen.addImage")}
                      onChange={(path) =>
                        setItems((prev) =>
                          prev.map((row) => (row.key === item.key ? { ...row, image_path: path } : row)),
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    aria-label={t("common.delete")}
                    onClick={() => setItems((prev) => prev.filter((row) => row.key !== item.key))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AmenityTemplatePreview({
  templateId,
  onClose,
}: {
  templateId: string;
  onClose: () => void;
}) {
  const t = useT();
  const itemsQ = useAmenityTemplateItems(templateId);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("tpl.preview")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("amen.previewHelp")}</p>
        <ul className="space-y-2">
          {(itemsQ.data ?? []).map((item) => (
            <li key={item.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
              {item.image_path && (
                <SignedPhoto
                  path={item.image_path}
                  alt={item.name}
                  className="h-14 w-14 shrink-0 rounded-md object-cover"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("prop.expected")}: {item.expected_qty}
                </span>
                {item.notes && <span className="mt-1 block text-xs text-muted-foreground">{item.notes}</span>}
              </span>
            </li>
          ))}
          {(itemsQ.data ?? []).length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">{t("tpl.empty")}</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function CleaningTemplatesPanel() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const templatesQ = useQuery({
    queryKey: ["templates", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_templates")
        .select("id, name, cleaning_template_items(id)")
        .eq("owner_group_id", groupId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cleaning_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates", groupId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg">{t("tpl.title")}</h2>
        <Button onClick={() => setEditing({ id: null })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("tpl.new")}
        </Button>
      </div>


      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(templatesQ.data ?? []).map((tpl) => (
          <article key={tpl.id} className="surface flex flex-col gap-3 p-5">
            <div>
              <h3 className="truncate font-medium">{tpl.name}</h3>
              <p className="text-xs text-muted-foreground">
                {(tpl.cleaning_template_items as unknown as unknown[])?.length ?? 0} {t("tpl.itemCount")}
              </p>
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setPreviewId(tpl.id)}>
                <Eye className="h-4 w-4" aria-hidden="true" />
                {t("tpl.preview")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing({ id: tpl.id })}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                {t("common.edit")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm(t("tpl.deleteConfirm"))) remove.mutate(tpl.id);
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </article>
        ))}
        {(templatesQ.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">{t("common.none")}</p>
        )}
      </div>

      {editing && (
        <TemplateDialog
          templateId={editing.id}
          onClose={() => setEditing(null)}
          groupId={groupId!}
        />
      )}
      {previewId && <TemplatePreview templateId={previewId} onClose={() => setPreviewId(null)} />}
    </section>
  );
}

function useTemplateItems(templateId: string | null) {
  return useQuery({
    queryKey: ["template-items", templateId],
    enabled: !!templateId,
    queryFn: async (): Promise<TemplateItem[]> => {
      const { data, error } = await supabase
        .from("cleaning_template_items")
        .select("id, description, notes, requires_photo, sort_order")
        .eq("template_id", templateId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

function TemplateDialog({
  templateId,
  groupId,
  onClose,
}: {
  templateId: string | null;
  groupId: string;
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const existing = useTemplateItems(templateId);
  const [name, setName] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [hydrated, setHydrated] = useState(templateId === null);

  const nameQ = useQuery({
    queryKey: ["template", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_templates")
        .select("name")
        .eq("id", templateId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (hydrated || !templateId) return;
    if (nameQ.data && existing.data) {
      setName(nameQ.data.name);
      setItems(
        existing.data.map((i) => ({
          key: i.id,
          description: i.description,
          notes: i.notes ?? "",
          requires_photo: i.requires_photo,
        })),
      );
      setHydrated(true);
    }
  }, [hydrated, templateId, nameQ.data, existing.data]);

  const save = useMutation({
    mutationFn: async () => {
      let id = templateId;
      if (id) {
        const { error } = await supabase
          .from("cleaning_templates")
          .update({ name: name.trim() })
          .eq("id", id);
        if (error) throw error;
        const { error: delError } = await supabase
          .from("cleaning_template_items")
          .delete()
          .eq("template_id", id);
        if (delError) throw delError;
      } else {
        const { data, error } = await supabase
          .from("cleaning_templates")
          .insert({ owner_group_id: groupId, name: name.trim() })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      }
      const rows = items
        .filter((i) => i.description.trim())
        .map((i, index) => ({
          template_id: id!,
          description: i.description.trim(),
          notes: i.notes.trim() || null,
          requires_photo: i.requires_photo,
          sort_order: index + 1,
        }));
      if (rows.length) {
        const { error } = await supabase.from("cleaning_template_items").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["templates", groupId] });
      await qc.invalidateQueries({ queryKey: ["template-items", templateId] });
      toast.success(t("common.saved"));
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{templateId ? t("tpl.edit") : t("tpl.new")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tpl-name">{t("clean.templateName")}</Label>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t("tpl.items")}</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setItems((prev) => [
                    ...prev,
                    { key: crypto.randomUUID(), description: "", notes: "", requires_photo: false },
                  ])
                }
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("tpl.addItem")}
              </Button>
            </div>

            {items.length === 0 && (
              <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                {t("tpl.empty")}
              </p>
            )}

            {items.map((item, index) => (
              <div key={item.key} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-2 w-5 shrink-0 text-xs text-muted-foreground">{index + 1}.</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      value={item.description}
                      placeholder={t("tpl.itemLabel")}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((row) =>
                            row.key === item.key ? { ...row, description: e.target.value } : row,
                          ),
                        )
                      }
                    />
                    <Textarea
                      rows={2}
                      value={item.notes}
                      placeholder={t("tpl.itemNotes")}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((row) => (row.key === item.key ? { ...row, notes: e.target.value } : row)),
                        )
                      }
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={item.requires_photo}
                        onCheckedChange={(checked) =>
                          setItems((prev) =>
                            prev.map((row) =>
                              row.key === item.key ? { ...row, requires_photo: checked === true } : row,
                            ),
                          )
                        }
                      />
                      {t("tpl.requiresPhoto")}
                    </label>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    aria-label={t("common.delete")}
                    onClick={() => setItems((prev) => prev.filter((row) => row.key !== item.key))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatePreview({ templateId, onClose }: { templateId: string; onClose: () => void }) {
  const t = useT();
  const itemsQ = useTemplateItems(templateId);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("tpl.preview")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("tpl.previewHelp")}</p>
        <ol className="space-y-2">
          {(itemsQ.data ?? []).map((item, index) => (
            <li key={item.id} className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium">
                {index + 1}. {item.description}
              </p>
              {item.notes && <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>}
              {item.requires_photo && (
                <p className="mt-2 inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                  {t("tpl.requiresPhoto")}
                </p>
              )}
            </li>
          ))}
          {(itemsQ.data ?? []).length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">{t("tpl.empty")}</li>
          )}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

