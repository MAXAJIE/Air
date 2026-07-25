import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthUser, type AppRole } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

/** Shown when a signed-in user has a role but no group to work inside yet. */
export function GroupGate({ role }: { role: AppRole }) {
  const t = useT();
  const qc = useQueryClient();
  const { data: user } = useAuthUser();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const createGroup = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("owner_groups")
        .insert({ name: name.trim(), owner_user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-groups"] });
      toast.success(t("common.saved"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const redeem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("redeem_invite_code", { p_code: code.trim() });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-groups"] });
      toast.success(t("join.joined"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  if (role === "owner") {
    return (
      <div className="surface mx-auto max-w-lg space-y-4 p-6">
        <div>
          <h1 className="text-2xl">{t("group.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("group.body")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-name">{t("group.name")}</Label>
          <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button
          className="w-full"
          disabled={!name.trim() || createGroup.isPending}
          onClick={() => createGroup.mutate()}
        >
          {t("group.create")}
        </Button>
      </div>
    );
  }

  return (
    <div className="surface mx-auto max-w-lg space-y-4 p-6">
      <div>
        <h1 className="text-2xl">{t("join.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("join.body")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-code">{t("join.code")}</Label>
        <Input
          id="invite-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="font-mono uppercase"
        />
      </div>
      <Button
        className="w-full"
        disabled={!code.trim() || redeem.isPending}
        onClick={() => redeem.mutate()}
      >
        {t("join.join")}
      </Button>
    </div>
  );
}
