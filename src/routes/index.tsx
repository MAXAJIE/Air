import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, ClipboardCheck, Building2, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Keyward — one ledger for listings, cleans and guest requests" },
      {
        name: "description",
        content:
          "Photo-verified cleaning, amenity honesty checks, no-login guest requests and an in-house or outsourced cleaning workforce for multi-listing Airbnb hosts.",
      },
      { property: "og:title", content: "Keyward — Airbnb property operations" },
      {
        property: "og:description",
        content:
          "Photo-verified cleaning, amenity honesty checks and guest requests across every listing you manage.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const t = useT();

  const features = [
    { icon: ClipboardCheck, title: t("landing.f1"), body: t("landing.f1Body") },
    { icon: CheckCircle2, title: t("landing.f2"), body: t("landing.f2Body") },
    { icon: Building2, title: t("landing.f3"), body: t("landing.f3Body") },
    { icon: QrCode, title: t("landing.f4"), body: t("landing.f4Body") },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-lg font-semibold">{t("app.name")}</span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button asChild size="sm" variant="outline">
            <Link to="/auth">{t("auth.signIn")}</Link>
          </Button>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-10 md:pt-20">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {t("app.tagline")}
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl leading-tight md:text-6xl">{t("landing.heroTitle")}</h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("landing.heroBody")}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup" }}>
                {t("landing.cta")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth" search={{ mode: "signup", next: "redeem" }}>{t("landing.ctaSecondary")}</Link>
            </Button>
          </div>
        </section>

        <section className="border-t border-border bg-card">
          <div className="mx-auto grid max-w-6xl gap-px bg-border px-0 md:grid-cols-2">
            {features.map((f) => (
              <article key={f.title} className="bg-card p-8 md:p-10">
                <f.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 className="mt-4 text-xl">{f.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-xs text-muted-foreground">
        {t("landing.footer")}
      </footer>
    </div>
  );
}
