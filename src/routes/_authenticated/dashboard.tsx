import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardList,
  Handshake,
  ListChecks,
  MessageSquare,
  ShoppingCart,
  Sparkle,
  Users,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageHeader, StatCard } from "@/components/app-shell";
import { useActiveGroup, useAuthUser, useProfile } from "@/hooks/use-app";
import { useT, type TranslationKey } from "@/i18n";
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

type Bucket = { name: string; value: number };

/**
 * Counts read far better as ranked bars than as a donut: the categories are
 * ordinal workload buckets, not parts of a meaningful whole.
 */
function CountBars({ title, data }: { title: string; data: Bucket[] }) {
  const t = useT();
  return (
    <section className="surface p-5">
      <h2 className="mb-3 text-lg">{title}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("common.none")}</p>
      ) : (
        <div style={{ height: Math.max(160, data.length * 44) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke="var(--color-border)" />
              <XAxis
                type="number"
                allowDecimals={false}
                stroke="var(--color-muted-foreground)"
                fontSize={12}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                stroke="var(--color-muted-foreground)"
                fontSize={12}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  color: "var(--color-card-foreground)",
                }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART[i % CHART.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

type ActivityRow = { id: string; title: string; meta: string; to?: { propertyId: string } };

/** Activity feed. Property links are only ever rendered for owners. */
function ActivityList({ rows }: { rows: ActivityRow[] }) {
  const t = useT();
  return (
    <section className="surface p-5">
      <h2 className="mb-3 text-lg">{t("dash.recent")}</h2>
      <ul className="divide-y divide-border text-sm">
        {rows.slice(0, 8).map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
            {row.to ? (
              <Link
                to="/properties/$propertyId"
                params={{ propertyId: row.to.propertyId }}
                className="truncate font-medium hover:underline"
              >
                {row.title}
              </Link>
            ) : (
              <span className="truncate font-medium">{row.title}</span>
            )}
            <span className="shrink-0 text-xs text-muted-foreground">{row.meta}</span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="py-6 text-center text-muted-foreground">{t("common.none")}</li>
        )}
      </ul>
    </section>
  );
}

const TASK_STATUS_KEY: Record<string, TranslationKey> = {
  pending: "task.pending",
  in_progress: "task.inProgress",
  submitted: "task.submitted",
  done: "task.done",
};

function shortDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function Dashboard() {
  const t = useT();
  const navigate = useNavigate();
  const { data: profile, isLoading } = useProfile();

  // Role is set once; anyone without one lands on the role picker first.
  useEffect(() => {
    if (!isLoading && profile && !profile.primary_role) {
      navigate({ to: "/onboarding/role", replace: true });
    }
  }, [isLoading, profile, navigate]);

  const role = profile?.primary_role ?? null;

  return (
    <>
      <PageHeader title={t("nav.dashboard")} description={profile?.email ?? undefined} />
      {role === "owner" && <OwnerDashboard />}
      {role === "cleaner" && <CleanerDashboard />}
      {role === "worker" && <WorkerDashboard />}
      {role === "hr_company" && <HrDashboard />}
    </>
  );
}

function OwnerDashboard() {
  const t = useT();
  const { groupId } = useActiveGroup();

  const { data } = useQuery({
    queryKey: ["dash-owner", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const [props, statuses, jobs, checks, requests] = await Promise.all([
        supabase.from("properties").select("id, name, status_id").eq("owner_group_id", groupId!),
        supabase.from("property_statuses").select("id, label").eq("owner_group_id", groupId!),
        supabase
          .from("cleaning_jobs")
          .select("id, status, property_id, scheduled_at, created_at")
          .eq("owner_group_id", groupId!)
          .order("created_at", { ascending: false })
          .limit(50),
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
      dist: [...dist]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    };
  }, [data]);

  const activity: ActivityRow[] = useMemo(() => {
    const nameById = new Map((data?.properties ?? []).map((p) => [p.id, p.name]));
    return (data?.jobs ?? []).map((job) => ({
      id: job.id,
      title: nameById.get(job.property_id) ?? t("clean.property"),
      meta: `${t(`clean.status.${job.status}` as TranslationKey)} · ${shortDate(job.scheduled_at ?? job.created_at)}`,
      to: { propertyId: job.property_id },
    }));
  }, [data, t]);

  return (
    <>
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
        <CountBars title={t("dash.byStatus")} data={stats.dist} />
        <ActivityList rows={activity} />
      </div>
    </>
  );
}

function CleanerDashboard() {
  const t = useT();
  const { data: user } = useAuthUser();

  const { data } = useQuery({
    queryKey: ["dash-cleaner", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [jobs, tasks] = await Promise.all([
        supabase
          .from("cleaning_jobs")
          .select("id, status, scheduled_at, completed_at, created_at")
          .eq("assigned_to_user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("tasks")
          .select("id, title, status, due_at, created_at")
          .eq("assigned_to_user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      return { jobs: jobs.data ?? [], tasks: tasks.data ?? [] };
    },
  });

  const jobs = data?.jobs ?? [];
  const tasks = data?.tasks ?? [];
  const todo = jobs.filter((j) => j.status === "pending").length;
  const running = jobs.filter((j) => j.status === "in_progress").length;
  const finished = jobs.filter((j) => j.status === "submitted" || j.status === "reviewed").length;
  const openTasks = tasks.filter((task) => task.status !== "done").length;

  const buckets: Bucket[] = (["pending", "in_progress", "submitted", "reviewed"] as const)
    .map((status) => ({
      name: t(`clean.status.${status}` as TranslationKey),
      value: jobs.filter((j) => j.status === status).length,
    }))
    .filter((bucket) => bucket.value > 0);

  // Cleaners see their own work only — never a property record they can open.
  const activity: ActivityRow[] = [
    ...jobs.slice(0, 6).map((job) => ({
      id: `job-${job.id}`,
      title: t("dash.jobEntry"),
      meta: `${t(`clean.status.${job.status}` as TranslationKey)} · ${shortDate(job.scheduled_at ?? job.created_at)}`,
    })),
    ...tasks.slice(0, 6).map((task) => ({
      id: `task-${task.id}`,
      title: task.title,
      meta: `${t(TASK_STATUS_KEY[task.status] ?? "task.pending")} · ${shortDate(task.due_at ?? task.created_at)}`,
    })),
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("dash.jobsToDo")} value={todo} icon={ClipboardList} />
        <StatCard label={t("dash.jobsRunning")} value={running} icon={Sparkle} />
        <StatCard label={t("dash.jobsDone")} value={finished} icon={CheckCircle2} />
        <StatCard label={t("dash.myTasks")} value={openTasks} icon={ListChecks} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <CountBars title={t("dash.myJobLoad")} data={buckets} />
        <ActivityList rows={activity} />
      </div>
    </>
  );
}

function WorkerDashboard() {
  const t = useT();
  const { data: user } = useAuthUser();

  const { data } = useQuery({
    queryKey: ["dash-worker", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [orders, requests, tasks] = await Promise.all([
        supabase
          .from("shopping_orders")
          .select("id, status, total_amount, created_at")
          .eq("assigned_worker_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("special_requests")
          .select("id, status, description, created_at")
          .eq("assigned_to_user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("tasks")
          .select("id, title, status, due_at, created_at")
          .eq("assigned_to_user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      return { orders: orders.data ?? [], requests: requests.data ?? [], tasks: tasks.data ?? [] };
    },
  });

  const orders = data?.orders ?? [];
  const requests = data?.requests ?? [];
  const tasks = data?.tasks ?? [];
  const openOrders = orders.filter((o) => o.status !== "verified").length;
  const openRequests = requests.filter((r) => r.status === "open").length;
  const openTasks = tasks.filter((task) => task.status !== "done").length;

  const statusCounts = new Map<string, number>();
  for (const order of orders) statusCounts.set(order.status, (statusCounts.get(order.status) ?? 0) + 1);
  const buckets: Bucket[] = [...statusCounts].map(([name, value]) => ({ name, value }));

  const activity: ActivityRow[] = [
    ...orders.slice(0, 6).map((order) => ({
      id: `order-${order.id}`,
      title: t("dash.orderEntry"),
      meta: `${order.status} · ${shortDate(order.created_at)}`,
    })),
    ...requests.slice(0, 6).map((request) => ({
      id: `req-${request.id}`,
      title: request.description,
      meta: `${request.status} · ${shortDate(request.created_at)}`,
    })),
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("dash.myOrders")} value={openOrders} icon={ShoppingCart} />
        <StatCard label={t("dash.myRequests")} value={openRequests} icon={MessageSquare} />
        <StatCard label={t("dash.myTasks")} value={openTasks} icon={ListChecks} />
        <StatCard label={t("dash.ordersHandled")} value={orders.length} icon={CheckCircle2} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <CountBars title={t("dash.myOrderLoad")} data={buckets} />
        <ActivityList rows={activity} />
      </div>
    </>
  );
}

function HrDashboard() {
  const t = useT();
  const { data: user } = useAuthUser();

  const { data } = useQuery({
    queryKey: ["dash-hr", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [owners, roster, jobs] = await Promise.all([
        supabase
          .from("hr_affiliations")
          .select("id, status, created_at")
          .eq("hr_company_user_id", user!.id),
        supabase
          .from("hr_company_roster")
          .select("id, status")
          .eq("hr_company_user_id", user!.id),
        supabase
          .from("cleaning_jobs")
          .select("id, status, scheduled_at, created_at, assigned_to_user_id")
          .eq("assigned_hr_company_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      return { owners: owners.data ?? [], roster: roster.data ?? [], jobs: jobs.data ?? [] };
    },
  });

  const owners = (data?.owners ?? []).filter((o) => o.status === "active").length;
  const roster = (data?.roster ?? []).filter((r) => r.status === "active").length;
  const jobs = data?.jobs ?? [];
  const unassigned = jobs.filter((j) => !j.assigned_to_user_id && j.status !== "reviewed").length;
  const openJobs = jobs.filter((j) => j.status !== "reviewed").length;

  const buckets: Bucket[] = (["pending", "in_progress", "submitted", "reviewed"] as const)
    .map((status) => ({
      name: t(`clean.status.${status}` as TranslationKey),
      value: jobs.filter((j) => j.status === status).length,
    }))
    .filter((bucket) => bucket.value > 0);

  // Cleaning companies see the job pipeline, never the owner's property records.
  const activity: ActivityRow[] = jobs.slice(0, 8).map((job) => ({
    id: job.id,
    title: job.assigned_to_user_id ? t("dash.jobAssigned") : t("dash.jobNeedsCleaner"),
    meta: `${t(`clean.status.${job.status}` as TranslationKey)} · ${shortDate(job.scheduled_at ?? job.created_at)}`,
  }));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("dash.owners")} value={owners} icon={Handshake} />
        <StatCard label={t("dash.rosterSize")} value={roster} icon={Users} />
        <StatCard label={t("dash.pendingRequests")} value={openJobs} icon={ClipboardList} />
        <StatCard label={t("dash.needsCleaner")} value={unassigned} icon={AlertTriangle} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <CountBars title={t("dash.companyJobLoad")} data={buckets} />
        <ActivityList rows={activity} />
      </div>
    </>
  );
}
