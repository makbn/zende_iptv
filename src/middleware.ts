import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isLegacyTvBrowser } from "@/lib/browser/legacy-tv";

function shouldServeLegacyClient(request: NextRequest): boolean {
  if (request.nextUrl.searchParams.get("modern") === "1") return false;

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/legacy/")) return false;
  if (pathname.startsWith("/api/")) return false;
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;

  const ua = request.headers.get("user-agent");
  return isLegacyTvBrowser(ua);
}

export function middleware(request: NextRequest) {
  if (shouldServeLegacyClient(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/legacy/index.html";
    return NextResponse.rewrite(url);
  }

  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|legacy/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|ico)$).*)",
  ],
};
