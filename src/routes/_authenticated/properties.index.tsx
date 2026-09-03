import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ExternalLink, Filter, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AddressPicker, type PlaceValue } from "@/components/address-picker";
import { CardGridSkeleton, EmptyState, PageHeader } from "@/components/app-shell";
import { PhotoPicker } from "@/components/photo-picker";
import { SignedPhoto } from "@/components/signed-photo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COVER_HEIGHT,
  GRID_COLS,
  ViewToggle,
  useViewPrefs,
  type CardSize,
  type ViewMode,
} from "@/components/view-toggle";
import { useActiveGroup } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { randomCode } from "@/lib/files";
import { statusChipClass, statusChipStyle } from "@/lib/status-colors";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/properties/")({
  head: () => ({
    meta: [
      { title: "Properties — Keyward" },
      { name: "description", content: "Manage every listing, status and amenity baseline." },
      { property: "og:title", content: "Properties — Keyward" },
      { property: "og:description", content: "Manage every listing, status and amenity baseline." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PropertiesPage,
});

const EMPTY_PLACE: PlaceValue = { address: "", placeName: null, lat: null, lng: null };

type EditState = {
  id: string;
  name: string;
  place: PlaceValue;
  photoPath: string | null;
  statusId: string | null;
};

function PropertiesPage() {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { groupId } = useActiveGroup();
  const prefs = useViewPrefs("properties");
  const initial = prefs.read();
  const [view, setView] = useState<ViewMode>(initial.view);
  const [size, setSize] = useState<CardSize>(initial.size);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [place, setPlace] = useState<PlaceValue>(EMPTY_PLACE);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  // "" = All, "none" = Unassigned, else the status id
  const [statusFilter, setStatusFilter] = useState<string>("");

  const setViewMode = (v: ViewMode) => {
    setView(v);
    prefs.write({ view: v, size });
  };
  const setCardSize = (s: CardSize) => {
    setSize(s);
    prefs.write({ view, size: s });
  };

  const { data: properties, isLoading } = useQuery({
    queryKey: ["properties", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, address, access_code, status_id, photo_path, place_name, lat, lng")
        .eq("owner_group_id", groupId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: statuses } = useQuery({
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

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("properties").insert({
        owner_group_id: groupId!,
        name: name.trim(),
        address: place.address.trim() || null,
        place_name: place.placeName,
        lat: place.lat,
        lng: place.lng,
        photo_path: photoPath,
        access_code: randomCode("ROOM"),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["properties", groupId] });
      setOpen(false);
      setName("");
      setPlace(EMPTY_PLACE);
      setPhotoPath(null);
      toast.success(t("common.saved"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const update = useMutation({
    mutationFn: async (values: EditState) => {
      const { error } = await supabase
        .from("properties")
        .update({
          name: values.name.trim(),
          address: values.place.address.trim() || null,
          place_name: values.place.placeName,
          lat: values.place.lat,
          lng: values.place.lng,
          photo_path: values.photoPath,
          status_id: values.statusId,
        })
        .eq("id", values.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["properties", groupId] });
      setEdit(null);
      toast.success(t("common.saved"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("properties").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["properties", groupId] });
      toast.success(t("common.saved"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const statusOf = (id: string | null) => statuses?.find((s) => s.id === id) ?? null;
  const statusLabel = (id: string | null) => statusOf(id)?.label ?? t("common.unassigned");
  const statusColor = (id: string | null) => statusOf(id)?.color ?? null;

  type PropertyRow = NonNullable<typeof properties>[number];

  const filtered = useMemo<PropertyRow[]>(() => {
    const rows = properties ?? [];
    if (!statusFilter) return rows;
    if (statusFilter === "none") return rows.filter((r) => !r.status_id);
    return rows.filter((r) => r.status_id === statusFilter);
  }, [properties, statusFilter]);

  const startEdit = (p: PropertyRow) =>
    setEdit({
      id: p.id,
      name: p.name,
      place: {
        address: p.address ?? "",
        placeName: p.place_name ?? null,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
      },
      photoPath: p.photo_path ?? null,
      statusId: p.status_id ?? null,
    });

  const confirmDelete = (p: PropertyRow) => {
    if (typeof window !== "undefined" && !window.confirm(t("prop.deleteConfirm"))) return;
    remove.mutate(p.id);
  };

  /** Owner row actions: preview the guest page, edit the record, delete it. */
  const RowActions = ({ p }: { p: PropertyRow }) => (
    <span className="flex shrink-0 items-center gap-1">
      {p.access_code ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("prop.guestLink")}
          title={t("prop.guestLink")}
          onClick={() => window.open(`/g/${p.access_code}`, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("prop.settings")}
        title={t("prop.settings")}
        onClick={() => navigate({ to: "/properties/$propertyId", params: { propertyId: p.id } })}
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("common.delete")}
        title={t("common.delete")}
        disabled={remove.isPending}
        onClick={() => confirmDelete(p)}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </span>
  );

  return (
    <>
      <PageHeader
        title={t("prop.title")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden sm:flex items-center gap-1 text-muted-foreground">
              <Filter className="h-4 w-4" aria-hidden="true" />
            </div>
            <Select value={statusFilter || "__all"} onValueChange={(v) => setStatusFilter(v === "__all" ? "" : v)}>
              <SelectTrigger className="h-8 w-full sm:w-[9rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All</SelectItem>
                <SelectItem value="none">{t("common.unassigned")}</SelectItem>
                {(statuses ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ViewToggle view={view} onView={setViewMode} size={size} onSize={setCardSize} />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t("prop.add")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{t("prop.add")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <PhotoPicker
                    value={photoPath}
                    onChange={setPhotoPath}
                    folder="properties"
                    label={t("prop.coverAdd")}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="p-name">{t("common.name")}</Label>
                    <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <AddressPicker value={place} onChange={setPlace} label={t("prop.address")} />
                </div>
                <DialogFooter>
                  <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
                    {t("common.create")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {isLoading ? (
        <CardGridSkeleton count={6} />
      ) : (properties ?? []).length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : view === "list" ? (
        <ul className="surface divide-y divide-border">
          {filtered.map((p, index) => (
            <li key={p.id} className="flex items-center gap-1 pr-2 animate-card-enter transition-colors hover:bg-accent/40" style={{ animationDelay: `${index * 30}ms` }}>
              <button
                type="button"
                onClick={() => startEdit(p)}
                className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
              >
                {p.photo_path ? (
                  <SignedPhoto path={p.photo_path} alt={p.name} className="h-12 w-16 shrink-0 object-cover" />
                ) : (
                  <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md bg-muted">
                    <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.address ?? "—"}</span>
                </span>
                <span
                  className={`hidden shrink-0 sm:inline-flex ${statusChipClass(statusColor(p.status_id))}`}
                  style={statusChipStyle(statusColor(p.status_id))}
                >
                  {statusLabel(p.status_id)}
                </span>
                <span className="hidden shrink-0 font-mono text-xs text-muted-foreground md:inline">
                  {p.access_code}
                </span>
              </button>
              <RowActions p={p} />
            </li>
          ))}
        </ul>
      ) : (
        <div className={GRID_COLS[size]}>
          {filtered.map((p, index) => (
            <div
              key={p.id}
              className="surface overflow-hidden animate-card-enter transition-all hover:shadow-[var(--shadow-lift)] hover:-translate-y-0.5"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <button
                type="button"
                onClick={() => startEdit(p)}
                className="relative block w-full text-left"
              >
                <span
                  className={`absolute left-2 top-2 z-10 ${statusChipClass(statusColor(p.status_id))}`}
                  style={statusChipStyle(statusColor(p.status_id))}
                >
                  {statusLabel(p.status_id)}
                </span>
                {p.photo_path ? (
                  <SignedPhoto
                    path={p.photo_path}
                    alt={p.name}
                    className={`w-full rounded-none object-cover ${COVER_HEIGHT[size]}`}
                  />
                ) : (
                  <div className={`flex w-full items-center justify-center bg-muted ${COVER_HEIGHT[size]}`}>
                    <MapPin className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  </div>
                )}
                <div className="p-4">
                  <p className="truncate font-display text-base font-semibold">{p.name}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{p.address ?? "—"}</p>
                  {size !== "sm" && (
                    <div className="mt-3 flex items-center justify-end gap-2 text-xs">
                      <span className="font-mono text-muted-foreground">{p.access_code}</span>
                    </div>
                  )}
                </div>
              </button>
              <div className="flex items-center justify-end border-t border-border px-2 py-1">
                <RowActions p={p} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("prop.edit")}</DialogTitle>
          </DialogHeader>
          {edit ? (
            <div className="space-y-4">
              <PhotoPicker
                value={edit.photoPath}
                onChange={(v) => setEdit({ ...edit, photoPath: v })}
                folder="properties"
                label={t("prop.coverAdd")}
              />
              <div className="space-y-2">
                <Label htmlFor="p-edit-name">{t("common.name")}</Label>
                <Input
                  id="p-edit-name"
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </div>
              <AddressPicker
                value={edit.place}
                onChange={(v) => setEdit({ ...edit, place: v })}
                label={t("prop.address")}
              />
              <div className="space-y-2">
                <Label>{t("common.status")}</Label>
                <div className="flex flex-wrap gap-2">
                  {(statuses ?? []).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setEdit({ ...edit, statusId: s.id })}
                      className={`${statusChipClass(s.color)} ${
                        edit.statusId === s.id ? "ring-2 ring-ring" : ""
                      }`}
                      style={statusChipStyle(s.color)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!edit?.name.trim() || update.isPending}
              onClick={() => edit && update.mutate(edit)}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
