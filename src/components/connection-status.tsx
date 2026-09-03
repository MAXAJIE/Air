import { useQueryClient } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps the session alive while the tab is used and shows a small pill when
 * the browser drops offline. On reconnect the token is refreshed and every
 * query refetched, so the app is always live against the backend rather than
 * silently serving stale data.
 */
export function ConnectionStatus() {
  const t = useT();
  const qc = useQueryClient();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = async () => {
      setOffline(false);
      await supabase.auth.refreshSession();
      await qc.invalidateQueries();
    };
    setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    // Coming back to the tab counts as reconnecting too.
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void goOnline();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [qc]);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs text-background shadow-lg"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      {t("net.offline")}
    </div>
  );
}
