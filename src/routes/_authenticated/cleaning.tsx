import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
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
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
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
      {kind === "cleaning" ? <CleaningTemplatesPanel /> : <AmenityChecklistPanel />}
    </div>
  );
}

/** Amenity baselines, grouped per property — the counting half of a checklist. */
function AmenityChecklistPanel() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const [propertyId, setPropertyId] = useState<string>("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");

  const propsQ = useQuery({
    queryKey: ["properties", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name")
        .eq("owner_group_id", groupId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const selected = propertyId || propsQ.data?.[0]?.id || "";

  const amenitiesQ = useQuery({
    queryKey: ["amenities", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amenity_definitions")
        .select("id, name, expected_qty")
        .eq("property_id", selected)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("amenity_definitions").insert({
        property_id: selected,
        name: name.trim(),
        expected_qty: Number(qty) || 0,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["amenities", selected] });
      setName("");
      setQty("1");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("amenity_definitions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["amenities", selected] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <section className="surface space-y-4 p-5">
      <div>
        <h2 className="text-lg">{t("tpl.amenityTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("tpl.amenityHelp")}</p>
      </div>

      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor="amenity-property">{t("clean.property")}</Label>
        <Select value={selected} onValueChange={setPropertyId}>
          <SelectTrigger id="amenity-property">
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

      {selected ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem_auto] gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("prop.amenityName")}
            />
            <Input
              type="number"
              min={0}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              aria-label={t("prop.expected")}
            />
            <Button disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("prop.addAmenity")}
            </Button>
          </div>
          <ul className="divide-y divide-border text-sm">
            {(amenitiesQ.data ?? []).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate">{a.name}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-muted-foreground">
                    {t("prop.expected")}: {a.expected_qty}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("common.delete")}
                    onClick={() => remove.mutate(a.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </span>
              </li>
            ))}
            {(amenitiesQ.data ?? []).length === 0 && (
              <li className="py-6 text-center text-muted-foreground">{t("common.none")}</li>
            )}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("common.none")}</p>
      )}
    </section>
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

