import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Building2,
  ClipboardList,
  Gauge,
  Handshake,
  Inbox,
  ListChecks,
  LogOut,
  ShoppingCart,
  Sparkle,
  TrendingUp,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

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
    { to: "/profile", labelKey: "nav.profile", icon: User },
  ],
  cleaner: [
    { to: "/dashboard", labelKey: "nav.dashboard", icon: Gauge },
    { to: "/jobs", labelKey: "nav.jobs", icon: ClipboardList },
    { to: "/people", labelKey: "nav.myHires", icon: Users },
    { to: "/tasks", labelKey: "nav.tasks", icon: ListChecks },
    { to: "/performance", labelKey: "nav.performance", icon: TrendingUp },
    { to: "/profile", labelKey: "nav.profile", icon: User },
  ],
  worker: [
    { to: "/dashboard", labelKey: "nav.dashboard", icon: Gauge },
    { to: "/shop", labelKey: "nav.shop", icon: ShoppingCart },
    { to: "/people", labelKey: "nav.myHires", icon: Users },
    { to: "/tasks", labelKey: "nav.tasks", icon: ListChecks },
    { to: "/profile", labelKey: "nav.profile", icon: User },
  ],
  hr_company: [
    { to: "/dashboard", labelKey: "nav.dashboard", icon: Gauge },
    { to: "/inbox", labelKey: "nav.inbox", icon: Inbox },
    { to: "/roster", labelKey: "nav.roster", icon: Boxes },
    { to: "/agencies", labelKey: "nav.agencies", icon: Handshake },
    { to: "/tasks", labelKey: "nav.tasks", icon: ListChecks },
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
  children,
}: {
  label: string;
  active?: boolean;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
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
      <span className="transition-transform duration-200 ease-out group-hover/link:scale-110">
        {children}
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

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: profile } = useProfile();
  const { groups, groupId, setGroupId, loading } = useActiveGroup();
  const [confirmOut, setConfirmOut] = useState(false);

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
          {nav.map((n) => (
            <RailButton
              key={n.to}
              to={n.to}
              label={t(n.labelKey)}
              active={pathname.startsWith(n.to)}
            >
              <n.icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </RailButton>
          ))}
        </nav>

        <div className="flex w-full flex-col items-center gap-1.5 border-t border-sidebar-border p-2">
          <RailButton label={t("nav.signOut")} onClick={() => setConfirmOut(true)} danger>
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
          </RailButton>
        </div>
      </aside>

      <div className="md:pl-[72px]">
        <header className="sticky top-0 z-30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate font-display text-lg font-semibold">{t("app.name")}</span>
            {groups.length > 0 && (
              <Select value={groupId ?? undefined} onValueChange={setGroupId}>
                <SelectTrigger className="h-8 w-[10rem] shrink-0 sm:w-[14rem]">
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
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <n.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {t(n.labelKey)}
              </Link>
            );
          })}
        </nav>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
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

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
}) {
  return (
    <div className="surface flex items-start gap-3 p-4">
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
    <div className="surface p-8 text-center text-sm text-muted-foreground">
      {children ?? t("common.none")}
    </div>
  );
}
