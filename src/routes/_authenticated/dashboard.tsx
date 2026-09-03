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

import { PageHeader, StatCard, StatsSkeleton, ListSkeleton } from "@/components/app-shell";
import { useActiveGroup, useAuthUser, useProfile } from "@/hooks/use-app";
import { useT, type TranslationKey } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";


// Total tasks (all statuses) across the group — displayed alongside the other stats.
function useTotalTasksCount(groupId: string | null | undefined) {
    return useQuery({
        queryKey: ["dash-total-tasks", groupId],
        enabled: !!groupId,
        queryFn: async () => {
            const { count, error } = await supabase
                .from("tasks")
                .select("id", { count: "exact", head: true })
                .eq("owner_group_id", groupId!);
            if (error) throw error;
            return count ?? 0;
        },
    });
}

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
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <section className="surface p-5">
      <h2 className="mb-3 text-lg">{title}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("common.none")}</p>
      ) : (
        <ul className="space-y-2.5">
          {data.map((bucket, i) => (
            <li key={bucket.name} className="text-sm">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="truncate">{bucket.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{bucket.value}</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full transition-[width] duration-500"
                  style={{ width: `${(bucket.value / max) * 100}%`, background: CHART[i % CHART.length] }}
                />
              </div>
            </li>
          ))}
        </ul>
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
          <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-accent/40">
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

/** One actionable row: what happened, where, and how urgent. */
function AttentionRow({
  tone,
  title,
  detail,
  when,
  propertyId,
}: {
  tone: "urgent" | "warn" | "info";
  title: string;
  detail: string;
  when: string;
  propertyId?: string;
}) {
  const dot =
    tone === "urgent" ? "bg-destructive" : tone === "warn" ? "bg-amber-500" : "bg-blue-500";
  return (
    <li className="flex items-start gap-3 py-3">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {propertyId ? (
          <Link
            to="/properties/$propertyId"
            params={{ propertyId }}
            className="truncate font-medium hover:underline"
          >
            {title}
          </Link>
        ) : (
          <p className="truncate font-medium">{title}</p>
        )}
        <p className="truncate text-sm text-muted-foreground">{detail}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{when}</span>
    </li>
  );
}

function OwnerDashboard() {
  const t = useT();
  const { groupId } = useActiveGroup();

  const { data, isLoading } = useQuery({
    queryKey: ["dash-owner", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const [props, statuses, jobs, checks, requests] = await Promise.all([
        supabase.from("properties").select("id, name, status_id").eq("owner_group_id", groupId!),
        supabase.from("property_statuses").select("id, label").eq("owner_group_id", groupId!),
        supabase
          .from("cleaning_jobs")
          .select("id, status, property_id, scheduled_at, created_at, assigned_to_user_id")
          .eq("owner_group_id", groupId!)
          .neq("status", "reviewed")
          .order("scheduled_at", { ascending: true })
          .limit(50),
        supabase
          .from("amenity_checks")
          .select("id, is_discrepancy, property_id, checked_at")
          .eq("is_discrepancy", true)
          .order("checked_at", { ascending: false })
          .limit(200),
        supabase
          .from("special_requests")
          .select("id, status, property_id, description, created_at")
          .neq("status", "resolved")
          .order("created_at", { ascending: false })
          .limit(50),
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

  /**
   * The dashboard answers one question: what needs a decision today. Cleans,
   * complaints and missing amenities are merged into a single urgency-sorted
   * feed so the state of the business reads in one glance.
   */
  const view = useMemo(() => {
    const properties = data?.properties ?? [];
    const nameById = new Map(properties.map((p) => [p.id, p.name]));
    const mine = new Set(properties.map((p) => p.id));
    const statusById = new Map((data?.statuses ?? []).map((st) => [st.id, st.label]));
    const now = Date.now();
    const endOfToday = new Date().setHours(23, 59, 59, 999);

    const when = (iso: string | null) => {
      if (!iso) return { tone: "info" as const, label: t("dash.later"), order: 2 };
      const ts = new Date(iso).getTime();
      if (ts < now) return { tone: "urgent" as const, label: t("dash.overdue"), order: 0 };
      if (ts <= endOfToday) return { tone: "warn" as const, label: t("dash.todayLabel"), order: 1 };
      return { tone: "info" as const, label: new Date(iso).toLocaleDateString(), order: 2 };
    };

    const cleaning = (data?.jobs ?? [])
      .filter((j) => mine.has(j.property_id))
      .map((j) => {
        const w = when(j.scheduled_at ?? j.created_at);
        return {
          key: `job-${j.id}`,
          tone: w.tone,
          order: w.order,
          title: nameById.get(j.property_id) ?? t("clean.property"),
          detail: `${t(`clean.status.${j.status}` as TranslationKey)} · ${
            j.assigned_to_user_id ? t("clean.assignTo") : t("dash.unassigned")
          }`,
          when: w.label,
          propertyId: j.property_id,
        };
      });

    const complaints = (data?.requests ?? [])
      .filter((r) => mine.has(r.property_id))
      .map((r) => ({
        key: `req-${r.id}`,
        tone: "urgent" as const,
        order: 0,
        title: nameById.get(r.property_id) ?? t("clean.property"),
        detail: r.description,
        when: new Date(r.created_at).toLocaleDateString(),
        propertyId: r.property_id,
      }));

    const amenity = (data?.checks ?? []).filter((c) => mine.has(c.property_id));

    return {
      feed: [...complaints, ...cleaning].sort((a, b) => a.order - b.order),
      cleaningCount: cleaning.length,
      complaintCount: complaints.length,
      amenityCount: amenity.length,
      total: properties.length,
      ready: properties.filter((p) => statusById.get(p.status_id ?? "") === "Ready").length,
    };
  }, [data, t]);

  if (isLoading) {
    return (
      <>
        <StatsSkeleton count={3} />
        <div className="mt-6">
          <ListSkeleton rows={6} />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("dash.complaintsOpen")} value={view.complaintCount} icon={MessageSquare} delay={0} />
        <StatCard label={t("dash.needsCleaning")} value={view.cleaningCount} icon={Sparkle} delay={80} />
        <StatCard label={t("dash.amenityShort")} value={view.amenityCount} icon={AlertTriangle} delay={160} />
      </div>

      <section className="surface mt-6 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg">{t("dash.attention")}</h2>
          <Link to="/cleaning" className="text-sm text-muted-foreground hover:underline">
            {t("dash.viewAll")}
          </Link>
        </div>
        <ul className="divide-y divide-border">
          {view.feed.slice(0, 8).map((row) => (
            <AttentionRow
              key={row.key}
              tone={row.tone}
              title={row.title}
              detail={row.detail}
              when={row.when}
              propertyId={row.propertyId}
            />
          ))}
          {view.feed.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">{t("dash.allClear")}</li>
          )}
        </ul>
      </section>

      <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Building2 className="h-4 w-4" aria-hidden="true" />
        {view.ready}/{view.total} {t("dash.properties")}
      </p>
    </>
  );
}

function CleanerDashboard() {
  const t = useT();
  const { data: user } = useAuthUser();

  const { data, isLoading } = useQuery({
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
  // Job to do / running / finished are driven off `tasks` so the numbers match
  // the Tasks page (cleaning_jobs counts under-reported the real workload).
  const todo = tasks.filter((t) => t.status === "pending").length;
  const running = tasks.filter((t) => t.status === "in_progress").length;
  const finished = tasks.filter(
    (t) => t.status === "submitted" || t.status === "done",
  ).length;

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
  ].slice(0, 8);  if (isLoading) {
    return (
      <>
        <StatsSkeleton count={3} />
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <ListSkeleton rows={3} />
          <ListSkeleton rows={5} />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label={t("dash.jobsToDo")} value={todo} icon={ClipboardList} delay={0} />
        <StatCard label={t("dash.jobsRunning")} value={running} icon={Sparkle} delay={80} />
        <StatCard label={t("dash.jobsDone")} value={finished} icon={CheckCircle2} delay={160} />
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

  const { data, isLoading } = useQuery({
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
  ].slice(0, 8);

  if (isLoading) {
    return (
      <>
        <StatsSkeleton count={4} />
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <ListSkeleton rows={4} />
          <ListSkeleton rows={5} />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("dash.myOrders")} value={openOrders} icon={ShoppingCart} delay={0} />
        <StatCard label={t("dash.myRequests")} value={openRequests} icon={MessageSquare} delay={80} />
        <StatCard label={t("dash.myTasks")} value={openTasks} icon={ListChecks} delay={160} />
        <StatCard label={t("dash.ordersHandled")} value={orders.length} icon={CheckCircle2} delay={240} />
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

  const { data, isLoading } = useQuery({
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

  if (isLoading) {
    return (
      <>
        <StatsSkeleton count={4} />
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <ListSkeleton rows={4} />
          <ListSkeleton rows={5} />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("dash.owners")} value={owners} icon={Handshake} delay={0} />
        <StatCard label={t("dash.rosterSize")} value={roster} icon={Users} delay={80} />
        <StatCard label={t("dash.pendingRequests")} value={openJobs} icon={ClipboardList} delay={160} />
        <StatCard label={t("dash.needsCleaner")} value={unassigned} icon={AlertTriangle} delay={240} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <CountBars title={t("dash.companyJobLoad")} data={buckets} />
        <ActivityList rows={activity} />
      </div>
    </>
  );
}
