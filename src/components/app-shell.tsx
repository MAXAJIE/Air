import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Boxes,
  Building2,
  ClipboardList,
  Gauge,
  Handshake,
  History,
  Inbox,
  ListChecks,
  LogOut,
  ShoppingCart,
  Sparkle,
  Star,
  TrendingUp,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { GroupGate } from "@/components/group-gate";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveGroup, useProfile, type AppRole } from "@/hooks/use-app";
import {
  NOTIF_TO_ROUTE,
  type AppNotification,
  computeBadges,
  notifUrl,
  useMarkAllRead,
  useMarkRead,
  useMarkRouteRead,
  useUnreadNotifications,
} from "@/hooks/use-notifications";
import { useT, type TranslationKey } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type NavItem = { to: string; labelKey: TranslationKey; icon: LucideIcon };

const NAV: Record<AppRole, NavItem[]> = {
  owner: [
    { to: "/dashboard", labelKey: "nav.dashboard", icon: Gauge },
    { to: "/properties", labelKey: "nav.properties", icon: Building2 },
    { to: "/people", labelKey: "nav.people", icon: Users },
    { to: "/cleaning", labelKey: "nav.cleaning", icon: Sparkle },
    { to: "/shop", labelKey: "nav.shop", icon: ShoppingCart },
    { to: "/tasks", labelKey: "nav.tasks", icon: ListChecks },
    { to: "/performance", labelKey: "nav.performance", icon: TrendingUp },
    { to: "/reviews", labelKey: "nav.reviews", icon: Star },
    { to: "/activity", labelKey: "nav.activity", icon: History },
    { to: "/profile", labelKey: "nav.profile", icon: User },
  ],
  cleaner: [
    { to: "/dashboard", labelKey: "nav.dashboard", icon: Gauge },
    { to: "/jobs", labelKey: "nav.jobs", icon: ClipboardList },
    { to: "/people", labelKey: "nav.myHires", icon: Users },
    { to: "/tasks", labelKey: "nav.tasks", icon: ListChecks },
    { to: "/history", labelKey: "nav.history", icon: ListChecks },
    { to: "/performance", labelKey: "nav.performance", icon: TrendingUp },
    { to: "/activity", labelKey: "nav.activity", icon: History },
    { to: "/profile", labelKey: "nav.profile", icon: User },
  ],
  worker: [
    { to: "/dashboard", labelKey: "nav.dashboard", icon: Gauge },
    { to: "/jobs", labelKey: "nav.jobs", icon: ClipboardList },
    { to: "/people", labelKey: "nav.myHires", icon: Users },
    { to: "/tasks", labelKey: "nav.tasks", icon: ListChecks },
    { to: "/history", labelKey: "nav.history", icon: ListChecks },
    { to: "/activity", labelKey: "nav.activity", icon: History },
    { to: "/profile", labelKey: "nav.profile", icon: User },
  ],
  hr_company: [
    { to: "/dashboard", labelKey: "nav.dashboard", icon: Gauge },
    { to: "/inbox", labelKey: "nav.inbox", icon: Inbox },
    { to: "/roster", labelKey: "nav.roster", icon: Boxes },
    { to: "/agencies", labelKey: "nav.agencies", icon: Handshake },
    { to: "/tasks", labelKey: "nav.tasks", icon: ListChecks },
    { to: "/reviews", labelKey: "nav.reviews", icon: Star },
    { to: "/activity", labelKey: "nav.activity", icon: History },
    { to: "/profile", labelKey: "nav.profile", icon: User },
  ],
};

const RAIL = "72px";

function RailButton({
  label,
  active,
  to,
  onClick,
  danger,
  badge,
  children,
}: {
  label: string;
  active?: boolean;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
  badge?: number;
  children: ReactNode;
}) {
  const base =
    "group/link relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 ease-out";
  const state = active
    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
    : danger
      ? "text-sidebar-foreground/60 hover:bg-destructive/15 hover:text-destructive"
      : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

  const inner = (
    <>
      {active && (
        <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
      )}
      <span className="relative transition-transform duration-200 ease-out group-hover/link:scale-110">
        {children}
        {badge != null && badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-sidebar">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="pointer-events-none absolute left-full z-50 ml-3 translate-x-[-6px] whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-lg transition-all duration-200 ease-out group-hover/link:translate-x-0 group-hover/link:opacity-100">
        {label}
        <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-foreground" />
      </span>
    </>
  );

  if (to) {
    return (
      <Link to={to} aria-label={label} className={cn(base, state)}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cn(base, state)}>
      {inner}
    </button>
  );
}

function NotificationBell({ notifications: items }: { notifications: AppNotification[] }) {
  const t = useT();
  const navigate = useNavigate();
  const markAllRead = useMarkAllRead();
  const markRead = useMarkRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const total = items.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={t("notif.title")}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-80 origin-top-right rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <span className="text-sm font-medium">{t("notif.title")}</span>
              {total > 0 && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => markAllRead.mutate()}
                >
                  {t("notif.markRead")}
                </button>
              )}
            </div>
            <ul className="max-h-80 divide-y divide-border overflow-y-auto text-sm">
              {items.slice(0, 20).map((notif) => (
                <li key={notif.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted"
                    onClick={() => {
                      markRead.mutate(notif.id);
                      setOpen(false);
                      window.location.assign(notifUrl(notif));
                    }}
                  >
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {t(`notif.${notif.type}` as TranslationKey)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {new Date(notif.created_at).toLocaleDateString()}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {items.length === 0 && (
                <li className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {t("notif.empty")}
                </li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: profile } = useProfile();
  const { groups, groupId, setGroupId, loading } = useActiveGroup();
  const [confirmOut, setConfirmOut] = useState(false);

  // Notification badges
  const { data: notifications } = useUnreadNotifications();
  const badges = computeBadges(notifications ?? []);

  // Auto-mark notifications as read when navigating to matching pages
  const markRouteRead = useMarkRouteRead();
  const [lastMarkedPath, setLastMarkedPath] = useState("");

  useEffect(() => {
    if (!notifications || !pathname || pathname === lastMarkedPath) return;

    const matchingRoute = Object.values(NOTIF_TO_ROUTE).find((route) =>
      pathname === route || pathname.startsWith(route + "/"),
    );

    if (matchingRoute) {
      markRouteRead.mutate(matchingRoute);
      setLastMarkedPath(pathname);
    }
  }, [pathname, notifications, lastMarkedPath, markRouteRead]);

  const role: AppRole = profile?.primary_role ?? "owner";
  const nav = NAV[role];

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const needsGroup = !loading && !!profile?.primary_role && groups.length === 0;

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ ["--rail" as string]: RAIL }}>
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden flex-col items-center border-r border-sidebar-border bg-sidebar md:flex"
        style={{ width: RAIL }}
      >
        <div className="flex w-full items-center justify-center border-b border-sidebar-border py-4">
          <span className="ink-gradient inline-flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-primary">
            <span className="h-2.5 w-2.5 rounded-full bg-sidebar-primary" />
          </span>
        </div>

        <nav className="mt-3 flex flex-1 flex-col items-center gap-1.5 px-2">
          {nav.map((n) => {
            // Compute badge for this nav item
            const badgeForRoute = badges[n.to] ?? 0;
            // For nested routes like /properties/$id, also check /properties
            const badgeForPrefix = Object.entries(badges).find(([route]) =>
              n.to !== "/" && n.to !== "/dashboard"
                ? route === n.to || route.startsWith(n.to + "/")
                : false,
            );
            const badge = badgeForRoute || (badgeForPrefix?.[1] ?? 0);

            return (
              <RailButton
                key={n.to}
                to={n.to}
                label={t(n.labelKey)}
                active={pathname.startsWith(n.to)}
                badge={badge}
              >
                <n.icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </RailButton>
            );
          })}
        </nav>

        <div className="flex w-full flex-col items-center gap-1.5 border-t border-sidebar-border p-2">
          <RailButton label={t("nav.signOut")} onClick={() => setConfirmOut(true)} danger>
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
          </RailButton>
        </div>
      </aside>

      <div className="md:pl-[72px]">
        <header className="sticky top-0 z-30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-background/85 px-3 py-2.5 backdrop-blur sm:gap-3 sm:px-6 sm:py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate font-display text-lg font-semibold">{t("app.name")}</span>
            {groups.length > 0 && (
              <Select value={groupId ?? undefined} onValueChange={setGroupId}>
                <SelectTrigger className="h-8 w-28 shrink-0 sm:w-[10rem] md:w-[14rem]">
                  <SelectValue placeholder={t("group.switcher")} />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <NotificationBell notifications={notifications ?? []} />
            <LanguageSwitcher />
            <Button
              size="sm"
              variant="outline"
              className="md:hidden"
              onClick={() => setConfirmOut(true)}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </header>

        <nav className="sticky top-[57px] z-20 flex gap-1 overflow-x-auto border-b border-border bg-background/85 px-3 py-2 backdrop-blur md:hidden">
          {nav.map((n) => {
            const active = pathname.startsWith(n.to);
            const badge = badges[n.to] ?? 0;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <span className="relative">
                  <n.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {badge > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-destructive px-0.5 text-[8px] font-bold leading-none text-destructive-foreground">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                {t(n.labelKey)}
              </Link>
            );
          })}
        </nav>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 animate-in fade-in duration-300">
          {needsGroup ? <GroupGate role={role} /> : children}
        </main>
      </div>

      <AlertDialog open={confirmOut} onOpenChange={setConfirmOut}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("nav.signOut")}</AlertDialogTitle>
            <AlertDialogDescription>{t("common.confirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={signOut}>{t("nav.signOut")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-2xl sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  delay?: number; /** stagger delay in ms */
}

export function StatCard({ label, value, icon: Icon, hint, delay = 0 }: StatCardProps) {
  return (
    <div
      className="surface flex items-start gap-3 p-4 animate-card-enter"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-display text-2xl font-semibold">{value}</p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children?: ReactNode }) {
  const t = useT();
  return (
    <div className="surface flex flex-col items-center gap-3 p-12 text-center text-sm text-muted-foreground">
      {children ?? (
        <>
          <span className="text-4xl">📭</span>
          <p>{t("common.none")}</p>
        </>
      )}
    </div>
  );
}

/* ---- Reusable skeleton placeholders ---- */

/** Skeleton for stat card grids (dashboard). Pass `count` for number of cards. */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="surface flex items-start gap-3 p-4">
          <span className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-6 w-16 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton for a list/table with rows. Pass `rows` for number of rows. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="surface divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-muted" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-6 w-16 shrink-0 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton for a card grid. Pass `count` for number of cards. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="surface space-y-3 p-5">
          <div className="h-32 w-full animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          <div className="flex gap-2">
            <div className="h-8 w-16 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-16 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
