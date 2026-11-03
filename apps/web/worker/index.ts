// Cloudflare Worker in front of the static Vite build. Forwarding /api/* to the
// API keeps web and API on one origin, so the httpOnly refresh cookie stays
// first-party and survives page reloads (workers.dev and onrender.com are
// public suffixes: a cross-site SameSite=Lax cookie would be dropped).
export type EdgeEnv = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  API_ORIGIN: string;
  EDGE_PROXY_SECRET?: string;
};

const clientIpHeader = "x-crm-client-ip";
const secretHeader = "x-crm-edge-secret";

export function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export default {
  async fetch(request: Request, env: EdgeEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!isApiPath(url.pathname)) return env.ASSETS.fetch(request);

    const upstream = new Request(new URL(url.pathname + url.search, env.API_ORIGIN), request);
    // Never relay client-supplied values for the trusted edge headers.
    upstream.headers.delete(clientIpHeader);
    upstream.headers.delete(secretHeader);
    const clientIp = request.headers.get("cf-connecting-ip");
    if (env.EDGE_PROXY_SECRET && clientIp) {
      upstream.headers.set(clientIpHeader, clientIp);
      upstream.headers.set(secretHeader, env.EDGE_PROXY_SECRET);
    }
    // Pass API redirects (OAuth callbacks) through to the browser unchanged.
    return fetch(upstream, { redirect: "manual" });
  },
};
