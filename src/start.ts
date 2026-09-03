import { createStart, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { isTrustedRequestOrigin } from "./lib/csrf";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs a CSRF guard automatically when src/start.ts is absent, and
// defining this file opts out — so keep an explicit guard. The built-in one
// compares Origin to the raw Host header, which never matches behind Lovable's
// proxy and made every POST server function fail; isTrustedRequestOrigin also
// accepts the forwarded host and known Lovable hosts.
const csrfMiddleware = createMiddleware().server(async ({ next }) => {
  const request = getRequest();
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !isTrustedRequestOrigin(request)) {
    return new Response("Cross-site request blocked", { status: 403 });
  }
  return next();
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
