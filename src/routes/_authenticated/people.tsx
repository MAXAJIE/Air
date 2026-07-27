import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, Copy, Plus, ShieldCheck, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
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
import { randomCode } from "@/lib/files";

export const Route = createFileRoute("/_authenticated/people")({
  validateSearch: (search: Record<string, unknown>): { code?: string } => ({
    code: typeof search.code === "string" ? search.code : undefined,
  }),
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

type Person = {
  key: string;
  membershipId: string | null;
  userId: string;
  name: string;
  sub: string;
};

type PersonRow = Person & { role: "owner" | "cleaner" | "worker" };

function PeoplePage() {
  const { data: profile } = useProfile();
  if (profile && profile.primary_role !== "owner") return <MemberPeople />;
  return <OwnerPeople />;
}

/* --------------------------- owner: team roster --------------------------- */

function OwnerPeople() {
  const t = useT();
  const qc = useQueryClient();
  const { groupId } = useActiveGroup();
  const { data: profile } = useProfile();
  const [role, setRole] = useState<InviteRole>("cleaner");

  // Memberships and profiles are fetched separately: there is no foreign key
  // between them, so a PostgREST embed fails and the roster would render empty.
  const membersQ = useQuery({
    queryKey: ["members", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("id, role, status, user_id")
        .eq("owner_group_id", groupId!)
        .eq("status", "active");
      if (error) throw error;
      if (!data?.length) return [] as PersonRow[];

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, display_name, username, email")
        .in(
          "user_id",
          data.map((m) => m.user_id),
        );
      if (profileError) throw profileError;

      return data.map<PersonRow>((m) => {
        const p = profiles?.find((row) => row.user_id === m.user_id);
        return {
          key: m.id,
          membershipId: m.id,
          userId: m.user_id,
          role: m.role,
          name: p?.display_name || p?.username || m.user_id.slice(0, 8),
          sub: p?.email ?? "",
        };
      });
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
      if (!data?.length) return [] as Array<{ id: string; user_id: string; name: string; sub: string }>;
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username, email")
        .in(
          "user_id",
          data.map((h) => h.hr_company_user_id),
        );
      return data.map((h) => {
        const p = profiles?.find((row) => row.user_id === h.hr_company_user_id);
        return {
          id: h.id,
          user_id: h.hr_company_user_id,
          name: p?.display_name || p?.username || h.hr_company_user_id.slice(0, 8),
          sub: p?.email ?? "",
        };
      });
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

  // Owner-only: kick a cleaning company from this group.
  const removeCompany = useMutation({
    mutationFn: async (hrUserId: string) => {
      const { error } = await supabase.rpc("kick_hr_company", {
        p_group_id: groupId!,
        p_hr_user_id: hrUserId,
      });
      if (error) {
        // Fallback: on older DBs where the migration 20260728…_air_v3_invites_and_kick
        // has not been applied, the RPC is missing (PostgREST returns 404).
        // The `owner manages hr affiliations` RLS policy already lets the
        // group owner UPDATE the row directly, so degrade gracefully.
        const looksMissing =
          (typeof error.code === "string" && error.code === "PGRST202") ||
          /Could not find the function|not exist|404/i.test(error.message ?? "");
        if (!looksMissing) throw error;
        const { error: uErr } = await supabase
          .from("hr_affiliations")
          .update({ status: "revoked" })
          .eq("owner_group_id", groupId!)
          .eq("hr_company_user_id", hrUserId);
        if (uErr) throw uErr;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-affiliations", groupId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
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
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const byRole = (want: "cleaner" | "worker"): Person[] =>
    (membersQ.data ?? []).filter((m) => m.role === want);

  const companies: Person[] = (hrQ.data ?? []).map((h) => ({
    key: h.id,
    membershipId: null,
    userId: h.user_id,
    name: h.name,
    sub: h.sub,
  }));

  const counts: Record<InviteRole, number> = {
    cleaner: byRole("cleaner").length,
    worker: byRole("worker").length,
    hr_company: companies.length,
  };

  return (
    <>
      <PageHeader title={t("people.title")} />

      {membersQ.isError && (
        <p className="mb-4 text-sm text-destructive">
          {membersQ.error instanceof Error ? membersQ.error.message : t("common.error")}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <RoleColumn
          title={t("people.cleaners")}
          count={counts.cleaner}
          cap={CAPS.cleaner}
          people={byRole("cleaner")}
          onRemove={(id) => removeMember.mutate(id)}
        />
        <RoleColumn
          title={t("people.workers")}
          count={counts.worker}
          cap={CAPS.worker}
          people={byRole("worker")}
          onRemove={(id) => removeMember.mutate(id)}
        />
        <RoleColumn
          title={t("people.companies")}
          count={counts.hr_company}
          cap={CAPS.hr_company}
          people={companies}
          onRemove={(userId) => removeCompany.mutate(userId)}
          removeMode="userId"
          icon="shield"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="surface space-y-4 p-5">
          <div>
            <h2 className="text-lg">{t("people.codes")}</h2>
            <p className="text-sm text-muted-foreground">{t("people.inviteHint")}</p>
          </div>
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
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-accent/40">
                <span className="min-w-0">
                  <span className="block font-mono">{c.code}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`role.${c.role as InviteRole}`)}
                  </span>
                </span>
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
            {(codesQ.data ?? []).length === 0 && (
              <li className="py-6 text-center text-muted-foreground">{t("common.none")}</li>
            )}
          </ul>
        </section>

        <section className="surface space-y-3 p-5">
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

/* ------------------- cleaner / worker: who hired me ------------------- */

function MemberPeople() {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { code: urlCode } = Route.useSearch();
  const { data: profile } = useProfile();
  const [code, setCode] = useState(urlCode ?? "");
  const [hrCode, setHrCode] = useState("");

  // If a code was in the URL, clear it so it doesn't stick around
  useEffect(() => {
    if (urlCode) {
      navigate({ to: "/people", replace: true });
    }
  }, []);

  const hiresQ = useQuery({
    queryKey: ["my-hires", profile?.user_id],
    enabled: !!profile?.user_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("id, role, created_at, owner_group_id")
        .eq("user_id", profile!.user_id)
        .eq("status", "active");
      if (error) throw error;
      if (!data?.length) return [];

      const { data: groups, error: groupError } = await supabase
        .from("owner_groups")
        .select("id, name, owner_user_id")
        .in(
          "id",
          data.map((m) => m.owner_group_id),
        );
      if (groupError) throw groupError;

      const ownerIds = Array.from(new Set((groups ?? []).map((g) => g.owner_user_id)));
      const ownersRes = await supabase
        .from("profiles")
        .select("user_id, display_name, username, email")
        .in("user_id", ownerIds.length ? ownerIds : ["00000000-0000-0000-0000-000000000000"]);
      const owners = ownersRes.data;

      return data.map((m) => {
        const g = groups?.find((row) => row.id === m.owner_group_id);
        const o = owners?.find((row) => row.user_id === g?.owner_user_id);
        return {
          id: m.id,
          role: m.role,
          since: m.created_at,
          groupName: g?.name ?? m.owner_group_id.slice(0, 8),
          ownerName: o?.display_name || o?.username || "—",
          // Workers/cleaners intentionally do not see their boss's email.
          ownerEmail: "",
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
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["my-groups"] }),
        qc.invalidateQueries({ queryKey: ["my-hires"] }),
      ]);
      toast.success(t("join.joined"));
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "";
      if (msg.toLowerCase().includes("pilot team limit") || msg.toLowerCase().includes("pilot limit")) {
        toast.error(t("join.limitReached"));
      } else {
        toast.error(msg || t("common.error"));
      }
    },
  });

  const joinHr = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("redeem_hr_invite_code", { p_code: hrCode.trim() });
      if (error) throw error;
    },
    onSuccess: async () => {
      setHrCode("");
      toast.success(t("join.joined"));
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "";
      if (msg.toLowerCase().includes("pilot team limit") || msg.toLowerCase().includes("pilot limit")) {
        toast.error(t("join.limitReached"));
      } else {
        toast.error(msg || t("common.error"));
      }
    },
  });

  return (
    <>
      <PageHeader title={t("people.myHires")} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="surface space-y-3 p-5">
          <div>
            <h2 className="text-lg">{t("people.myHires")}</h2>
            <p className="text-sm text-muted-foreground">{t("people.myHiresHelp")}</p>
          </div>
          <ul className="space-y-2">
            {(hiresQ.data ?? []).map((h, index) => (
              <li
                key={h.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 sm:gap-3 sm:px-3 sm:py-2.5 animate-card-enter transition-colors hover:bg-accent/40"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{h.groupName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {h.ownerName}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                  {t(`role.${h.role as "cleaner" | "worker"}`)}
                </span>
              </li>
            ))}
            {(hiresQ.data ?? []).length === 0 && (
              <li className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                {t("people.noHires")}
              </li>
            )}
          </ul>
        </section>

        <section className="surface space-y-3 p-5">
          <div>
            <h2 className="text-lg">{t("people.joinAnother")}</h2>
            <p className="text-sm text-muted-foreground">{t("people.joinAnotherHelp")}</p>
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

        <section className="surface space-y-3 p-5">
          <div>
            <h2 className="text-lg">{t("join.hrTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("join.hrBody")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-hr-code">{t("join.code")}</Label>
            <Input
              id="join-hr-code"
              value={hrCode}
              onChange={(e) => setHrCode(e.target.value.toUpperCase())}
              className="font-mono uppercase"
            />
          </div>
          <Button disabled={!hrCode.trim() || joinHr.isPending} onClick={() => joinHr.mutate()}>
            {t("join.join")}
          </Button>
        </section>
      </div>
    </>
  );
}

function RoleColumn({
  title,
  count,
  cap,
  people,
  onRemove,
  removeMode,
  icon = "user",
}: {
  title: string;
  count: number;
  cap: number;
  people: Person[];
  onRemove?: (idOrUser: string) => void;
  removeMode?: "membership" | "userId";
  icon?: "user" | "shield";
}) {
  const t = useT();
  const Icon = icon === "shield" ? ShieldCheck : UserRound;
  const mode = removeMode ?? "membership";
  return (
    <section className="surface space-y-3 p-5">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg">{title}</h2>
        <span className="text-xs text-muted-foreground">
          {count} / {cap}
        </span>
      </header>
      <ul className="space-y-2">
        {people.map((p, index) => (            <li
                key={p.key}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 sm:gap-3 sm:px-3 sm:py-2.5 animate-card-enter transition-colors hover:bg-accent/40"
                style={{ animationDelay: `${index * 40}ms` }}
              >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{p.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{p.sub}</span>
            </span>
            {onRemove && (mode === "userId" ? p.userId : p.membershipId) && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                aria-label={t("people.removeMember")}
                onClick={() => onRemove(mode === "userId" ? p.userId : p.membershipId!)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </li>
        ))}
        {people.length === 0 && (
          <li className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
            {t("people.noneInRole")}
          </li>
        )}
      </ul>
    </section>
  );
}

// Owner-only: remove a cleaning company from the group. UI callers wire this
// to the same "Remove" affordance used for workers/cleaners.
async function kickHrCompany(groupId: string, hrUserId: string) {
    const { error } = await supabase.rpc("kick_hr_company", {
        p_group_id: groupId,
        p_hr_user_id: hrUserId,
    });
    if (error) throw error;
}
export { kickHrCompany };
