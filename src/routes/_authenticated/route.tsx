import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { ActiveGroupProvider } from "@/hooks/use-app";
import { supabase } from "@/integrations/supabase/client";
import { isUnverifiedExpired, purgeUnverifiedSession } from "@/lib/session-hygiene";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Accounts that never confirmed their email expire after 5 minutes: wipe everything.
    if (isUnverifiedExpired(data.user)) {
      await purgeUnverifiedSession(context.queryClient);
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Onboarding screens are full-bleed: no rail, no group switcher.
  if (pathname.startsWith("/onboarding")) return <Outlet />;

  return (
    <ActiveGroupProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </ActiveGroupProvider>
  );
}
