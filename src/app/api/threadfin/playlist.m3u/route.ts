import { verifyIptvPortalLogin } from "@/lib/iptv/iptv-credential-auth";
import { getRequestOrigin } from "@/lib/http/request-origin";
import { secureImageUrl } from "@/lib/media/secure-image-url";
import { getThreadfinCatalog } from "@/lib/threadfin/catalog";
import type { ThreadfinContentKind } from "@/lib/threadfin/catalog";
import { threadfinGuideId } from "@/lib/threadfin/guide-id";

export const runtime = "nodejs";

function escapeAttr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

function pathBucket(kind: ThreadfinContentKind): string {
  if (kind === "movie") return "movie";
  if (kind === "episode") return "series";
  return "live";
}

function defaultGroup(kind: ThreadfinContentKind): string {
  if (kind === "movie") return "Movies";
  if (kind === "episode") return "Shows";
  return "Live";
}

/**
 * Plex-safe mixed Live+Movies M3U for Threadfin.
 * Auth: portal username + password (Threadfin service account).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const username = url.searchParams.get("username")?.trim() ?? "";
  const password = url.searchParams.get("password")?.trim() ?? "";

  const cred = await verifyIptvPortalLogin(username, password);
  if (!cred) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
    });
  }

  const origin = getRequestOrigin(request);
  const { rows } = await getThreadfinCatalog();
  const lines: string[] = ["#EXTM3U"];

  for (const row of rows) {
    const displayName = row.name.replace(/\r?\n/g, " ").replace(/,/g, " ").trim();
    const group = row.groupTitle || defaultGroup(row.kind);
    const attrs = [
      `tvg-name="${escapeAttr(displayName)}"`,
      `tvg-id="${threadfinGuideId(row.kind, row.streamId)}"`,
      row.tvgLogo ? `tvg-logo="${escapeAttr(secureImageUrl(row.tvgLogo, origin, "logo") ?? row.tvgLogo)}"` : "",
      `group-title="${escapeAttr(group)}"`,
    ].filter(Boolean);

    lines.push(`#EXTINF:-1 ${attrs.join(" ")},${displayName}`);

    // Plex/Threadfin consumes an open MPEG-TS live feed much more reliably than
    // this provider's redirecting HLS bootstrap. VOD remains progressive/HLS.
    const extension = row.kind === "live" ? "ts" : "m3u8";
    const playUrl =
      `${origin}/${pathBucket(row.kind)}/` +
      `${encodeURIComponent(cred.portalUsername)}/` +
      `${encodeURIComponent(password)}/` +
      `${row.streamId}.${extension}`;

    lines.push(playUrl);
  }

  return new Response(`${lines.join("\n")}\n`, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl;charset=utf-8",
      "Cache-Control": "private, max-age=60",
    },
  });
}
