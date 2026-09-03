/**
 * Proxy-aware CSRF check for server functions.
 *
 * TanStack's built-in `createCsrfMiddleware` compares the request `Origin`
 * against the `Host` header. Lovable preview/published traffic is proxied, so
 * the inbound `Host` is the internal origin while the browser sends the public
 * hostname — every POST server function then fails with a 500 HTML page
 * ("Something went wrong" on the guest page, broken photo signing, failing
 * location lookups). This variant accepts a request when the browser origin
 * matches any host the proxy chain reports, or a known Lovable/localhost host.
 */
const ALLOWED_HOST_SUFFIXES = [
  ".lovable.app",
  ".lovableproject.com",
  ".lovable.dev",
  ".sandbox.lovable.dev",
];

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function isTrustedRequestOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  // Same-origin navigations and server-to-server calls omit Origin.
  if (!origin || origin === "null") return true;

  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  if (isLocalHost(hostname)) return true;
  if (ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true;

  const candidates = [
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
    (() => {
      try {
        return new URL(request.url).host;
      } catch {
        return null;
      }
    })(),
  ].filter((value): value is string => !!value);

  return candidates.some((candidate) => candidate.split(":")[0] === hostname);
}
