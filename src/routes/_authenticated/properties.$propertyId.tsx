import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Trash2, Copy, ExternalLink, ListChecks, Plus, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ListSkeleton, PageHeader } from "@/components/app-shell";
import { ColorPickerPopover } from "@/components/color-picker-popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { useActiveGroup, useProfile } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { statusChipClass } from "@/lib/status-colors";

export const Route = createFileRoute("/_authenticated/properties/$propertyId")({
  head: () => ({
    meta: [
      { title: "Property detail — Keyward" },
      { name: "description", content: "Status, guest access code and amenity baseline for one listing." },
      { property: "og:title", content: "Property detail — Keyward" },
      {
        property: "og:description",
        content: "Status, guest access code and amenity baseline for one listing.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PropertyDetail,
  errorComponent: ErrorView,
  notFoundComponent: () => <p className="text-sm text-muted-foreground">Not found.</p>,
});

function ErrorView({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="surface space-y-3 p-6">
      <p role="alert" className="text-sm">
        {error.message}
      </p>
      <Button
        size="sm"
        onClick={() => {
          reset();
          router.invalidate();
        }}
      >
        Retry
      </Button>
    </div>
  );
}

function PropertyDetail() {
  const t = useT();
  const { data: profile, isLoading: profileLoading } = useProfile();

  // Only owners may open a property record; other roles work from jobs and tasks.
  if (!profileLoading && profile && profile.primary_role !== "owner") {
    return (
      <div className="surface space-y-1 p-6">
        <h1 className="text-lg">{t("prop.ownerOnly")}</h1>
        <p className="text-sm text-muted-foreground">{t("prop.ownerOnlyHelp")}</p>
      </div>
    );
  }

  return <PropertyDetailView />;
}

function PropertyDetailView() {
  const t = useT();
  const qc = useQueryClient();
  const { propertyId } = Route.useParams();
  const navigate = useNavigate();
  const { groupId } = useActiveGroup();
  const [statusLabel, setStatusLabel] = useState("");
  const [statusSettings, setStatusSettings] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");

  const propertyQ = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, address, access_code, status_id, default_template_id, owner_group_id")
        .eq("id", propertyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const statusesQ = useQuery({
    queryKey: ["property-statuses", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_statuses")
        .select("id, label, sort_order, color")
        .eq("owner_group_id", groupId!)
        .order("sort_order");
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
        .eq("owner_group_id", groupId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const patch = useMutation({
    mutationFn: async (values: {
      status_id?: string | null;
      default_template_id?: string | null;
      name?: string;
      address?: string | null;
    }) => {
      const { error } = await supabase.from("properties").update(values).eq("id", propertyId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["property", propertyId] });
      toast.success(t("common.saved"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const setStatusColor = useMutation({
    mutationFn: async (values: { id: string; color: string }) => {
      const { error } = await supabase
        .from("property_statuses")
        .update({ color: values.color })
        .eq("id", values.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["property-statuses", groupId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const renameStatus = useMutation({
    mutationFn: async (values: { id: string; label: string }) => {
      const { error } = await supabase
        .from("property_statuses")
        .update({ label: values.label })
        .eq("id", values.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["property-statuses", groupId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const deleteStatus = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("property_statuses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["property-statuses", groupId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const removeProperty = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("properties").delete().eq("id", propertyId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["properties", groupId] });
      toast.success(t("common.saved"));
      navigate({ to: "/properties" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const addStatus = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("property_statuses").insert({
        owner_group_id: groupId!,
        label: statusLabel.trim(),
        sort_order: (statusesQ.data?.length ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["property-statuses", groupId] });
      setStatusLabel("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const property = propertyQ.data;
  const guestLink =
    typeof window !== "undefined" && property
      ? `${window.location.origin}/g/${property.access_code ?? ""}`
      : "";

  if (propertyQ.isLoading) {
    return (
      <>
        <Link
          to="/properties"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("common.back")}
        </Link>
        <PageHeader title={t("prop.title")} />
        <div className="grid gap-4 lg:grid-cols-2">
          <ListSkeleton rows={3} />
          <ListSkeleton rows={2} />
        </div>
      </>
    );
  }

  return (
    <>
      <Link
        to="/properties"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("common.back")}
      </Link>

      <PageHeader
        title={property?.name ?? t("prop.title")}
        description={property?.address ?? undefined}
        action={
          <div className="flex items-center gap-2">
            {property?.access_code ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(guestLink, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {t("prop.guestLink")}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditName(property?.name ?? "");
                setEditAddress(property?.address ?? "");
                setEditOpen(true);
              }}
            >
              {t("prop.edit")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={removeProperty.isPending}
              onClick={() => {
                if (typeof window !== "undefined" && !window.confirm(t("prop.deleteConfirm"))) return;
                removeProperty.mutate();
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t("common.delete")}
            </Button>
          </div>
        }
      />

      {editOpen ? (
        <section className="surface mb-4 space-y-3 p-5">
          <h2 className="text-lg">{t("prop.edit")}</h2>
          <div className="space-y-2">
            <Label htmlFor="pd-name">{t("common.name")}</Label>
            <Input id="pd-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pd-address">{t("prop.address")}</Label>
            <Input id="pd-address" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button
              disabled={!editName.trim() || patch.isPending}
              onClick={async () => {
                await patch.mutateAsync({
                  name: editName.trim(),
                  address: editAddress.trim() || null,
                });
                setEditOpen(false);
              }}
            >
              {t("common.save")}
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface space-y-4 p-5">
          <h2 className="text-lg">{t("common.status")}</h2>
          <Select
            value={property?.status_id ?? undefined}
            onValueChange={(v) => patch.mutate({ status_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("common.unassigned")} />
            </SelectTrigger>
            <SelectContent>
              {(statusesQ.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Input
              value={statusLabel}
              onChange={(e) => setStatusLabel(e.target.value)}
              placeholder={t("prop.addStatus")}
            />
            <Button
              variant="outline"
              disabled={!statusLabel.trim() || addStatus.isPending}
              onClick={() => addStatus.mutate()}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {/* Labels stay one-tap editable; colour and clean-up live behind the
              gear so renaming a status is not buried in swatches. */}
          <ul className="space-y-2">
            {(statusesQ.data ?? []).map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <Input
                  defaultValue={s.label}
                  className="h-8 flex-1"
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim();
                    if (v && v !== s.label) renameStatus.mutate({ id: s.id, label: v });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={t("prop.statusSettings")}
                  onClick={() => setStatusSettings(s.id)}
                >
                  <Settings2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>

          {(statusesQ.data ?? [])
            .filter((s) => s.id === statusSettings)
            .map((s) => (
              <Dialog key={s.id} open onOpenChange={() => setStatusSettings(null)}>
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle>{s.label}</DialogTitle>
                  </DialogHeader>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{t("color.title")}</span>
                    <ColorPickerPopover
                      value={s.color}
                      label={t("color.title")}
                      onApply={(color) => setStatusColor.mutate({ id: s.id, color })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    className="justify-start text-destructive"
                    onClick={() => {
                      if (!window.confirm(t("task.deleteConfirm"))) return;
                      deleteStatus.mutate(s.id);
                      setStatusSettings(null);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t("common.delete")}
                  </Button>
                </DialogContent>
              </Dialog>
            ))}

          <div className="space-y-2">
            <Label>{t("prop.defaultTemplate")}</Label>
            <Select
              value={property?.default_template_id ?? undefined}
              onValueChange={(v) => patch.mutate({ default_template_id: v })}
            >
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
          </div>
        </section>

        <section className="surface space-y-3 p-5">
          <h2 className="text-lg">{t("prop.accessCode")}</h2>
          <p className="text-sm text-muted-foreground">{t("prop.accessCodeHelp")}</p>
          <p className="font-mono text-2xl">{property?.access_code ?? "—"}</p>
          <div className="space-y-2">
            <Label htmlFor="guest-link">{t("prop.guestLink")}</Label>
            <div className="flex gap-2">
              <Input id="guest-link" readOnly value={guestLink} className="font-mono text-xs" />
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(guestLink);
                  toast.success(t("common.copied"));
                }}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </section>

        <AmenityTemplatesCard propertyId={propertyId} groupId={groupId ?? null} />
      </div>
    </>
  );
}


/**
 * Amenity templates for one property.
 *
 * The old button jumped to the shopping/cleaning page, which lost the context
 * of the property being edited. Instead everything happens in place:
 *  - a dialog lists the group's templates by name and marks the one currently
 *    applied to this property;
 *  - clicking a template opens a second dialog with its full item list;
 *  - applying copies the template items onto the property (server-side RPC).
 */
function AmenityTemplatesCard({
  propertyId,
  groupId,
}: {
  propertyId: string;
  groupId: string | null;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const templatesQ = useQuery({
    queryKey: ["amenity-templates", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amenity_templates")
        .select("id, name")
        .eq("owner_group_id", groupId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // The property's current amenity list. Its rows carry the template they were
  // copied from, which is how we know which template is "current".
  const definitionsQ = useQuery({
    queryKey: ["amenity-definitions", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amenity_definitions")
        .select("id, name, expected_qty, template_id")
        .eq("property_id", propertyId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const definitions = definitionsQ.data ?? [];
  const currentTemplateId = definitions.find((d) => d.template_id)?.template_id ?? null;
  const currentTemplateName =
    (templatesQ.data ?? []).find((tpl) => tpl.id === currentTemplateId)?.name ?? null;

  const apply = useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase.rpc("apply_amenity_template", {
        p_property: propertyId,
        p_template: templateId,
        p_replace: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["amenity-definitions", propertyId] });
      setDetailId(null);
      setPickerOpen(false);
      toast.success(t("common.saved"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <section className="surface space-y-3 p-5 lg:col-span-2">
      <h2 className="text-lg">{t("prop.amenities")}</h2>
      <p className="text-sm text-muted-foreground">
        {t("prop.amenitiesCurrent")}{" "}
        <span className="font-medium text-foreground">
          {currentTemplateName ?? t("common.unassigned")}
        </span>
        {definitions.length > 0 && (
          <> · {t("task.stepCount").replace("{n}", String(definitions.length))}</>
        )}
      </p>

      <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
        <ListChecks className="h-4 w-4" aria-hidden="true" />
        {t("prop.amenitiesChoose")}
      </Button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("prop.amenitiesChoose")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("prop.amenitiesCurrent")}{" "}
            <span className="font-medium text-foreground">
              {currentTemplateName ?? t("common.unassigned")}
            </span>
          </p>
          <div className="grid gap-2">
            {(templatesQ.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">{t("prop.amenitiesNoTemplates")}</p>
            )}
            {(templatesQ.data ?? []).map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setDetailId(tpl.id)}
                className={
                  "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent " +
                  (tpl.id === currentTemplateId ? "border-primary" : "border-border")
                }
              >
                <span className="min-w-0 flex-1 truncate font-medium">{tpl.name}</span>
                {tpl.id === currentTemplateId && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {t("prop.amenitiesInUse")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {detailId && (
        <AmenityTemplateDetailDialog
          templateId={detailId}
          templateName={(templatesQ.data ?? []).find((tpl) => tpl.id === detailId)?.name ?? ""}
          isCurrent={detailId === currentTemplateId}
          applying={apply.isPending}
          onApply={() => apply.mutate(detailId)}
          onClose={() => setDetailId(null)}
        />
      )}
    </section>
  );
}

/** Full item list of one amenity template, with the apply action. */
function AmenityTemplateDetailDialog({
  templateId,
  templateName,
  isCurrent,
  applying,
  onApply,
  onClose,
}: {
  templateId: string;
  templateName: string;
  isCurrent: boolean;
  applying: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  const t = useT();

  const itemsQ = useQuery({
    queryKey: ["amenity-template-items", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amenity_template_items")
        .select("id, name, expected_qty, notes, sort_order")
        .eq("template_id", templateId)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{templateName}</DialogTitle>
        </DialogHeader>
        {itemsQ.isLoading ? (
          <ListSkeleton rows={3} />
        ) : (itemsQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("prop.amenitiesEmptyTemplate")}</p>
        ) : (
          <ul className="space-y-2">
            {(itemsQ.data ?? []).map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-2 rounded-md border border-border p-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  {item.name}
                  {item.notes && (
                    <span className="block text-xs text-muted-foreground">{item.notes}</span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  x{item.expected_qty}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onApply} disabled={applying}>
            {isCurrent ? t("prop.amenitiesReapply") : t("prop.amenitiesApply")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
