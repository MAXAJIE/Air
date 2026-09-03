import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { ConnectionStatus } from "@/components/connection-status";
import { ActiveGroupProvider } from "@/hooks/use-app";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import { supabase } from "@/integrations/supabase/client";
import {
  clearPendingVerification,
  isIdleExpired,
  signOutForInactivity,
  touchActivity,
} from "@/lib/session-hygiene";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // The session is only ever dropped after 15 minutes without interaction.
    clearPendingVerification();
    if (isIdleExpired()) {
      await signOutForInactivity(context.queryClient);
      throw redirect({ to: "/auth" });
    }
    touchActivity();
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useIdleLogout();
  // Onboarding screens are full-bleed: no rail, no group switcher.
  if (pathname.startsWith("/onboarding"))
    return (
      <>
        <Outlet />
        <ConnectionStatus />
      </>
    );

  return (
    <ActiveGroupProvider>
      <AppShell>
        <Outlet />
      </AppShell>
      <ConnectionStatus />
    </ActiveGroupProvider>
  );
}

