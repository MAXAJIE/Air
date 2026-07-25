import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Building2, MessageSquare, Sparkle } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { PageHeader, StatCard } from "@/components/app-shell";
import { useActiveGroup, useProfile } from "@/hooks/use-app";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Keyward" },
      { name: "description", content: "Your Keyward property operations overview." },
      { property: "og:title", content: "Dashboard — Keyward" },
      { property: "og:description", content: "Your Keyward property operations overview." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

const CHART = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function Dashboard() {
  const t = useT();
  const navigate = useNavigate();
  const { data: profile, isLoading } = useProfile();
  const { groupId } = useActiveGroup();

  // Role is set once; anyone without one lands on the role picker first.
  useEffect(() => {
    if (!isLoading && profile && !profile.primary_role) {
      navigate({ to: "/onboarding/role", replace: true });
    }
  }, [isLoading, profile, navigate]);

  const { data } = useQuery({
    queryKey: ["dash", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const [props, statuses, jobs, checks, requests] = await Promise.all([
        supabase.from("properties").select("id, name, status_id").eq("owner_group_id", groupId!),
        supabase.from("property_statuses").select("id, label").eq("owner_group_id", groupId!),
        supabase
          .from("cleaning_jobs")
          .select("id, status, property_id, created_at")
          .eq("owner_group_id", groupId!),
        supabase.from("amenity_checks").select("id, is_discrepancy, property_id").limit(500),
        supabase.from("special_requests").select("id, status, property_id").eq("status", "open"),
      ]);
      return {
        properties: props.data ?? [],
        statuses: statuses.data ?? [],
        jobs: jobs.data ?? [],
        checks: checks.data ?? [],
        requests: requests.data ?? [],
      };
    },
  });

  const stats = useMemo(() => {
    const properties = data?.properties ?? [];
    const statusById = new Map((data?.statuses ?? []).map((s) => [s.id, s.label]));
    const propIds = new Set(properties.map((p) => p.id));
    const ready = properties.filter((p) => statusById.get(p.status_id ?? "") === "Ready").length;
    const openJobs = (data?.jobs ?? []).filter((j) => j.status !== "reviewed").length;
    const discrepancies = (data?.checks ?? []).filter(
      (c) => c.is_discrepancy && propIds.has(c.property_id),
    ).length;
    const requests = (data?.requests ?? []).filter((r) => propIds.has(r.property_id)).length;

    const dist = new Map<string, number>();
    for (const p of properties) {
      const label = statusById.get(p.status_id ?? "") ?? "Unassigned";
      dist.set(label, (dist.get(label) ?? 0) + 1);
    }
    return {
      total: properties.length,
      ready,
      openJobs,
      discrepancies,
      requests,
      dist: [...dist].map(([name, value]) => ({ name, value })),
    };
  }, [data]);

  return (
    <>
      <PageHeader title={t("nav.dashboard")} description={profile?.email ?? undefined} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("dash.properties")}
          value={stats.total}
          icon={Building2}
          hint={`${stats.ready} ${t("prop.statusList")}`}
        />
        <StatCard label={t("dash.openJobs")} value={stats.openJobs} icon={Sparkle} />
        <StatCard label={t("dash.discrepancies")} value={stats.discrepancies} icon={AlertTriangle} />
        <StatCard label={t("dash.requests")} value={stats.requests} icon={MessageSquare} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <section className="surface p-5">
          <h2 className="mb-3 text-lg">{t("prop.statusList")}</h2>
          {stats.dist.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("common.none")}</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.dist} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78}>
                    {stats.dist.map((_, i) => (
                      <Cell key={i} fill={CHART[i % CHART.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="surface p-5">
          <h2 className="mb-3 text-lg">{t("dash.recent")}</h2>
          <ul className="divide-y divide-border text-sm">
            {(data?.properties ?? []).slice(0, 8).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link
                  to="/properties/$propertyId"
                  params={{ propertyId: p.id }}
                  className="truncate font-medium hover:underline"
                >
                  {p.name}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {(data?.statuses ?? []).find((s) => s.id === p.status_id)?.label ?? "—"}
                </span>
              </li>
            ))}
            {(data?.properties ?? []).length === 0 && (
              <li className="py-6 text-center text-muted-foreground">{t("common.none")}</li>
            )}
          </ul>
        </section>
      </div>
    </>
  );
}
