import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, Sparkles, Truck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuthUser, useProfile, type AppRole } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/onboarding/role")({
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Choose your role — Keyward" },
      { name: "description", content: "Pick how you use Keyward: owner, cleaner, worker or cleaning company." },
      { property: "og:title", content: "Choose your role — Keyward" },
      { property: "og:description", content: "Set your Keyward role once to unlock the right workspace." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RolePage,
});

const OPTIONS: { role: AppRole; icon: typeof Building2; titleKey: "role.owner" | "role.cleaner" | "role.worker" | "role.hr_company"; bodyKey: "role.ownerDesc" | "role.cleanerDesc" | "role.workerDesc" | "role.hrDesc" }[] = [
  { role: "owner", icon: Building2, titleKey: "role.owner", bodyKey: "role.ownerDesc" },
  { role: "cleaner", icon: Sparkles, titleKey: "role.cleaner", bodyKey: "role.cleanerDesc" },
  { role: "worker", icon: Truck, titleKey: "role.worker", bodyKey: "role.workerDesc" },
  { role: "hr_company", icon: Users, titleKey: "role.hr_company", bodyKey: "role.hrDesc" },
];

function RolePage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useAuthUser();
  const { data: profile, isLoading } = useProfile();
  const { next } = Route.useSearch();
  const [selected, setSelected] = useState<AppRole | null>(null);
  const [confirming, setConfirming] = useState(false);


  const save = useMutation({
    mutationFn: async (role: AppRole) => {
      const { error } = await supabase
        .from("profiles")
        .update({ primary_role: role })
        .eq("user_id", user!.id)
        .is("primary_role", null);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(t("common.saved"));
      // A pending invite code always wins: the "next=redeem" hint may have
      // been dropped by the email-confirmation round trip, but the code stashed
      // in sessionStorage still means the user came in via an invite link.
      const pendingCode = sessionStorage.getItem("pending_invite_code");
      if (pendingCode) {
        sessionStorage.removeItem("pending_invite_code");
        navigate({ to: "/people", search: { code: pendingCode }, replace: true });
      } else if (next === "redeem") {
        navigate({ to: "/people", replace: true });
      } else {
        navigate({ to: "/dashboard", replace: true });
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("common.error")),
  });

  useEffect(() => {
    if (!isLoading && profile?.primary_role) navigate({ to: "/dashboard", replace: true });
  }, [isLoading, profile?.primary_role, navigate]);


  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-display text-lg font-semibold">{t("app.name")}</span>
        <LanguageSwitcher />
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 pb-16">
        <h1 className="text-3xl">{t("role.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("role.body")}</p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {OPTIONS.map(({ role, icon: Icon, titleKey, bodyKey }) => {
            const active = selected === role;
            return (
              <button
                key={role}
                type="button"
                aria-pressed={active}
                onClick={() => setSelected(role)}
                className={cn(
                  "surface flex h-full flex-col items-start gap-3 rounded-xl border p-6 text-left transition-all",
                  active
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-border hover:border-primary/50 hover:shadow-sm",
                )}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="font-display text-lg font-semibold">{t(titleKey)}</span>
                <span className="text-sm text-muted-foreground">{t(bodyKey)}</span>
              </button>
            );
          })}
        </div>

        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <Button
            type="button"
            className="mt-8 w-full sm:w-auto"
            disabled={!selected || save.isPending}
            onClick={() => setConfirming(true)}
          >
            {t("common.confirm")}
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("role.confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("role.confirmBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction disabled={save.isPending} onClick={() => selected && save.mutate(selected)}>
                {t("common.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </main>
    </div>
  );
}
