import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, UserRound } from "lucide-react";
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
import { useAuthUser } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { jobStatusChipClass } from "@/lib/status-colors";

export const Route = createFileRoute("/_authenticated/inbox")({
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

  // Jobs assigned to this HR company
  const jobsQ = useQuery({
    queryKey: ["hr-inbox", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_jobs")
        .select("id, status, scheduled_at, created_at, assigned_to_user_id, property_id")
        .eq("assigned_hr_company_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Property names
  const propsQ = useQuery({
    queryKey: ["hr-inbox-props", jobsQ.data?.length],
    enabled: (jobsQ.data ?? []).length > 0,
    queryFn: async () => {
      const propIds = Array.from(new Set((jobsQ.data ?? []).map((j) => j.property_id)));
      const { data } = await supabase
        .from("properties")
        .select("id, name")
        .in("id", propIds.length ? propIds : ["00000000-0000-0000-0000-000000000000"]);
      return data ?? [];
    },
  });

  // Roster (cleaners who can be assigned)
  const rosterQ = useQuery({
    queryKey: ["hr-inbox-roster", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_company_roster")
        .select("id, cleaner_user_id")
        .eq("hr_company_user_id", user!.id)
        .eq("status", "active");
      if (error) throw error;
      if (!data?.length) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username")
        .in("user_id", data.map((r) => r.cleaner_user_id));

      return data.map((r) => ({
        userId: r.cleaner_user_id,
        name:
          profiles?.find((p) => p.user_id === r.cleaner_user_id)?.display_name ||
          profiles?.find((p) => p.user_id === r.cleaner_user_id)?.username ||
          r.cleaner_user_id.slice(0, 8),
      }));
    },
  });

  const assign = useMutation({
    mutationFn: async ({ jobId, cleanerUserId }: { jobId: string; cleanerUserId: string }) => {
      const { error } = await supabase
        .from("cleaning_jobs")
        .update({ assigned_to_user_id: cleanerUserId })
        .eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["hr-inbox", user?.id] });
      toast.success(t("hr.assigned"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const jobs = jobsQ.data ?? [];
  const props = propsQ.data ?? [];
  const roster = rosterQ.data ?? [];

  const propName = (id: string) => props.find((p) => p.id === id)?.name ?? "—";
  const cleanerName = (id: string | null) =>
    id ? (roster.find((r) => r.userId === id)?.name ?? id.slice(0, 8)) : t("common.unassigned");

  return (
    <>
      <PageHeader title={t("hr.inbox")} />

      <section className="surface p-5">
        <ul className="divide-y divide-border text-sm">
          {jobs.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate font-medium">{propName(j.property_id)}</span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {j.scheduled_at ? new Date(j.scheduled_at).toLocaleString() : "—"}
                </span>
              </span>
              <span className={jobStatusChipClass(j.status)}>
                {t(`clean.status.${j.status}`)}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {j.assigned_to_user_id ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                    {cleanerName(j.assigned_to_user_id)}
                  </span>
                ) : roster.length > 0 ? (
                  <Select
                    onValueChange={(v) => assign.mutate({ jobId: j.id, cleanerUserId: v })}
                  >
                    <SelectTrigger className="h-8 w-36">
                      <SelectValue placeholder={t("hr.assignCleaner")} />
                    </SelectTrigger>
                    <SelectContent>
                      {roster.map((r) => (
                        <SelectItem key={r.userId} value={r.userId}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("common.none")}</span>
                )}
              </span>
            </li>
          ))}
          {jobs.length === 0 && (
            <li className="py-8 text-center text-muted-foreground">{t("hr.noRequests")}</li>
          )}
        </ul>
      </section>
    </>
  );
}
