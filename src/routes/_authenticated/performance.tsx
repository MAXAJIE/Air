import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Clock,
  Sparkle,
  Star,
  UserRound,
} from "lucide-react";
import { useState } from "react";

import { ListSkeleton, PageHeader, StatsSkeleton } from "@/components/app-shell";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/performance")({
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
  const { data: profile } = useProfile();

  if (profile?.primary_role === "owner") return <OwnerPerformance />;
  return <CleanerPerformance cleanerUserId={profile?.user_id ?? null} />;
}

/* --------------------------- Owner: pick a cleaner --------------------------- */

function OwnerPerformance() {
  const t = useT();
  const { groupId } = useActiveGroup();
  const [cleanerId, setCleanerId] = useState<string | null>(null);

  const cleanersQ = useQuery({
    queryKey: ["perf-cleaners", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("owner_group_id", groupId!)
        .eq("role", "cleaner")
        .eq("status", "active");
      if (error) throw error;
      if (!data?.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username")
        .in("user_id", data.map((m) => m.user_id));
      return data.map((m) => ({
        userId: m.user_id,
        name:
          profiles?.find((p) => p.user_id === m.user_id)?.display_name ||
          profiles?.find((p) => p.user_id === m.user_id)?.username ||
          m.user_id.slice(0, 8),
      }));
    },
  });

  return (
    <>
      <PageHeader title={t("perf.title")} />

      <div className="mb-6 max-w-xs">
        <Select value={cleanerId ?? ""} onValueChange={setCleanerId}>
          <SelectTrigger>
            <SelectValue placeholder={t("clean.assignTo")} />
          </SelectTrigger>
          <SelectContent>
            {(cleanersQ.data ?? []).map((c) => (
              <SelectItem key={c.userId} value={c.userId}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {cleanerId ? (
        <CleanerPerformance cleanerUserId={cleanerId} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("perf.noData")}</p>
      )}
    </>
  );
}

/* --------------------------- Performance data --------------------------- */

function CleanerPerformance({ cleanerUserId }: { cleanerUserId: string | null }) {
  const t = useT();

  const dataQ = useQuery({
    queryKey: ["perf-data", cleanerUserId],
    enabled: !!cleanerUserId,
    queryFn: async () => {
      const [ratingsRes, jobsRes, checksRes] = await Promise.all([
        supabase
          .from("cleaner_ratings")
          .select("id, rating, comment, created_at")
          .eq("cleaner_user_id", cleanerUserId!)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("cleaning_jobs")
          .select("id, started_at, completed_at")
          .eq("assigned_to_user_id", cleanerUserId!)
          .not("started_at", "is", null)
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: false })
          .limit(20),
        supabase
          .from("amenity_checks")
          .select("id, actual_qty, checked_at, amenity_definition_id")
          .eq("checked_by_user_id", cleanerUserId!)
          .order("checked_at", { ascending: false })
          .limit(20),
      ]);

      // Also fetch amenity definitions for discrepancy display
      const defIds = Array.from(new Set((checksRes.data ?? []).map((c) => c.amenity_definition_id)));
      let defs: Array<{ id: string; name: string; expected_qty: number }> = [];
      if (defIds.length > 0) {
        const { data } = await supabase
          .from("amenity_definitions")
          .select("id, name, expected_qty")
          .in("id", defIds);
        defs = data ?? [];
      }

      // Annotate each check with its definition, then keep only rows where
      // the reported quantity actually diverges from what's expected — those
      // are the "discrepancies" the label promises.
      const checks = (checksRes.data ?? [])
        .map((c) => ({
          ...c,
          definition: defs.find((d) => d.id === c.amenity_definition_id),
        }))
        .filter((c) => !!c.definition && c.actual_qty !== c.definition!.expected_qty);

      return {
        ratings: ratingsRes.data ?? [],
        jobs: jobsRes.data ?? [],
        checks,
      };
    },
  });

  const data = dataQ.data;
  const ratings = data?.ratings ?? [];
  const jobs = data?.jobs ?? [];
  const checks = data?.checks ?? [];

  if (dataQ.isLoading) {
    return (
      <div className="space-y-6">
        <StatsSkeleton count={3} />
        <ListSkeleton rows={4} />
        <ListSkeleton rows={3} />
        <ListSkeleton rows={3} />
      </div>
    );
  }

  const avgRating =
    ratings.length > 0
      ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(1)
      : "—";

  const avgTime =
    jobs.length > 0
      ? (() => {
          const total = jobs.reduce((sum, j) => {
            const d = new Date(j.completed_at!).getTime() - new Date(j.started_at!).getTime();
            return sum + d;
          }, 0);
          const avg = total / jobs.length;
          const mins = Math.round(avg / 60000);
          return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
        })()
      : "—";

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface flex items-start gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
            <Star className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs uppercase tracking-wide text-muted-foreground">
              {t("dash.rating")}
            </p>
            <p className="font-display text-2xl font-semibold">{avgRating}</p>
            <p className="truncate text-xs text-muted-foreground">
              {ratings.length} {t("perf.ratings").toLowerCase()}
            </p>
          </div>
        </div>
        <div className="surface flex items-start gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs uppercase tracking-wide text-muted-foreground">
              {t("dash.avgTime")}
            </p>
            <p className="font-display text-2xl font-semibold">{avgTime}</p>
            <p className="truncate text-xs text-muted-foreground">
              {jobs.length} {t("perf.jobs").toLowerCase()}
            </p>
          </div>
        </div>
        <div className="surface flex items-start gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs uppercase tracking-wide text-muted-foreground">
              {t("dash.discrepancies")}
            </p>
            <p className="font-display text-2xl font-semibold">{checks.length}</p>
            <p className="truncate text-xs text-muted-foreground">{t("common.total").toLowerCase()}</p>
          </div>
        </div>
      </div>

      {/* Rating history */}
      <section className="surface space-y-3 p-5">
        <h2 className="text-lg">{t("perf.ratings")}</h2>
        <ul className="divide-y divide-border text-sm">
          {ratings.map((r, index) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 animate-card-enter" style={{ animationDelay: `${index * 30}ms` }}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        "h-3.5 w-3.5",
                        i < r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30",
                      )}
                      aria-hidden="true"
                    />
                  ))}
                </span>
                {r.comment && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{r.comment}</span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleDateString()}
              </span>
            </li>
          ))}
          {ratings.length === 0 && (
            <li className="py-4 text-center text-muted-foreground">{t("perf.noData")}</li>
          )}
        </ul>
      </section>

      {/* Time per job */}
      <section className="surface space-y-3 p-5">
        <h2 className="text-lg">{t("perf.times")}</h2>
        <ul className="divide-y divide-border text-sm">
          {jobs.map((j, index) => {
            const d = new Date(j.completed_at!).getTime() - new Date(j.started_at!).getTime();
            const mins = Math.round(d / 60000);
            const label = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
            return (
              <li key={j.id} className="flex items-center justify-between gap-3 py-2.5 animate-card-enter" style={{ animationDelay: `${index * 30}ms` }}>
                <span className="text-xs text-muted-foreground">
                  {new Date(j.completed_at!).toLocaleDateString()}
                </span>
                <span className="font-medium">{label}</span>
              </li>
            );
          })}
          {jobs.length === 0 && (
            <li className="py-4 text-center text-muted-foreground">{t("perf.noData")}</li>
          )}
        </ul>
      </section>

      {/* Amenity discrepancy log */}
      <section className="surface space-y-3 p-5">
        <h2 className="text-lg">{t("perf.discrepancies")}</h2>
        <ul className="divide-y divide-border text-sm">
          {checks.map((c, index) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 animate-card-enter" style={{ animationDelay: `${index * 30}ms` }}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {c.definition?.name ?? c.amenity_definition_id.slice(0, 8)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("perf.expectedVsActual")}: {c.definition?.expected_qty ?? "?"} / {c.actual_qty}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {c.checked_at ? new Date(c.checked_at).toLocaleDateString() : "—"}
              </span>
            </li>
          ))}
          {checks.length === 0 && (
            <li className="py-4 text-center text-muted-foreground">{t("perf.noData")}</li>
          )}
        </ul>
      </section>
    </div>
  );
}


