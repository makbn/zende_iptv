import "server-only";

import { createServerLogger } from "@/core/logging/server";

const log = createServerLogger("health.cronAuth");

/**
 * Protects cron / manual health jobs. Set `CRON_SECRET` in production.
 * When unset in development, routes are open (local dev only).
 */
export function assertCronAuthorized(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      log.warn("CRON_SECRET missing in production");
      return Response.json(
        { error: "Server misconfigured: CRON_SECRET" },
        { status: 503 },
      );
    }
    return null;
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
