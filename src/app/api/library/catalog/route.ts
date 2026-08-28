import { NextResponse } from "next/server";

import { withApiLogging } from "@/core/logging/api-log";
import { gateApiRequest } from "@/lib/auth/gate-api";
import type { LibraryContentType } from "@/lib/channels/content-type";
import { queryLibraryCatalog, warmLibraryCatalogIndexIfNeeded } from "@/lib/library/catalog";
import { resolveParentalAccess } from "@/lib/parental/parental-control-store";

export const runtime = "nodejs";

function parseContentType(raw: string | null): "all" | LibraryContentType {
  if (raw === "live" || raw === "movie" || raw === "series") return raw;
  return "all";
}

/** Server-side Library catalog: Live / Movies / Shows with URL-based VOD classification. */
export async function GET(request: Request) {
  return withApiLogging("api.library.catalog", request, async (log) => {
    const gate = await gateApiRequest(request);
    if ("response" in gate) return gate.response;
    const parental = await resolveParentalAccess(request, gate);

    const url = new URL(request.url);
    const contentType = parseContentType(url.searchParams.get("contentType"));
    const q = url.searchParams.get("q") ?? undefined;
    const group = url.searchParams.get("group");
    const category = url.searchParams.get("category");
    const language = url.searchParams.get("language");
    const country = url.searchParams.get("country");
    const year = url.searchParams.get("year");
    const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
    const limit = Math.min(
      500,
      Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "200", 10) || 200),
    );

    const started = Date.now();
    try {
      await warmLibraryCatalogIndexIfNeeded();
      const result = await queryLibraryCatalog({
        contentType,
        q,
        group: group?.trim() ? group.trim() : null,
        category: category?.trim() ? category.trim().toLowerCase() : null,
        language: language?.trim() ? language.trim().toLowerCase() : null,
        country: country?.trim() ? country.trim().toLowerCase() : null,
        year: year?.trim() ? year.trim() : null,
        hiddenPatterns: parental.blockedPatterns,
        offset,
        limit,
      });
      log.info("catalog query ok", {
        contentType,
        total: result.total,
        returned: result.channels.length,
        offset,
        limit,
        elapsedMs: Date.now() - started,
      });
      return NextResponse.json(result, {
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Cookie, Authorization",
        },
      });
    } catch (err) {
      log.error("catalog query failed", {
        contentType,
        elapsedMs: Date.now() - started,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      return NextResponse.json({ error: "Could not load library catalog." }, { status: 500 });
    }
  });
}
