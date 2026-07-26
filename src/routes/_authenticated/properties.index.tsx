import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AddressPicker, type PlaceValue } from "@/components/address-picker";
import { EmptyState, PageHeader } from "@/components/app-shell";
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

function PropertiesPage() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const prefs = useViewPrefs("properties");
  const initial = prefs.read();
  const [view, setView] = useState<ViewMode>(initial.view);
  const [size, setSize] = useState<CardSize>(initial.size);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [place, setPlace] = useState<PlaceValue>(EMPTY_PLACE);
  const [photoPath, setPhotoPath] = useState<string | null>(null);

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
        .select("id, label, sort_order")
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

  const statusLabel = (id: string | null) =>
    statuses?.find((s) => s.id === id)?.label ?? t("common.unassigned");

  return (
    <>
      <PageHeader
        title={t("prop.title")}
        action={
          <div className="flex items-center gap-2">
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (properties ?? []).length === 0 ? (
        <EmptyState />
      ) : view === "list" ? (
        <ul className="surface divide-y divide-border">
          {properties!.map((p) => (
            <li key={p.id}>
              <Link
                to="/properties/$propertyId"
                params={{ propertyId: p.id }}
                className="flex items-center gap-3 p-3 transition-colors hover:bg-accent"
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
                <span className="hidden shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground sm:inline">
                  {statusLabel(p.status_id)}
                </span>
                <span className="hidden shrink-0 font-mono text-xs text-muted-foreground md:inline">
                  {p.access_code}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className={GRID_COLS[size]}>
          {properties!.map((p) => (
            <Link
              key={p.id}
              to="/properties/$propertyId"
              params={{ propertyId: p.id }}
              className="surface block overflow-hidden transition-shadow hover:shadow-[var(--shadow-lift)]"
            >
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
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                      {statusLabel(p.status_id)}
                    </span>
                    <span className="font-mono text-muted-foreground">{p.access_code}</span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
