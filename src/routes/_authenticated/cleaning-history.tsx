import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Eye } from "lucide-react";
import { useState } from "react";

import { EmptyState, ListSkeleton, PageHeader } from "@/components/app-shell";
import { SignedPhoto } from "@/components/signed-photo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActiveGroup } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { jobStatusChipClass, statusChipClass } from "@/lib/status-colors";

export const Route = createFileRoute("/_authenticated/cleaning-history")({
  head: () => ({
    meta: [
      { title: "Cleaning History — Keyward" },
      { name: "description", content: "Full cleaning job history." },
      { property: "og:title", content: "Cleaning History — Keyward" },
      { property: "og:description", content: "Full cleaning job history." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CleaningHistoryPage,
});

type JobRow = {
  id: string;
  status: "pending" | "in_progress" | "submitted" | "reviewed";
  property_id: string;
  template_id: string | null;
  scheduled_at: string | null;
  assigned_to_user_id: string | null;
  started_at: string | null;
  completed_at: string | null;
};

function CleaningHistoryPage() {
  const t = useT();
  const { groupId } = useActiveGroup();
  const [previewJob, setPreviewJob] = useState<JobRow | null>(null);

  const propsQ = useQuery({
    queryKey: ["properties", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, name")
        .eq("owner_group_id", groupId!);
      return data ?? [];
    },
  });

  const cleanersQ = useQuery({
    queryKey: ["all-workers", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("owner_group_id", groupId!)
        .in("role", ["cleaner", "worker"])
        .eq("status", "active");
      if (error) throw error;
      if (!data?.length) return [] as Array<{ user_id: string; name: string }>;
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username")
        .in("user_id", data.map((m) => m.user_id));
      return data.map((m) => {
        const p = profiles?.find((row) => row.user_id === m.user_id);
        return {
          user_id: m.user_id,
          name: p?.display_name || p?.username || m.user_id.slice(0, 8),
        };
      });
    },
  });

  const jobsQ = useQuery({
    queryKey: ["jobs-history", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_jobs")
        .select(
          "id, status, property_id, template_id, scheduled_at, assigned_to_user_id, started_at, completed_at",
        )
        .eq("owner_group_id", groupId!)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data as JobRow[];
    },
  });

  const propertyName = (id: string) => propsQ.data?.find((p) => p.id === id)?.name ?? "—";
  const cleanerName = (id: string | null) =>
    id ? (cleanersQ.data?.find((c) => c.user_id === id)?.name ?? id.slice(0, 8)) : t("common.unassigned");

  return (
    <>
      <Link
        to="/cleaning"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("common.back")}
      </Link>
      <PageHeader
        title={t("clean.historyTitle")}
        description={`${jobsQ.data?.length ?? 0} ${t("clean.jobs")}`}
      />

      {jobsQ.isLoading ? (
        <ListSkeleton rows={6} />
      ) : (jobsQ.data ?? []).length === 0 ? (
        <EmptyState />
      ) : (
        <section className="surface p-5">
          <ul className="divide-y divide-border text-sm">
            {(jobsQ.data ?? []).map((j, index) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 animate-card-enter transition-colors hover:bg-accent/40" style={{ animationDelay: `${index * 30}ms` }}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{propertyName(j.property_id)}</span>
                    <span className={statusChipClass("blue")}>{t("task.fromCleaning")}</span>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {j.scheduled_at ? new Date(j.scheduled_at).toLocaleString() : "—"} ·{" "}
                    {cleanerName(j.assigned_to_user_id)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={jobStatusChipClass(j.status)}>
                    {t(`clean.status.${j.status}`)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={t("tpl.preview")}
                    onClick={() => setPreviewJob(j)}
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {previewJob && (
        <HistoryPreviewDialog
          job={previewJob}
          propertyName={propertyName(previewJob.property_id)}
          cleanerName={cleanerName(previewJob.assigned_to_user_id)}
          onClose={() => setPreviewJob(null)}
        />
      )}
    </>
  );
}

function HistoryPreviewDialog({
  job,
  propertyName,
  cleanerName,
  onClose,
}: {
  job: JobRow;
  propertyName: string;
  cleanerName: string;
  onClose: () => void;
}) {
  const t = useT();
  const itemsQ = useQuery({
    queryKey: ["job-items", job.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_job_items")
        .select("id, description, is_checked, photo_url, sort_order")
        .eq("cleaning_job_id", job.id)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("clean.jobPreview")}</DialogTitle>
        </DialogHeader>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("clean.property")}</dt>
            <dd className="text-right font-medium">{propertyName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("clean.assignDirect")}</dt>
            <dd className="text-right font-medium">{cleanerName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("clean.scheduledAt")}</dt>
            <dd className="text-right font-medium">
              {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t("common.status")}</dt>
            <dd>
              <span className={jobStatusChipClass(job.status)}>{t(`clean.status.${job.status}`)}</span>
            </dd>
          </div>
        </dl>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("clean.checklist")}</p>
          <ol className="space-y-2">
            {(itemsQ.data ?? []).map((item, index) => (
              <li key={item.id} className="rounded-lg border border-border p-3 text-sm">
                <span className="font-medium">
                  {index + 1}. {item.description}
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <Checkbox checked={item.is_checked} disabled />
                  {item.is_checked && (
                    <span className={statusChipClass("green")}>{t("clean.itemDone")}</span>
                  )}
                </div>
                {item.photo_url && (
                  <SignedPhoto
                    path={item.photo_url}
                    alt={item.description}
                    className="mt-2 h-32 w-full rounded-md object-cover"
                  />
                )}
              </li>
            ))}
          </ol>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
