import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
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
import { randomCode } from "@/lib/files";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/people")({
  head: () => ({
    meta: [
      { title: "People — Keyward" },
      { name: "description", content: "Invite cleaners, workers and cleaning companies to your group." },
      { property: "og:title", content: "People — Keyward" },
      {
        property: "og:description",
        content: "Invite cleaners, workers and cleaning companies to your group.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PeoplePage,
});

type InviteRole = "cleaner" | "worker" | "hr_company";

const CAPS: Record<InviteRole, number> = { cleaner: 3, worker: 2, hr_company: 1 };

function PeoplePage() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const { data: profile } = useProfile();
  const [role, setRole] = useState<InviteRole>("cleaner");

  const membersQ = useQuery({
    queryKey: ["members", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("id, role, status, user_id, profiles:profiles!memberships_user_id_fkey(display_name, username, email)")
        .eq("owner_group_id", groupId!)
        .eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  const hrQ = useQuery({
    queryKey: ["hr-affiliations", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_affiliations")
        .select("id, status, hr_company_user_id")
        .eq("owner_group_id", groupId!)
        .eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  const codesQ = useQuery({
    queryKey: ["invite-codes", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invite_codes")
        .select("id, code, role, active, revoked_at, created_at")
        .eq("owner_group_id", groupId!)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("invite_codes").insert({
        owner_group_id: groupId!,
        role,
        created_by: profile!.user_id,
        code: randomCode(role === "hr_company" ? "HR" : role.slice(0, 3).toUpperCase()),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["invite-codes", groupId] });
      toast.success(t("common.saved"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invite_codes")
        .update({ active: false, revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invite-codes", groupId] }),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("memberships").update({ status: "removed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", groupId] }),
  });

  const setSelfRole = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ self_secondary_role: value === "none" ? null : (value as "cleaner" | "worker") })
        .eq("user_id", profile!.user_id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(t("common.saved"));
    },
  });

  const counts: Record<InviteRole, number> = {
    cleaner: (membersQ.data ?? []).filter((m) => m.role === "cleaner").length,
    worker: (membersQ.data ?? []).filter((m) => m.role === "worker").length,
    hr_company: (hrQ.data ?? []).length,
  };

  return (
    <>
      <PageHeader title={t("people.title")} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface space-y-3 p-5">
          <h2 className="text-lg">{t("people.roster")}</h2>
          <ul className="divide-y divide-border text-sm">
            {(membersQ.data ?? []).map((m) => {
              const p = m.profiles as unknown as
                | { display_name: string | null; username: string; email: string }
                | null;
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {p?.display_name || p?.username || m.user_id.slice(0, 8)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t(`role.${m.role as "cleaner" | "worker"}`)}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeMember.mutate(m.id)}
                    aria-label={t("people.removeMember")}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
            {(membersQ.data ?? []).length === 0 && (
              <li className="py-6 text-center text-muted-foreground">{t("common.none")}</li>
            )}
          </ul>

          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium">{t("people.hrCompanies")}</p>
            <p className="text-sm text-muted-foreground">
              {counts.hr_company} / {CAPS.hr_company}
            </p>
          </div>
        </section>

        <section className="surface space-y-4 p-5">
          <h2 className="text-lg">{t("people.codes")}</h2>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
              <SelectTrigger aria-label={t("people.role")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cleaner">{t("role.cleaner")}</SelectItem>
                <SelectItem value="worker">{t("role.worker")}</SelectItem>
                <SelectItem value="hr_company">{t("role.hr_company")}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              disabled={generate.isPending || counts[role] >= CAPS[role]}
              onClick={() => generate.mutate()}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("people.generate")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("people.cap")}: {counts[role]} / {CAPS[role]}
            {counts[role] >= CAPS[role] ? ` — ${t("people.capReached")}` : ""}
          </p>

          <ul className="divide-y divide-border text-sm">
            {(codesQ.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block font-mono">{c.code}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`role.${c.role as InviteRole}`)}
                  </span>
                </span>
                <Button size="sm" variant="outline" onClick={() => revoke.mutate(c.id)}>
                  {t("people.revoke")}
                </Button>
              </li>
            ))}
            {(codesQ.data ?? []).length === 0 && (
              <li className="py-6 text-center text-muted-foreground">{t("common.none")}</li>
            )}
          </ul>
        </section>

        <section className="surface space-y-3 p-5 lg:col-span-2">
          <h2 className="text-lg">{t("people.selfRole")}</h2>
          <p className="text-sm text-muted-foreground">{t("people.selfRoleHelp")}</p>
          <Select
            value={profile?.self_secondary_role ?? "none"}
            onValueChange={(v) => setSelfRole.mutate(v)}
          >
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("people.selfRoleNone")}</SelectItem>
              <SelectItem value="cleaner">{t("role.cleaner")}</SelectItem>
              <SelectItem value="worker">{t("role.worker")}</SelectItem>
            </SelectContent>
          </Select>
        </section>
      </div>
    </>
  );
}
