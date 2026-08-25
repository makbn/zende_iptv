import { getRequestOrigin } from "@/lib/http/request-origin";
import { threadfinInternalUrl, threadfinPublicBaseUrl } from "@/lib/threadfin/config";
import {
  rewriteThreadfinDiscover,
  rewriteThreadfinLineup,
  rewriteThreadfinText,
} from "@/lib/threadfin/proxy-rewrite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

type RouteContext = { params: Promise<{ path?: string[] }> };

function publicBaseUrl(request: Request): string {
  return threadfinPublicBaseUrl() || `${getRequestOrigin(request)}/thf`;
}

function proxyHeaders(request: Request): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lower) && lower !== "host" && lower !== "content-length") {
      headers.set(key, value);
    }
  });
  headers.set("accept-encoding", "identity");
  return headers;
}

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set("cache-control", "no-store");
  return headers;
}

function rewriteLocation(location: string, base: string): string {
  try {
    const parsed = new URL(location, threadfinInternalUrl());
    const internal = new URL(threadfinInternalUrl());
    if (parsed.host === internal.host) return `${base}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    // Leave malformed or external redirects unchanged.
  }
  return location;
}

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const { path = [] } = await context.params;
  const pathname = `/${path.map(encodeURIComponent).join("/")}`;
  // Next normalizes /thf/web/ to /thf/web, while Threadfin redirects /web back to /web/.
  // Request Threadfin's canonical form directly so the two servers cannot create a redirect loop.
  const upstreamPathname = pathname === "/web" ? "/web/" : pathname;
  const requestUrl = new URL(request.url);
  const upstreamUrl = `${threadfinInternalUrl()}${upstreamPathname}${requestUrl.search}`;
  const base = publicBaseUrl(request);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: proxyHeaders(request),
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Threadfin request failed";
    return Response.json({ error: "Threadfin is unavailable", detail: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  const headers = responseHeaders(upstream);
  const location = headers.get("location");
  if (location) headers.set("location", rewriteLocation(location, base));

  if (request.method === "HEAD" || upstream.status === 204 || upstream.status === 304) {
    return new Response(null, { status: upstream.status, headers });
  }

  const contentType = headers.get("content-type")?.toLowerCase() ?? "";
  const shouldRewrite =
    contentType.includes("json") ||
    contentType.includes("xml") ||
    contentType.includes("html") ||
    contentType.includes("mpegurl") ||
    contentType.startsWith("text/");

  if (!shouldRewrite) {
    return new Response(upstream.body, { status: upstream.status, headers });
  }

  const text = await upstream.text();
  let rewritten = rewriteThreadfinText(text, base);

  if (pathname === "/web" && contentType.includes("html")) {
    rewritten = rewritten.replace(
      /<head(?:\s[^>]*)?>/i,
      (tag) => `${tag}\n  <base href="${base}/web/">`,
    );
  }

  if (pathname === "/discover.json" || pathname === "/lineup.json") {
    try {
      const parsed: unknown = JSON.parse(text);
      const value =
        pathname === "/discover.json" && parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? rewriteThreadfinDiscover(parsed as Record<string, unknown>, base)
          : rewriteThreadfinLineup(parsed, base);
      rewritten = JSON.stringify(value);
    } catch {
      // Preserve the text response if Threadfin returned non-JSON content.
    }
  }

  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(rewritten, { status: upstream.status, headers });
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
