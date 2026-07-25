import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { SignedPhoto } from "@/components/signed-photo";
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
import { fileToBase64 } from "@/lib/files";
import { uploadPhoto } from "@/lib/photos.functions";

export const Route = createFileRoute("/_authenticated/shop")({
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

function ShopPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t("shop.title")} />
      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">{t("shop.orders")}</TabsTrigger>
          <TabsTrigger value="catalog">{t("shop.catalog")}</TabsTrigger>
          <TabsTrigger value="qr">{t("shop.qr")}</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="mt-4">
          <OrdersPanel />
        </TabsContent>
        <TabsContent value="catalog" className="mt-4">
          <CatalogPanel />
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
      const { data } = await supabase
        .from("memberships")
        .select("user_id, profiles:profiles!memberships_user_id_fkey(display_name, username)")
        .eq("owner_group_id", groupId!)
        .eq("role", "worker")
        .eq("status", "active");
      return data ?? [];
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

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {(ordersQ.data ?? []).map((o) => (
        <article key={o.id} className="surface space-y-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-medium">
              {propsQ.data?.find((p) => p.id === o.property_id)?.name ?? "—"}
            </p>
            <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
              {t(`shop.status.${o.status as "pending_payment"}`)}
            </span>
          </div>
          <p className="text-sm">
            {t("shop.orderTotal")}: {o.total_amount}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("shop.amountEntered")}: {o.payment_proof_amount_entered ?? "—"}
          </p>
          {o.payment_proof_photo_url && (
            <SignedPhoto path={o.payment_proof_photo_url} alt={t("shop.proof")} className="h-40 w-full rounded-md object-cover" />
          )}
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
                {(workersQ.data ?? []).map((w) => {
                  const p = w.profiles as unknown as
                    | { display_name: string | null; username: string }
                    | null;
                  return (
                    <SelectItem key={w.user_id} value={w.user_id}>
                      {p?.display_name || p?.username || w.user_id.slice(0, 8)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
          {o.status === "assigned" && (
            <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: o.id, values: { status: "fulfilled" } })}>
              {t("shop.fulfil")}
            </Button>
          )}
        </article>
      ))}
      {(ordersQ.data ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">{t("common.none")}</p>
      )}
    </div>
  );
}

function CatalogPanel() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");

  const itemsQ = useQuery({
    queryKey: ["shopping-items", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_items")
        .select("id, name, price, active")
        .eq("owner_group_id", groupId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("shopping_items")
        .insert({ owner_group_id: groupId!, name: name.trim(), price: Number(price) || 0 });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["shopping-items", groupId] });
      setName("");
      setPrice("0");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <section className="surface max-w-xl space-y-3 p-5">
      <h2 className="text-lg">{t("shop.catalog")}</h2>
      <div className="grid grid-cols-[minmax(0,1fr)_7rem_auto] gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("common.name")} />
        <Input
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          aria-label={t("shop.price")}
        />
        <Button disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <ul className="divide-y divide-border text-sm">
        {(itemsQ.data ?? []).map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0 truncate">{i.name}</span>
            <span className="shrink-0 text-muted-foreground">{i.price}</span>
          </li>
        ))}
        {(itemsQ.data ?? []).length === 0 && (
          <li className="py-6 text-center text-muted-foreground">{t("common.none")}</li>
        )}
      </ul>
    </section>
  );
}

function QrPanel() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const [busy, setBusy] = useState(false);

  const qrQ = useQuery({
    queryKey: ["qr", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_qr_codes")
        .select("id, qr_image_url, label, active")
        .eq("owner_group_id", groupId!)
        .eq("active", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function onFile(file: File) {
    setBusy(true);
    try {
      const base64 = await fileToBase64(file);
      const { path } = await uploadPhoto({
        data: { base64, contentType: file.type, folder: `qr/${groupId}` },
      });
      const { error } = await supabase
        .from("payment_qr_codes")
        .insert({ owner_group_id: groupId!, qr_image_url: path });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["qr", groupId] });
      toast.success(t("common.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface max-w-md space-y-3 p-5">
      <h2 className="text-lg">{t("shop.qr")}</h2>
      <p className="text-sm text-muted-foreground">{t("shop.qrHelp")}</p>
      {qrQ.data?.qr_image_url && (
        <SignedPhoto path={qrQ.data.qr_image_url} alt={t("shop.qr")} className="h-56 w-56 rounded-md object-contain" />
      )}
      <div className="space-y-2">
        <Label htmlFor="qr-file">{t("shop.uploadQr")}</Label>
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
    </section>
  );
}
