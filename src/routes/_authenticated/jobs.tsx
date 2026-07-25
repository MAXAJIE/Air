import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "@/components/app-shell";
import { useT } from "@/i18n";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({
    meta: [
      { title: "Keyward" },
      { name: "description", content: "Keyward property operations." },
      { property: "og:title", content: "Keyward" },
      { property: "og:description", content: "Keyward property operations." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const t = useT();
  return (
    <>
      <PageHeader title={t("nav.jobs")} />
      <EmptyState />
    </>
  );
}
