import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n";

export const Route = createFileRoute("/g/$code")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Welcome — Keyward" },
      { name: "description", content: "Guest access page." },
      { property: "og:title", content: "Welcome — Keyward" },
      { property: "og:description", content: "Guest access page." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuestByCodePage,
});

type GuestProperty = {
  id: string;
  name: string;
  address: string | null;
  place_name: string | null;
  photo_path: string | null;
};

function GuestByCodePage() {
  const { code } = Route.useParams();
  const t = useT();

  const q = useQuery({
    queryKey: ["guest-property", code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("guest_property_by_code", { _code: code });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as GuestProperty | null;
    },
  });

  const property = q.data ?? null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="text-center">
        <h1 className="font-display text-3xl font-semibold">{t("guest.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("guest.codePrompt")}
        </p>
      </header>

      {q.isLoading ? (
        <div className="h-40 animate-pulse rounded-md bg-muted" />
      ) : !property ? (
        <div className="surface p-6 text-center">
          <p className="font-medium">{t("guest.badCode")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-mono">{code}</span>
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            {t("common.back")}
          </Link>
        </div>
      ) : (
        <section className="surface overflow-hidden">
          <div className="flex h-40 w-full items-center justify-center bg-muted">
            <MapPin className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="p-4">
            <h2 className="font-display text-xl font-semibold">{property.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {property.address ?? property.place_name ?? "—"}
            </p>
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              {code}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
