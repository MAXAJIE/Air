import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CardGridSkeleton, ListSkeleton, PageHeader } from "@/components/app-shell";
import { RequestsPanel } from "@/components/requests-panel";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";
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
import { fileToBase64 } from "@/lib/files";
import { formatPrice, formatPriceNullable } from "@/lib/format-price";

export const Route = createFileRoute("/_authenticated/shop")({
  validateSearch: (search: Record<string, unknown>): { section?: string } => ({
    section: typeof search.section === "string" ? search.section : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Shopping — Keyward" },
      { name: "description", content: "Guest supply catalog, payment QR codes and order fulfilment." },
      { property: "og:title", content: "Shopping — Keyward" },
      {
        property: "og:description",
        content: "Guest supply catalog, payment QR codes and order fulfilment.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ShopPage,
});

type Section = "shop" | "requests";

function ShopPage() {
  const { section: sectionFromUrl } = Route.useSearch();
  const t = useT();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>(
    sectionFromUrl === "requests" ? "requests" : "shop",
  );

  const handleSectionChange = (v: string) => {
    if (!v) return;
    setSection(v as Section);
    navigate({
      to: ".",
      search: v === "shop" ? {} : { section: v },
      replace: true,
    });
  };

  return (
    <>
      <PageHeader
        title={section === "shop" ? t("shop.title") : t("req.title")}
        action={
          <ToggleGroup
            type="single"
            value={section}
            onValueChange={handleSectionChange}
            variant="outline"
            size="sm"
            aria-label={t("shop.sectionToggle")}
          >
            <ToggleGroupItem value="shop">{t("shop.title")}</ToggleGroupItem>
            <ToggleGroupItem value="requests">{t("req.title")}</ToggleGroupItem>
          </ToggleGroup>
        }
      />
      {section === "requests" ? <RequestsPanel /> : <ShopSections />}
    </>
  );
}

function ShopSections() {
  const t = useT();
  return (
    <>
      <Tabs defaultValue="orders">
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="orders">{t("shop.orders")}</TabsTrigger>
          <TabsTrigger value="catalog">{t("shop.catalog")}</TabsTrigger>
          <TabsTrigger value="preview">{t("shop.previewList")}</TabsTrigger>
          <TabsTrigger value="qr">{t("shop.qr")}</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="mt-4">
          <OrdersPanel />
        </TabsContent>
        <TabsContent value="catalog" className="mt-4">
          <CatalogPanel />
        </TabsContent>
        <TabsContent value="preview" className="mt-4">
          <PreviewPanel />
        </TabsContent>
        <TabsContent value="qr" className="mt-4">
          <QrPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}

function OrdersPanel() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const prefs = useViewPrefs("shop-orders");
  const [view, setView] = useState<ViewMode>("grid");
  const [size, setSize] = useState<CardSize>("md");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  useEffect(() => {
    const saved = prefs.read();
    setView(saved.view);
    setSize(saved.size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const workersQ = useQuery({
    queryKey: ["workers", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      // Resolved in two steps: memberships has no foreign key to profiles, so a
      // PostgREST embed errors out and the worker list would come back empty.
      const { data, error } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("owner_group_id", groupId!)
        .eq("role", "worker")
        .eq("status", "active");
      if (error) throw error;
      if (!data?.length) return [] as Array<{ user_id: string; name: string }>;
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username")
        .in(
          "user_id",
          data.map((m) => m.user_id),
        );
      return data.map((m) => {
        const p = profiles?.find((row) => row.user_id === m.user_id);
        return {
          user_id: m.user_id,
          name: p?.display_name || p?.username || m.user_id.slice(0, 8),
        };
      });
    },
  });

  const ordersQ = useQuery({
    queryKey: ["orders", groupId, propsQ.data?.length],
    enabled: !!propsQ.data?.length,
    queryFn: async () => {
      const ids = propsQ.data!.map((p) => p.id);
      const { data, error } = await supabase
        .from("shopping_orders")
        .select(
          "id, status, property_id, total_amount, payment_proof_amount_entered, payment_proof_photo_url, assigned_worker_id, created_at",
        )
        .in("property_id", ids)
        // Fulfilled orders leave the active order board — they stay visible in
        // the activity log instead.
        .neq("status", "fulfilled")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const patch = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: {
        status?: "verified" | "assigned" | "fulfilled";
        assigned_worker_id?: string | null;
        verified_at?: string | null;
      };
    }) => {
      const { error } = await supabase.from("shopping_orders").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  if (ordersQ.isLoading) return <CardGridSkeleton count={3} />;

  const orders = ordersQ.data ?? [];
  const propertyName = (id: string) => propsQ.data?.find((p) => p.id === id)?.name ?? "—";
  const detail = orders.find((o) => o.id === openOrderId) ?? null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg">{t("shop.orders")}</h2>
        <ViewToggle
          view={view}
          size={size}
          onView={(v) => {
            setView(v);
            prefs.write({ view: v, size });
          }}
          onSize={(sz) => {
            setSize(sz);
            prefs.write({ view, size: sz });
          }}
        />
      </div>

      {/* The payment picture is detail, not a headline: the board stays a
          scannable list of room + state, and the proof opens on demand. */}
      <div className={view === "grid" ? GRID_COLS[size] : "space-y-2"}>
        {orders.map((o, index) => (
          <article
            key={o.id}
            className="surface flex flex-col gap-3 p-4 animate-card-enter transition-all duration-200 hover:shadow-[var(--shadow-lift)]"
            style={{ animationDelay: `${index * 40}ms` }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate font-medium">{propertyName(o.property_id)}</p>
              <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                {t(`shop.status.${o.status as "pending_payment"}`)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("shop.orderTotal")}: <span className="font-medium text-foreground">{formatPrice(o.total_amount)}</span>
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpenOrderId(o.id)}>
                <Eye className="h-4 w-4" aria-hidden="true" />
                {t("shop.viewOrder")}
              </Button>
              {o.status === "proof_submitted" && (
                <Button
                  size="sm"
                  onClick={() =>
                    patch.mutate({
                      id: o.id,
                      values: { status: "verified", verified_at: new Date().toISOString() },
                    })
                  }
                >
                  {t("shop.verify")}
                </Button>
              )}
              {o.status === "assigned" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => patch.mutate({ id: o.id, values: { status: "fulfilled" } })}
                >
                  {t("shop.fulfil")}
                </Button>
              )}
            </div>
            {o.status === "verified" && (
              <Select
                onValueChange={(v) =>
                  patch.mutate({ id: o.id, values: { assigned_worker_id: v, status: "assigned" } })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("shop.assignWorker")} />
                </SelectTrigger>
                <SelectContent>
                  {(workersQ.data ?? []).map((w) => (
                    <SelectItem key={w.user_id} value={w.user_id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </article>
        ))}
        {orders.length === 0 && <p className="text-sm text-muted-foreground">{t("common.none")}</p>}
      </div>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setOpenOrderId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("shop.orderDetail")}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <p className="font-medium">{propertyName(detail.property_id)}</p>
              <p className="text-sm">
                {t("shop.orderTotal")}: <span className="font-medium">{formatPrice(detail.total_amount)}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {t("shop.amountEntered")}: {formatPriceNullable(detail.payment_proof_amount_entered)}
              </p>
              {detail.payment_proof_photo_url ? (
                <SignedPhoto
                  path={detail.payment_proof_photo_url}
                  alt={t("shop.proof")}
                  className="max-h-80 w-full rounded-md object-contain"
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t("shop.issueNoPhoto")}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

type CatalogItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  photo_path: string | null;
  active: boolean;
  sort_order: number;
};

function useCatalog(groupId: string | null) {
  return useQuery({
    queryKey: ["shopping-items", groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<CatalogItem[]> => {
      const { data, error } = await supabase
        .from("shopping_items")
        .select("id, name, description, price, photo_path, active, sort_order")
        .eq("owner_group_id", groupId!)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

function CatalogPanel() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const itemsQ = useCatalog(groupId);
  const prefs = useViewPrefs("shop-catalog");
  const [view, setView] = useState<ViewMode>("grid");
  const [size, setSize] = useState<CardSize>("md");
  const [editing, setEditing] = useState<CatalogItem | null | undefined>(undefined);

  useEffect(() => {
    const saved = prefs.read();
    setView(saved.view);
    setSize(saved.size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shopping_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping-items", groupId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const items = itemsQ.data ?? [];

  if (itemsQ.isLoading) {
    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="h-6 w-24 animate-pulse rounded bg-muted" />
          <div className="flex items-center gap-2">
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
        <CardGridSkeleton count={6} />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg">{t("shop.catalog")}</h2>
        <div className="flex items-center gap-2">
          <ViewToggle
            view={view}
            size={size}
            onView={(v) => {
              setView(v);
              prefs.write({ view: v, size });
            }}
            onSize={(s) => {
              setSize(s);
              prefs.write({ view, size: s });
            }}
          />
          <Button onClick={() => setEditing(null)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("shop.addItem")}
          </Button>
        </div>
      </div>

      {view === "grid" ? (
        <div className={GRID_COLS[size]}>
          {items.map((item, index) => (
            <article key={item.id} className="surface flex flex-col overflow-hidden animate-card-enter transition-all duration-200 hover:shadow-[var(--shadow-lift)]" style={{ animationDelay: `${index * 40}ms` }}>
              {item.photo_path ? (
                <SignedPhoto
                  path={item.photo_path}
                  alt={item.name}
                  className={`w-full object-cover ${COVER_HEIGHT[size]}`}
                />
              ) : (
                <div
                  className={`flex w-full items-center justify-center bg-muted text-xs text-muted-foreground ${COVER_HEIGHT[size]}`}
                >
                  {t("shop.issueNoPhoto")}
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <p className="truncate font-medium">{item.name}</p>
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{formatPrice(item.price)}</p>
                <div className="mt-auto flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    {t("common.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("common.delete")}
                    onClick={() => {
                      if (window.confirm(t("shop.deleteConfirm"))) remove.mutate(item.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <ul className="surface divide-y divide-border">
          {items.map((item, index) => (
            <li key={item.id} className="flex items-center gap-3 p-3 animate-card-enter transition-colors hover:bg-accent/50" style={{ animationDelay: `${index * 30}ms` }}>
              {item.photo_path ? (
                <SignedPhoto
                  path={item.photo_path}
                  alt={item.name}
                  className="h-12 w-12 shrink-0 rounded-md object-cover"
                />
              ) : (
                <span className="h-12 w-12 shrink-0 rounded-md bg-muted" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.description ?? ""}
                </span>
              </span>
              <span className="shrink-0 text-sm font-medium text-emerald-600 dark:text-emerald-400">{formatPrice(item.price)}</span>
              <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("common.delete")}
                onClick={() => {
                  if (window.confirm(t("shop.deleteConfirm"))) remove.mutate(item.id);
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && <p className="text-sm text-muted-foreground">{t("common.none")}</p>}

      {editing !== undefined && (
        <ItemDialog item={editing} groupId={groupId!} onClose={() => setEditing(undefined)} />
      )}
    </section>
  );
}

function ItemDialog({
  item,
  groupId,
  onClose,
}: {
  item: CatalogItem | null;
  groupId: string;
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [price, setPrice] = useState(String(item?.price ?? 0));
  const [photo, setPhoto] = useState<string | null>(item?.photo_path ?? null);
  const [active, setActive] = useState(item?.active ?? true);

  const save = useMutation({
    mutationFn: async () => {
      const values = {
        name: name.trim(),
        description: description.trim() || null,
        price: Number(price) || 0,
        photo_path: photo,
        active,
      };
      if (item) {
        const { error } = await supabase.from("shopping_items").update(values).eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("shopping_items")
          .insert({ ...values, owner_group_id: groupId });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["shopping-items", groupId] });
      toast.success(t("common.saved"));
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? t("shop.editItem") : t("shop.addItem")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <PhotoPicker value={photo} onChange={setPhoto} folder="shop" label={t("shop.itemPhoto")} />
          <div className="space-y-2">
            <Label htmlFor="item-name">{t("shop.itemName")}</Label>
            <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-desc">{t("shop.itemDesc")}</Label>
            <Textarea
              id="item-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-price">{t("shop.price")}</Label>
            <Input
              id="item-price"
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
            {t("shop.active")}
          </label>
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

function PreviewPanel() {
  const t = useT();
  const { groupId } = useActiveGroup();
  const itemsQ = useCatalog(groupId);
  const items = itemsQ.data ?? [];

  const issues = items.flatMap((item) => {
    const list: string[] = [];
    if (!item.photo_path) list.push(t("shop.issueNoPhoto"));
    if (!item.price) list.push(t("shop.issueNoPrice"));
    if (!item.description) list.push(t("shop.issueNoDesc"));
    if (items.filter((row) => row.name.trim().toLowerCase() === item.name.trim().toLowerCase()).length > 1)
      list.push(t("shop.issueDuplicate"));
    if (!item.active) list.push(t("shop.issueHidden"));
    return list.map((label) => ({ id: `${item.id}-${label}`, name: item.name, label }));
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="surface space-y-4 p-5">
        <div>
          <h2 className="text-lg">{t("shop.previewList")}</h2>
          <p className="text-sm text-muted-foreground">{t("shop.previewHelp")}</p>
        </div>
        <ul className="divide-y divide-border">
          {items
            .filter((item) => item.active)
            .map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                {item.photo_path ? (
                  <SignedPhoto
                    path={item.photo_path}
                    alt={item.name}
                    className="h-14 w-14 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="h-14 w-14 shrink-0 rounded-md bg-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.description ?? ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium text-emerald-600 dark:text-emerald-400">{formatPrice(item.price)}</span>
              </li>
            ))}
          {items.filter((item) => item.active).length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">{t("common.none")}</li>
          )}
        </ul>
      </section>

      <section className="surface space-y-3 p-5">
        <h2 className="text-lg">{t("shop.issues")}</h2>
        {issues.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {t("shop.noIssues")}
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {issues.map((issue) => (
              <li key={issue.id} className="flex items-start gap-2 rounded-md border border-border p-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{issue.name}</span>
                  <span className="block text-xs text-muted-foreground">{issue.label}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type PaymentQr = {
  id: string;
  label: string | null;
  content_type: string;
  legacy_path: string | null;
  data_base64: string | null;
};

/**
 * The QR image itself lives encrypted in the database and stays there until the
 * owner replaces or deletes it — nothing here writes it to public storage.
 */
function QrPanel() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const [busy, setBusy] = useState(false);

  const prefs = useViewPrefs("shop-qr");
  const [view, setView] = useState<ViewMode>("grid");
  const [size, setSize] = useState<CardSize>("md");

  useEffect(() => {
    const saved = prefs.read();
    setView(saved.view);
    setSize(saved.size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qrQ = useQuery({
    queryKey: ["qr", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_payment_qr", { p_group: groupId! });
      if (error) throw error;
      return (data as PaymentQr | null) ?? null;
    },
  });

  async function onFile(file: File) {
    setBusy(true);
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error(t("shop.qrTooLarge"));
      const dataBase64 = await fileToBase64(file);
      const { error } = await supabase.rpc("save_payment_qr", {
        p_group: groupId!,
        p_data_base64: dataBase64,
        p_content_type: file.type || "image/png",
        p_label: undefined,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["qr", groupId] });
      toast.success(t("common.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("delete_payment_qr", { p_group: groupId! });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["qr", groupId] });
      toast.success(t("shop.qrDeleted"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const qr = qrQ.data;
  // The QR is a reference image, not a hero: the same view controls used by
  // the rest of the app decide how big it renders and where it sits.
  const QR_SIZE: Record<CardSize, string> = { sm: "h-28 w-28", md: "h-44 w-44", lg: "h-72 w-72" };
  const inlineSrc = qr?.data_base64
    ? `data:${qr.content_type};base64,${qr.data_base64}`
    : null;

  return (
    <section className="surface max-w-2xl space-y-3 p-5 transition-all duration-200 hover:shadow-[var(--shadow-lift)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg">{t("shop.qr")}</h2>
        <ViewToggle
          view={view}
          size={size}
          onView={(v) => {
            setView(v);
            prefs.write({ view: v, size });
          }}
          onSize={(sz) => {
            setSize(sz);
            prefs.write({ view, size: sz });
          }}
        />
      </div>
      <p className="text-sm text-muted-foreground">{t("shop.qrHelp")}</p>
      <p className="text-xs text-muted-foreground">{t("shop.qrEncrypted")}</p>
      <div className={view === "grid" ? "space-y-3" : "flex flex-wrap items-start gap-4"}>
      {inlineSrc && (
        <img
          src={inlineSrc}
          alt={t("shop.qr")}
          className={`shrink-0 rounded-md object-contain ${QR_SIZE[size]}`}
        />
      )}
      {!inlineSrc && qr?.legacy_path && (
        <SignedPhoto
          path={qr.legacy_path}
          alt={t("shop.qr")}
          className={`shrink-0 rounded-md object-contain ${QR_SIZE[size]}`}
        />
      )}
      <div className="min-w-56 flex-1 space-y-2">
        <Label htmlFor="qr-file">{qr ? t("shop.replaceQr") : t("shop.uploadQr")}</Label>
        <Input
          id="qr-file"
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </div>
      {qr && (
        <Button
          variant="outline"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(t("shop.qrDeleteConfirm"))) remove.mutate();
          }}
        >
          {t("shop.deleteQr")}
        </Button>
      )}
      </div>
    </section>
  );
}
