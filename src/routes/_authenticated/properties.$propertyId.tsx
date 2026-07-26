import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Copy, Plus } from "lucide-react";
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
import { useActiveGroup, useProfile } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

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
  const { groupId } = useActiveGroup();
  const [statusLabel, setStatusLabel] = useState("");

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
        .select("id, label, sort_order")
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
    mutationFn: async (values: { status_id?: string | null; default_template_id?: string | null }) => {
      const { error } = await supabase.from("properties").update(values).eq("id", propertyId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["property", propertyId] });
      toast.success(t("common.saved"));
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

  return (
    <>
      <Link
        to="/properties"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("common.back")}
      </Link>

      <PageHeader title={property?.name ?? t("prop.title")} description={property?.address ?? undefined} />

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

        <section className="surface space-y-2 p-5 lg:col-span-2">
          <h2 className="text-lg">{t("prop.amenities")}</h2>
          <p className="text-sm text-muted-foreground">{t("prop.amenitiesMoved")}</p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/cleaning">{t("prop.amenitiesMovedCta")}</Link>
          </Button>
        </section>
      </div>
    </>
  );
}
