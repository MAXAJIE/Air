import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  ClipboardCheck,
  Building2,
  QrCode,
  ArrowRight,
  Star,
  Shield,
  Users,
  Sparkles,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Keyward — Airbnb property operations platform" },
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "index,follow" },
    ],
    links: [
      { rel: "canonical", href: "https://keyward.app" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: ClipboardCheck,
    titleKey: "landing.f1" as const,
    bodyKey: "landing.f1Body" as const,
  },
  {
    icon: CheckCircle2,
    titleKey: "landing.f2" as const,
    bodyKey: "landing.f2Body" as const,
  },
  {
    icon: Building2,
    titleKey: "landing.f3" as const,
    bodyKey: "landing.f3Body" as const,
  },
  {
    icon: QrCode,
    titleKey: "landing.f4" as const,
    bodyKey: "landing.f4Body" as const,
  },
];

const HOW_IT_WORKS = [
  {
    step: 1,
    icon: Building2,
    titleKey: "landing.how1Title" as const,
    bodyKey: "landing.how1Body" as const,
  },
  {
    step: 2,
    icon: ClipboardCheck,
    titleKey: "landing.how2Title" as const,
    bodyKey: "landing.how2Body" as const,
  },
  {
    step: 3,
    icon: Users,
    titleKey: "landing.how3Title" as const,
    bodyKey: "landing.how3Body" as const,
  },
  {
    step: 4,
    icon: Star,
    titleKey: "landing.how4Title" as const,
    bodyKey: "landing.how4Body" as const,
  },
];

const PRICING_TIERS = [
  {
    nameKey: "landing.priceFreeName" as const,
    price: "$0",
    periodKey: "landing.priceFreePeriod" as const,
    descKey: "landing.priceFreeDesc" as const,
    features: [
      "landing.priceFreeF1" as const,
      "landing.priceFreeF2" as const,
      "landing.priceFreeF3" as const,
      "landing.priceFreeF4" as const,
    ],
    ctaKey: "landing.cta" as const,
    featured: false,
  },
  {
    nameKey: "landing.priceProName" as const,
    price: "$29",
    periodKey: "landing.priceProPeriod" as const,
    descKey: "landing.priceProDesc" as const,
    features: [
      "landing.priceProF1" as const,
      "landing.priceProF2" as const,
      "landing.priceProF3" as const,
      "landing.priceProF4" as const,
      "landing.priceProF5" as const,
    ],
    ctaKey: "landing.cta" as const,
    featured: true,
  },
  {
    nameKey: "landing.priceBizName" as const,
    price: "$99",
    periodKey: "landing.priceBizPeriod" as const,
    descKey: "landing.priceBizDesc" as const,
    features: [
      "landing.priceBizF1" as const,
      "landing.priceBizF2" as const,
      "landing.priceBizF3" as const,
      "landing.priceBizF4" as const,
      "landing.priceBizF5" as const,
      "landing.priceBizF6" as const,
    ],
    ctaKey: "landing.contactSales" as const,
    featured: false,
  },
];

const TESTIMONIALS = [
  {
    quoteKey: "landing.testimonial1" as const,
    authorKey: "landing.testimonial1Auth" as const,
    roleKey: "landing.testimonial1Role" as const,
    stars: 5,
  },
  {
    quoteKey: "landing.testimonial2" as const,
    authorKey: "landing.testimonial2Auth" as const,
    roleKey: "landing.testimonial2Role" as const,
    stars: 5,
  },
  {
    quoteKey: "landing.testimonial3" as const,
    authorKey: "landing.testimonial3Auth" as const,
    roleKey: "landing.testimonial3Role" as const,
    stars: 5,
  },
];

const FAQS = [
  {
    qKey: "landing.faq1Q" as const,
    aKey: "landing.faq1A" as const,
  },
  {
    qKey: "landing.faq2Q" as const,
    aKey: "landing.faq2A" as const,
  },
  {
    qKey: "landing.faq3Q" as const,
    aKey: "landing.faq3A" as const,
  },
  {
    qKey: "landing.faq4Q" as const,
    aKey: "landing.faq4A" as const,
  },
  {
    qKey: "landing.faq5Q" as const,
    aKey: "landing.faq5A" as const,
  },
  {
    qKey: "landing.faq6Q" as const,
    aKey: "landing.faq6A" as const,
  },
];

function Landing() {
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-background">
      {/* ---- Navigation ---- */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-display text-xl font-semibold">{t("app.name")}</span>
          <div className="hidden items-center gap-1 md:flex">
            {(["landing.navFeatures", "landing.navHow", "landing.navPricing", "landing.navFaq"] as const).map((key) => (
              <a
                key={key}
                href={`#${t(key).toLowerCase().replace(/\s+/g, "-")}`}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {t(key)}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button asChild size="sm" variant="ghost" className="hidden md:inline-flex">
              <Link to="/auth">{t("auth.signIn")}</Link>
            </Button>
            <Button asChild size="sm" className="hidden md:inline-flex">
              <Link to="/auth" search={{ mode: "signup" }}>{t("landing.cta")}</Link>
            </Button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {/* Mobile menu */}
        {mobileOpen && (
          <div className="border-t border-border px-4 pb-4 md:hidden">
            <div className="flex flex-col gap-1 pt-2">
              {(["landing.navFeatures", "landing.navHow", "landing.navPricing", "landing.navFaq"] as const).map((key) => (
                <a
                  key={key}
                  href={`#${t(key).toLowerCase().replace(/\s+/g, "-")}`}
                  className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => setMobileOpen(false)}
                >
                  {t(key)}
                </a>
              ))}
              <Link
                to="/auth"
                className="mt-2 rounded-lg px-3 py-2 text-sm font-medium text-primary"
                onClick={() => setMobileOpen(false)}
              >
                {t("auth.signIn")}
              </Link>
            </div>
          </div>
        )}
      </nav>

      <main className="animate-in fade-in duration-300">
        {/* ---- Hero ---- */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,oklch(0.4_0.08_205/0.08),transparent_60%)]" />
          <div className="mx-auto max-w-6xl px-6 pb-24 pt-16 md:pb-32 md:pt-24">
            <div className="flex flex-col gap-4 md:max-w-3xl">
              <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {t("landing.heroBadge")}
              </p>
              <h1 className="text-4xl font-display leading-tight md:text-6xl md:leading-tight">
                {t("landing.heroTitle")}
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
                {t("landing.heroBody")}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/auth" search={{ mode: "signup" }}>
                    {t("landing.cta")}
                    <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/auth" search={{ mode: "signup", next: "redeem" }}>
                    {t("landing.ctaSecondary")}
                  </Link>
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("landing.heroFootnote")}
              </p>
            </div>
          </div>
        </section>

        {/* ---- Trusted by / Stats bar ---- */}
        <section className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-12 gap-y-4 px-6 py-8 text-sm text-muted-foreground md:justify-between">
            <span className="font-medium text-foreground">{t("landing.trustedBy")}</span>
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              500+ {t("landing.listingsManaged")}
            </span>
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" aria-hidden="true" />
              1,200+ {t("landing.teamMembers")}
            </span>
            <span className="flex items-center gap-2">
              <Shield className="h-4 w-4" aria-hidden="true" />
              15,000+ {t("landing.cleansCompleted")}
            </span>
          </div>
        </section>

        {/* ---- Features ---- */}
        <section id="features" className="scroll-mt-20 border-b border-border py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium uppercase tracking-[0.15em] text-muted-foreground">
                {t("landing.featuresLabel")}
              </p>
              <h2 className="mt-3 text-3xl font-display md:text-4xl">{t("landing.featuresTitle")}</h2>
              <p className="mt-3 text-muted-foreground">{t("landing.featuresBody")}</p>
            </div>
            <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2">
              {FEATURES.map((f) => (
                <article key={f.titleKey} className="bg-card p-8 transition-colors hover:bg-accent/10 md:p-10">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <f.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-xl font-display">{t(f.titleKey)}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(f.bodyKey)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---- How It Works ---- */}
        <section id="how-it-works" className="scroll-mt-20 border-b border-border py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium uppercase tracking-[0.15em] text-muted-foreground">
                {t("landing.howLabel")}
              </p>
              <h2 className="mt-3 text-3xl font-display md:text-4xl">{t("landing.howTitle")}</h2>
              <p className="mt-3 text-muted-foreground">{t("landing.howBody")}</p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-4">
              {HOW_IT_WORKS.map((item) => (
                <div key={item.step} className="relative flex flex-col items-center text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-bold">
                    {item.step}
                  </span>
                  <span className="mt-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 font-display text-lg">{t(item.titleKey)}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{t(item.bodyKey)}</p>
                  {item.step < 4 && (
                    <ChevronRight className="absolute -right-3 top-6 hidden h-5 w-5 text-muted-foreground/30 md:block" aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Testimonials ---- */}
        <section className="border-b border-border bg-card py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium uppercase tracking-[0.15em] text-muted-foreground">
                {t("landing.testimonialsLabel")}
              </p>
              <h2 className="mt-3 text-3xl font-display md:text-4xl">{t("landing.testimonialsTitle")}</h2>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {TESTIMONIALS.map((item) => (
                <div key={item.authorKey} className="surface flex flex-col gap-4 p-6">
                  <div className="flex gap-0.5">
                    {Array.from({ length: item.stars }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                    ))}
                  </div>
                  <p className="text-sm italic leading-relaxed text-muted-foreground">&ldquo;{t(item.quoteKey)}&rdquo;</p>
                  <div className="mt-auto pt-2">
                    <p className="text-sm font-medium">{t(item.authorKey)}</p>
                    <p className="text-xs text-muted-foreground">{t(item.roleKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Pricing ---- */}
        <section id="pricing" className="scroll-mt-20 border-b border-border py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium uppercase tracking-[0.15em] text-muted-foreground">
                {t("landing.pricingLabel")}
              </p>
              <h2 className="mt-3 text-3xl font-display md:text-4xl">{t("landing.pricingTitle")}</h2>
              <p className="mt-3 text-muted-foreground">{t("landing.pricingBody")}</p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {PRICING_TIERS.map((tier) => (
                <div
                  key={tier.nameKey}
                  className={cn(
                    "surface relative flex flex-col gap-6 p-6",
                    tier.featured && "ring-2 ring-primary shadow-lg",
                  )}
                >
                  {tier.featured && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                      {t("landing.pricePopular")}
                    </span>
                  )}
                  <div>
                    <h3 className="text-xl font-display">{t(tier.nameKey)}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t(tier.descKey)}</p>
                  </div>
                  <div>
                    <span className="text-4xl font-display font-bold">{tier.price}</span>
                    <span className="text-sm text-muted-foreground"> /{t(tier.periodKey)}</span>
                  </div>
                  <ul className="flex-1 space-y-3">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        {t(f)}
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant={tier.featured ? "default" : "outline"} className="w-full">
                    <Link to="/auth" search={{ mode: "signup" }}>{t(tier.ctaKey)}</Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- FAQ ---- */}
        <section id="faq" className="scroll-mt-20 border-b border-border py-20 md:py-28">
          <div className="mx-auto max-w-3xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium uppercase tracking-[0.15em] text-muted-foreground">
                {t("landing.faqLabel")}
              </p>
              <h2 className="mt-3 text-3xl font-display md:text-4xl">{t("landing.faqTitle")}</h2>
            </div>
            <div className="mt-12 space-y-2">
              {FAQS.map((faq, i) => (
                <div key={faq.qKey} className="rounded-xl border border-border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium transition-colors hover:bg-accent/30"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    aria-expanded={openFaq === i}
                  >
                    {t(faq.qKey)}
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        openFaq === i && "rotate-90",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                  {openFaq === i && (
                    <div className="border-t border-border px-5 py-4 text-sm leading-relaxed text-muted-foreground">
                      {t(faq.aKey)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- CTA ---- */}
        <section className="py-20 md:py-28">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <h2 className="text-3xl font-display md:text-4xl">{t("landing.ctaTitle")}</h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{t("landing.ctaBody")}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  {t("landing.cta")}
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth" search={{ mode: "signup", next: "redeem" }}>
                  {t("landing.ctaSecondary")}
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* ---- Footer ---- */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="md:col-span-2">
              <span className="font-display text-lg font-semibold">{t("app.name")}</span>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {t("landing.footerBody")}
              </p>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-medium">{t("landing.footerProduct")}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="transition-colors hover:text-foreground">{t("landing.featuresLabel")}</a></li>
                <li><a href="#pricing" className="transition-colors hover:text-foreground">{t("landing.pricingLabel")}</a></li>
                <li><a href="#faq" className="transition-colors hover:text-foreground">{t("landing.faqLabel")}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-medium">{t("landing.footerCompany")}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><span className="cursor-default">{t("landing.footerContact")}</span></li>
                <li>
                  <Link to="/auth" className="transition-colors hover:text-foreground">
                    {t("auth.signIn")}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
            {t("landing.footer")}
          </div>
        </div>
      </footer>
    </div>
  );
}
