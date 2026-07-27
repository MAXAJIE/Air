import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { Copy, Plus, Sparkle, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ListSkeleton, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useAuthUser, useProfile } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { randomCode } from "@/lib/files";

export const Route = createFileRoute("/_authenticated/roster")({
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
  const { data: profile, isLoading: profileLoading } = useProfile();

  // Invite codes for joining this HR company's roster
  const codesQ = useQuery({
    queryKey: ["hr-invite-codes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_invite_codes")
        .select("id, code, active, revoked_at, created_at")
        .eq("hr_company_user_id", user!.id)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Active roster members
  const rosterQ = useQuery({
    queryKey: ["hr-roster", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_company_roster")
        .select("id, cleaner_user_id, status")
        .eq("hr_company_user_id", user!.id)
        .eq("status", "active");
      if (error) throw error;
      if (!data?.length) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username, email")
        .in("user_id", data.map((r) => r.cleaner_user_id));

      return data.map((r) => ({
        id: r.id,
        userId: r.cleaner_user_id,
        name:
          profiles?.find((p) => p.user_id === r.cleaner_user_id)?.display_name ||
          profiles?.find((p) => p.user_id === r.cleaner_user_id)?.username ||
          r.cleaner_user_id.slice(0, 8),
        email: profiles?.find((p) => p.user_id === r.cleaner_user_id)?.email ?? "",
      }));
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hr_invite_codes").insert({
        hr_company_user_id: user!.id,
        code: randomCode("HR"),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["hr-invite-codes", user?.id] });
      toast.success(t("common.saved"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("hr_invite_codes")
        .update({ active: false, revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-invite-codes", user?.id] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("hr_company_roster")
        .update({ status: "removed" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-roster", user?.id] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const roster = rosterQ.data ?? [];
  const codes = codesQ.data ?? [];

  if (!profileLoading && profile && profile.primary_role !== "hr_company") {
    return <Navigate to="/dashboard" replace />;
  }

  if (rosterQ.isLoading || codesQ.isLoading) {
    return (
      <>
        <PageHeader title={t("hr.roster")} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <ListSkeleton rows={3} />
          <ListSkeleton rows={3} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("hr.roster")} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Roster list */}
        <section className="surface space-y-3 p-5">
          <h2 className="text-lg">{t("hr.roster")}</h2>
          <ul className="space-y-2">
            {roster.map((r, index) => (
              <li
                key={r.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 sm:gap-3 sm:px-3 sm:py-2.5 animate-card-enter"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
                  <Sparkle className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.email}</span>
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  aria-label={t("common.remove")}
                  onClick={() => {
                    if (window.confirm(t("common.confirm"))) remove.mutate(r.id);
                  }}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
            {roster.length === 0 && (
              <li className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                {t("common.none")}
              </li>
            )}
          </ul>
        </section>

        {/* Invite codes */}
        <section className="surface space-y-4 p-5">
          <div>
            <h2 className="text-lg">{t("hr.rosterCode")}</h2>
            <p className="text-sm text-muted-foreground">{t("hr.rosterCodeHelp")}</p>
          </div>
          <Button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("people.generate")}
          </Button>
          <ul className="divide-y divide-border text-sm">
            {codes.map((c, index) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 animate-card-enter" style={{ animationDelay: `${index * 30}ms` }}>
                <span className="font-mono">{c.code}</span>
                <span className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("common.copy")}
                    onClick={async () => {
                      await navigator.clipboard.writeText(c.code);
                      toast.success(t("common.copied"));
                    }}
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => revoke.mutate(c.id)}>
                    {t("people.revoke")}
                  </Button>
                </span>
              </li>
            ))}
            {codes.length === 0 && (
              <li className="py-6 text-center text-muted-foreground">{t("common.none")}</li>
            )}
          </ul>
        </section>
      </div>
    </>
  );
}
