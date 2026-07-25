import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
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
import { useActiveGroup } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

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

function JobsPanel() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const [propertyId, setPropertyId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [assignee, setAssignee] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

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

  const cleanersQ = useQuery({
    queryKey: ["cleaners", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("user_id, profiles:profiles!memberships_user_id_fkey(display_name, username)")
        .eq("owner_group_id", groupId!)
        .eq("role", "cleaner")
        .eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  const jobsQ = useQuery({
    queryKey: ["jobs", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_jobs")
        .select("id, status, property_id, scheduled_at, assigned_to_user_id, started_at, completed_at")
        .eq("owner_group_id", groupId!)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createJob = useMutation({
    mutationFn: async () => {
      const tpl = templateId || propsQ.data?.find((p) => p.id === propertyId)?.default_template_id;
      const { data: job, error } = await supabase
        .from("cleaning_jobs")
        .insert({
          owner_group_id: groupId!,
          property_id: propertyId,
          template_id: tpl ?? null,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          assigned_to_user_id: assignee || null,
          status: "pending",
        })
        .select("id")
        .single();
      if (error) throw error;

      // Snapshot the template into job items so later template edits never mutate history.
      if (tpl) {
        const { data: items } = await supabase
          .from("cleaning_template_items")
          .select("description")
          .eq("template_id", tpl);
        if (items?.length) {
          await supabase
            .from("cleaning_job_items")
            .insert(items.map((i) => ({ cleaning_job_id: job.id, description: i.description })));
        }
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["jobs", groupId] });
      setPropertyId("");
      setTemplateId("");
      setAssignee("");
      setScheduledAt("");
      toast.success(t("common.saved"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const review = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cleaning_jobs").update({ status: "reviewed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs", groupId] }),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
      <section className="surface space-y-4 p-5">
        <h2 className="text-lg">{t("clean.newJob")}</h2>
        <div className="space-y-2">
          <Label>{t("clean.property")}</Label>
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger>
              <SelectValue placeholder={t("common.unassigned")} />
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
              <SelectValue placeholder={t("common.unassigned")} />
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
        <div className="space-y-2">
          <Label>{t("clean.assignDirect")}</Label>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger>
              <SelectValue placeholder={t("common.unassigned")} />
            </SelectTrigger>
            <SelectContent>
              {(cleanersQ.data ?? []).map((c) => {
                const p = c.profiles as unknown as
                  | { display_name: string | null; username: string }
                  | null;
                return (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    {p?.display_name || p?.username || c.user_id.slice(0, 8)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sched">{t("clean.scheduledAt")}</Label>
          <Input
            id="sched"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>
        <Button className="w-full" disabled={!propertyId || createJob.isPending} onClick={() => createJob.mutate()}>
          {t("clean.newJob")}
        </Button>
      </section>

      <section className="surface p-5">
        <h2 className="mb-3 text-lg">{t("clean.jobs")}</h2>
        <ul className="divide-y divide-border text-sm">
          {(jobsQ.data ?? []).map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {propsQ.data?.find((p) => p.id === j.property_id)?.name ?? "—"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {j.scheduled_at ? new Date(j.scheduled_at).toLocaleString() : "—"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                  {t(`clean.status.${j.status as "pending"}`)}
                </span>
                {j.status === "submitted" && (
                  <Button size="sm" variant="outline" onClick={() => review.mutate(j.id)}>
                    {t("clean.review")}
                  </Button>
                )}
              </span>
            </li>
          ))}
          {(jobsQ.data ?? []).length === 0 && (
            <li className="py-6 text-center text-muted-foreground">{t("common.none")}</li>
          )}
        </ul>
      </section>
    </div>
  );
}

function TemplatesPanel() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [itemLabel, setItemLabel] = useState("");

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
      return data;
    },
  });

  const itemsQ = useQuery({
    queryKey: ["template-items", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_template_items")
        .select("id, description, sort_order")
        .eq("template_id", selected!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const createTemplate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("cleaning_templates")
        .insert({ owner_group_id: groupId!, name: name.trim() });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["templates", groupId] });
      setName("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const addItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cleaning_template_items").insert({
        template_id: selected!,
        description: itemLabel.trim(),
        sort_order: (itemsQ.data?.length ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["template-items", selected] });
      setItemLabel("");
    },
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cleaning_template_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template-items", selected] }),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="surface space-y-3 p-5">
        <h2 className="text-lg">{t("clean.templates")}</h2>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("clean.templateName")}
          />
          <Button disabled={!name.trim() || createTemplate.isPending} onClick={() => createTemplate.mutate()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <ul className="divide-y divide-border text-sm">
          {(templatesQ.data ?? []).map((tpl) => (
            <li key={tpl.id}>
              <button
                type="button"
                onClick={() => setSelected(tpl.id)}
                className={`w-full truncate px-1 py-2.5 text-left ${selected === tpl.id ? "font-semibold text-primary" : ""}`}
              >
                {tpl.name}
              </button>
            </li>
          ))}
          {(templatesQ.data ?? []).length === 0 && (
            <li className="py-6 text-center text-muted-foreground">{t("common.none")}</li>
          )}
        </ul>
      </section>

      <section className="surface space-y-3 p-5">
        <h2 className="text-lg">{t("clean.items")}</h2>
        {!selected ? (
          <p className="text-sm text-muted-foreground">{t("common.none")}</p>
        ) : (
          <>
            <div className="flex gap-2">
              <Input
                value={itemLabel}
                onChange={(e) => setItemLabel(e.target.value)}
                placeholder={t("clean.addItem")}
              />
              <Button disabled={!itemLabel.trim() || addItem.isPending} onClick={() => addItem.mutate()}>
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <ul className="divide-y divide-border text-sm">
              {(itemsQ.data ?? []).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate">{i.description}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("common.delete")}
                    onClick={() => removeItem.mutate(i.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
