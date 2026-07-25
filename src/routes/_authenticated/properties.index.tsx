import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/app-shell";
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

function PropertiesPage() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  const { data: properties, isLoading } = useQuery({
    queryKey: ["properties", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, address, access_code, status_id")
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
        address: address.trim() || null,
        access_code: randomCode("ROOM"),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["properties", groupId] });
      setOpen(false);
      setName("");
      setAddress("");
      toast.success(t("common.saved"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <>
      <PageHeader
        title={t("prop.title")}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("prop.add")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("prop.add")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="p-name">{t("common.name")}</Label>
                  <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-address">{t("prop.address")}</Label>
                  <Input id="p-address" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!name.trim() || create.isPending}
                  onClick={() => create.mutate()}
                >
                  {t("common.create")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {properties!.map((p) => (
            <Link
              key={p.id}
              to="/properties/$propertyId"
              params={{ propertyId: p.id }}
              className="surface block p-5 transition-shadow hover:shadow-[var(--shadow-lift)]"
            >
              <p className="truncate font-display text-lg font-semibold">{p.name}</p>
              <p className="mt-1 truncate text-sm text-muted-foreground">{p.address ?? "—"}</p>
              <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                <span className="rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                  {statuses?.find((s) => s.id === p.status_id)?.label ?? t("common.unassigned")}
                </span>
                <span className="font-mono text-muted-foreground">{p.access_code}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
