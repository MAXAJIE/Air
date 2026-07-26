import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Handshake } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthUser } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/agencies")({
  head: () => ({
    meta: [
      { title: "Keyward" },
      { name: "description", content: "Keyward property operations." },
      { property: "og:title", content: "Keyward" },
      { property: "og:description", content: "Keyward property operations." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const t = useT();
  const qc = useQueryClient();
  const { data: user } = useAuthUser();
  const [code, setCode] = useState("");

  // HR company's active affiliations with owner groups
  const affilQ = useQuery({
    queryKey: ["hr-affil-list", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_affiliations")
        .select("id, owner_group_id, status, created_at")
        .eq("hr_company_user_id", user!.id)
        .eq("status", "active");
      if (error) throw error;
      if (!data?.length) return [];

      const { data: groups } = await supabase
        .from("owner_groups")
        .select("id, name, owner_user_id")
        .in("id", data.map((a) => a.owner_group_id));

      const ownerIds = Array.from(new Set((groups ?? []).map((g) => g.owner_user_id)));
      const { data: owners } = await supabase
        .from("profiles")
        .select("user_id, display_name, username, email")
        .in("user_id", ownerIds.length ? ownerIds : ["00000000-0000-0000-0000-000000000000"]);

      return data.map((a) => {
        const g = groups?.find((row) => row.id === a.owner_group_id);
        const o = owners?.find((row) => row.user_id === g?.owner_user_id);
        return {
          id: a.id,
          groupName: g?.name ?? a.owner_group_id.slice(0, 8),
          ownerName: o?.display_name || o?.username || "—",
          ownerEmail: o?.email ?? "",
        };
      });
    },
  });

  const join = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("redeem_invite_code", { p_code: code.trim() });
      if (error) throw error;
    },
    onSuccess: async () => {
      setCode("");
      await qc.invalidateQueries({ queryKey: ["hr-affil-list"] });
      toast.success(t("join.joined"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const affiliations = affilQ.data ?? [];

  return (
    <>
      <PageHeader title={t("agencies.title")} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="surface space-y-3 p-5">
          <div>
            <h2 className="text-lg">{t("agencies.owners")}</h2>
          </div>
          <ul className="space-y-2">
            {affiliations.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.groupName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {a.ownerName}
                  </span>
                </span>
              </li>
            ))}
            {affiliations.length === 0 && (
              <li className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                {t("common.none")}
              </li>
            )}
          </ul>
        </section>

        <section className="surface space-y-3 p-5">
          <div>
            <h2 className="text-lg">{t("join.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("join.body")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-code">{t("join.code")}</Label>
            <Input
              id="join-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="font-mono uppercase"
            />
          </div>
          <Button disabled={!code.trim() || join.isPending} onClick={() => join.mutate()}>
            {t("join.join")}
          </Button>
        </section>
      </div>
    </>
  );
}
