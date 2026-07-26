import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Lock, Mail, Settings, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { AvatarCropPicker } from "@/components/avatar-crop-picker";
import { PasswordMeter } from "@/components/password-meter";
import { PhotoPicker } from "@/components/photo-picker";
import { SignedPhoto } from "@/components/signed-photo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfile } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { scorePassword } from "@/lib/password-strength";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Keyward" },
      { name: "description", content: "Your account, encrypted personal details and password." },
      { property: "og:title", content: "Profile — Keyward" },
      {
        property: "og:description",
        content: "Your account, encrypted personal details and password.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

type Pii = {
  exists: boolean;
  can_view: boolean;
  completed?: boolean;
  full_name?: string | null;
  id_number?: string | null;
  phone?: string | null;
  dob?: string | null;
  emergency_name?: string | null;
  emergency_phone?: string | null;
  selfie_path?: string | null;
};

const NAME_COOLDOWN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days left before the display name may change again, 0 when it is allowed now. */
function nameCooldownDaysLeft(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 0;
  const elapsed = Date.now() - new Date(updatedAt).getTime();
  const left = Math.ceil((NAME_COOLDOWN_DAYS * DAY_MS - elapsed) / DAY_MS);
  return left > 0 ? left : 0;
}

function ProfilePage() {
  const t = useT();
  const [editing, setEditing] = useState(false);

  return (
    <>
      <PageHeader
        title={t("profile.title")}
        action={
          <Button
            size="icon"
            variant={editing ? "default" : "outline"}
            aria-label={editing ? t("profile.donePreview") : t("profile.openSettings")}
            aria-pressed={editing}
            onClick={() => setEditing((v) => !v)}
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </Button>
        }
      />
      {editing ? <ProfileEditor onDone={() => setEditing(false)} /> : <ProfilePreview />}
    </>
  );
}

/* ------------------------------- preview ------------------------------- */

function ProfilePreview() {
  const t = useT();
  const { data: profile } = useProfile();
  const piiQ = usePii();
  const pii = piiQ.data;

  const rows: Array<[string, string]> = [
    [t("profile.fullName"), pii?.full_name || "—"],
    [t("profile.idNumber"), pii?.id_number || "—"],
    [t("profile.phone"), pii?.phone || "—"],
    [t("profile.dob"), pii?.dob || "—"],
    [t("profile.emergencyName"), pii?.emergency_name || "—"],
    [t("profile.emergencyPhone"), pii?.emergency_phone || "—"],
  ];

  return (
    <div className="space-y-4">
      <section className="surface flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
        <span className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-secondary-foreground">
          {profile?.avatar_path ? (
            <SignedPhoto
              path={profile.avatar_path}
              alt={t("avatar.label")}
              className="h-24 w-24 rounded-full object-cover"
            />
          ) : (
            <UserRound className="h-10 w-10" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 space-y-1">
          <h2 className="truncate text-2xl">{profile?.display_name || profile?.username || "—"}</h2>
          <p className="truncate text-sm text-muted-foreground">@{profile?.username}</p>
          <p className="truncate text-sm text-muted-foreground">{profile?.email}</p>
          <p className="text-xs text-muted-foreground">
            {profile?.primary_role ? t(`role.${profile.primary_role}`) : "—"} ·{" "}
            {t("profile.planPilot")}
          </p>
        </div>
      </section>

      <section className="surface space-y-4 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {t("profile.personal")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("profile.encryptedNote")}</p>
        </div>
        <p className="text-sm">
          {pii?.completed ? t("profile.complete") : t("profile.incomplete")}
        </p>
        <div className="grid gap-4 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("profile.selfie")}</p>
            <SignedPhoto
              path={pii?.selfie_path ?? null}
              alt={t("profile.selfie")}
              className="h-40 w-full object-cover"
            />
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="truncate text-sm">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="text-xs text-muted-foreground">{t("profile.previewHint")}</p>
      </section>
    </div>
  );
}

/* ------------------------------- editor ------------------------------- */

function ProfileEditor({ onDone }: { onDone: () => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AccountCard onDone={onDone} />
      <SecurityCard />
      <PersonalCard onDone={onDone} />
    </div>
  );
}

function AccountCard({ onDone }: { onDone: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [displayName, setDisplayName] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!hydrated && profile) {
      setDisplayName(profile.display_name ?? "");
      setHydrated(true);
    }
  }, [hydrated, profile]);

  const daysLeft = nameCooldownDaysLeft(profile?.display_name_updated_at);
  const nameLocked = daysLeft > 0;
  const nameChanged = (profile?.display_name ?? "") !== displayName.trim();

  const saveAvatar = useMutation({
    mutationFn: async (path: string | null) => {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_path: path })
        .eq("user_id", profile!.user_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName.trim() || null })
        .eq("user_id", profile!.user_id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(t("common.saved"));
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <section className="surface space-y-4 p-5">
      <h2 className="text-lg">{t("profile.account")}</h2>

      <div className="space-y-2">
        <Label>{t("avatar.label")}</Label>
        <AvatarCropPicker
          value={profile?.avatar_path ?? null}
          onChange={(path) => saveAvatar.mutate(path)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="display-name">{t("profile.displayName")}</Label>
        <Input
          id="display-name"
          value={displayName}
          disabled={nameLocked}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {nameLocked ? `${t("profile.nameLocked")} (${daysLeft}d)` : t("profile.nameOncePerWeek")}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">{t("profile.yourRole")}</dt>
          <dd>{profile?.primary_role ? t(`role.${profile.primary_role}`) : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("profile.plan")}</dt>
          <dd>{t("profile.planPilot")}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">{t("profile.roleLocked")}</p>
      <Button disabled={save.isPending || nameLocked || !nameChanged} onClick={() => save.mutate()}>
        {t("common.save")}
      </Button>
    </section>
  );
}

function SecurityCard() {
  const t = useT();
  const { data: profile } = useProfile();
  const [password, setPassword] = useState("");
  const report = scorePassword(password);

  const change = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // We used to also send a confirmation email via
      // supabase.auth.resetPasswordForEmail, but that trips the Supabase
      // "email rate limit exceeded" error on frequent changes and surfaces to
      // the user as a failure even though the password did update. The
      // password change itself is the source of truth.
    },
    onSuccess: () => {
      setPassword("");
      toast.success("Password changed successfully");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <section className="surface space-y-4 p-5">
      <h2 className="flex items-center gap-2 text-lg">
        <Lock className="h-4 w-4" aria-hidden="true" />
        {t("profile.security")}
      </h2>
      <div className="space-y-2">
        <Label htmlFor="new-password">{t("profile.newPassword")}</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordMeter password={password} />
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
        {t("profile.passwordEmailNote")}
      </p>
      <Button
        disabled={report.score < 3 || password.length < 8 || change.isPending}
        onClick={() => change.mutate()}
      >
        {t("profile.changePassword")}
      </Button>
    </section>
  );
}

function usePii() {
  const { data: profile } = useProfile();
  return useQuery({
    queryKey: ["pii", profile?.user_id],
    enabled: !!profile?.user_id,
    queryFn: async (): Promise<Pii> => {
      const { data, error } = await supabase.rpc("get_pii", { _user: profile!.user_id });
      if (error) throw error;
      return data as unknown as Pii;
    },
  });
}

function PersonalCard({ onDone }: { onDone: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const piiQ = usePii();

  const [form, setForm] = useState({
    full_name: "",
    id_number: "",
    phone: "",
    dob: "",
    emergency_name: "",
    emergency_phone: "",
  });
  const [selfie, setSelfie] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !piiQ.data) return;
    const d = piiQ.data;
    setForm({
      full_name: d.full_name ?? "",
      id_number: d.id_number ?? "",
      phone: d.phone ?? "",
      dob: d.dob ?? "",
      emergency_name: d.emergency_name ?? "",
      emergency_phone: d.emergency_phone ?? "",
    });
    setSelfie(d.selfie_path ?? null);
    setHydrated(true);
  }, [hydrated, piiQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("save_my_pii", {
        p_full_name: form.full_name,
        p_id_number: form.id_number,
        p_phone: form.phone,
        p_dob: form.dob,
        // Home address is no longer collected.
        p_address: "",
        p_emergency_name: form.emergency_name,
        p_emergency_phone: form.emergency_phone,
        p_selfie_path: selfie ?? "",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["pii", profile?.user_id] });
      toast.success(t("common.saved"));
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const field = (key: keyof typeof form, label: string, type = "text") => (
    <div className="space-y-2">
      <Label htmlFor={`pii-${key}`}>{label}</Label>
      <Input
        id={`pii-${key}`}
        type={type}
        value={form[key]}
        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <section className="surface space-y-4 p-5 lg:col-span-2">
      <div>
        <h2 className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {t("profile.personal")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("profile.encryptedNote")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <div className="space-y-2">
          <Label>{t("profile.selfie")}</Label>
          <PhotoPicker
            value={selfie}
            onChange={setSelfie}
            folder="selfie"
            label={t("profile.selfie")}
          />
          <p className="text-xs text-muted-foreground">{t("profile.selfieHelp")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {field("full_name", t("profile.fullName"))}
          {field("id_number", t("profile.idNumber"))}
          {field("phone", t("profile.phone"), "tel")}
          {field("dob", t("profile.dob"), "date")}
          {field("emergency_name", t("profile.emergencyName"))}
          {field("emergency_phone", t("profile.emergencyPhone"), "tel")}
        </div>
      </div>

      <Button disabled={save.isPending} onClick={() => save.mutate()}>
        {t("common.save")}
      </Button>
    </section>
  );
}
