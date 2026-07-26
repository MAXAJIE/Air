import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Lock, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProfile } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { PasswordMeter } from "@/components/password-meter";
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
  address?: string | null;
  emergency_name?: string | null;
  emergency_phone?: string | null;
  selfie_path?: string | null;
};

function ProfilePage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t("profile.title")} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AccountCard />
        <SecurityCard />
        <PersonalCard />
      </div>
    </>
  );
}

function AccountCard() {
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
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  return (
    <section className="surface space-y-4 p-5">
      <h2 className="text-lg">{t("profile.account")}</h2>
      <div className="space-y-2">
        <Label htmlFor="display-name">{t("profile.displayName")}</Label>
        <Input
          id="display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
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
      <Button disabled={save.isPending} onClick={() => save.mutate()}>
        {t("common.save")}
      </Button>
    </section>
  );
}

function SecurityCard() {
  const t = useT();
  const [password, setPassword] = useState("");
  const report = scorePassword(password);

  const change = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    onSuccess: () => {
      setPassword("");
      toast.success(t("common.saved"));
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
      <Button
        disabled={report.score < 3 || password.length < 8 || change.isPending}
        onClick={() => change.mutate()}
      >
        {t("profile.changePassword")}
      </Button>
    </section>
  );
}

function PersonalCard() {
  const t = useT();
  const qc = useQueryClient();
  const { data: profile } = useProfile();

  const piiQ = useQuery({
    queryKey: ["pii", profile?.user_id],
    enabled: !!profile?.user_id,
    queryFn: async (): Promise<Pii> => {
      const { data, error } = await supabase.rpc("get_pii", { _user: profile!.user_id });
      if (error) throw error;
      return data as unknown as Pii;
    },
  });

  const [form, setForm] = useState({
    full_name: "",
    id_number: "",
    phone: "",
    dob: "",
    address: "",
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
      address: d.address ?? "",
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
        p_address: form.address,
        p_emergency_name: form.emergency_name,
        p_emergency_phone: form.emergency_phone,
        p_selfie_path: selfie ?? "",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["pii", profile?.user_id] });
      toast.success(t("common.saved"));
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

  const complete = piiQ.data?.completed === true;

  return (
    <section className="surface space-y-4 p-5 lg:col-span-2">
      <div>
        <h2 className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {t("profile.personal")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("profile.encryptedNote")}</p>
      </div>

      <p className="text-sm">{complete ? t("profile.complete") : t("profile.incomplete")}</p>

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
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pii-address">{t("profile.address")}</Label>
            <Textarea
              id="pii-address"
              rows={2}
              value={form.address}
              onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <Button disabled={save.isPending} onClick={() => save.mutate()}>
        {t("common.save")}
      </Button>
    </section>
  );
}
