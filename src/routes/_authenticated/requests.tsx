import { createFileRoute, redirect } from "@tanstack/react-router";

/** Special requests now live next to shopping, toggled from the same page. */
export const Route = createFileRoute("/_authenticated/requests")({
  beforeLoad: () => {
    throw redirect({ to: "/shop" });
  },
});
