import { verifyIptvPortalLogin } from "@/lib/iptv/iptv-credential-auth";
import { getAggregatedXtreamCatalog } from "@/lib/iptv/aggregated-channels";
import { getRequestOrigin } from "@/lib/http/request-origin";

export const runtime = "nodejs";

function escapeAttr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

/** Builds an extended M3U pointing at our `/live/.../<stream_id>.m3u8` handler (Xtream-style `get.php`). */
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

  const _type = (url.searchParams.get("type") ?? "m3u_plus").trim();
  void _type;

  const origin = getRequestOrigin(request);
  const { streams } = await getAggregatedXtreamCatalog();

  const lines: string[] = ["#EXTM3U"];

  const _output = (url.searchParams.get("output") ?? "m3u8").trim().toLowerCase();
  void _output;

  // Always advertise `.m3u8`: relayed streams are HLS through `/api/stream/proxy`. Using `.ts`
  // misleads apps into expecting MPEG-TS and breaks native players (common on iOS).
  const ext = "m3u8";
  for (const row of streams) {
    const ch = row.channel;

    const displayName = ch.name.replace(/\r?\n/g, " ").replace(/,/g, " ").trim();

    const attrs = [
      `tvg-name="${escapeAttr(displayName)}"`,
      ch.tvgId?.trim() ? `tvg-id="${escapeAttr(ch.tvgId.trim())}"` : "",
      ch.tvgLogo?.trim() ? `tvg-logo="${escapeAttr(ch.tvgLogo.trim())}"` : "",
      ch.groupTitle?.trim() ? `group-title="${escapeAttr(ch.groupTitle.trim())}"` : "",
    ].filter(Boolean);

    lines.push(
      attrs.length
        ? `#EXTINF:-1 ${attrs.join(" ")},${displayName}`
        : `#EXTINF:-1,${displayName}`,
    );

    const playUrl =
      `${origin}/live/` +
      `${encodeURIComponent(cred.portalUsername)}/` +
      `${encodeURIComponent(password)}/` +
      `${row.streamId}.${ext}`;

    lines.push(playUrl);
  }

  const body = `${lines.join("\n")}\n`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl;charset=utf-8",
      "Cache-Control": "private, max-age=60",
    },
  });
}
