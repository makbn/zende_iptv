import { verifyIptvPortalLogin } from "@/lib/iptv/iptv-credential-auth";
import { getAggregatedXtreamCatalog } from "@/lib/iptv/aggregated-channels";

export const runtime = "nodejs";

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatXmltvTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())} +0000`;
}

/**
 * XMLTV with placeholder programmes — many IPTV apps hide the guide entirely when no `<programme>`
 * rows exist; channels-only feeds look “empty”.
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

  void cred;

  const { streams } = await getAggregatedXtreamCatalog();
  const seen = new Set<string>();
  const channels: { cid: string; name: string; logo?: string }[] = [];

  for (const row of streams) {
    const ch = row.channel;
    const cid = ch.tvgId?.trim() || String(row.streamId);
    if (seen.has(cid)) continue;
    seen.add(cid);
    channels.push({
      cid,
      name: ch.name,
      logo: ch.tvgLogo?.trim(),
    });
  }

  let channelsXml = "";
  for (const c of channels) {
    const name = xmlEscape(c.name);
    channelsXml += `  <channel id="${xmlEscape(c.cid)}">\n`;
    channelsXml += `    <display-name>${name}</display-name>\n`;
    if (c.logo) {
      channelsXml += `    <icon src="${xmlEscape(c.logo)}" />\n`;
    }
    channelsXml += `  </channel>\n`;
  }

  const hourMs = 3_600_000;
  const gridStart = new Date();
  gridStart.setUTCMinutes(0, 0, 0);
  const slotsPerChannel = 18;

  let programmesXml = "";
  for (const c of channels) {
    for (let h = 0; h < slotsPerChannel; h++) {
      const st = new Date(gridStart.getTime() + h * hourMs);
      const en = new Date(st.getTime() + hourMs);
      programmesXml += `  <programme start="${formatXmltvTime(st)}" stop="${formatXmltvTime(en)}" channel="${xmlEscape(c.cid)}">\n`;
      programmesXml += `    <title lang="en">${xmlEscape("No programme data")}</title>\n`;
      programmesXml += `    <desc lang="en">${xmlEscape("Placeholder — wire full EPG sources later.")}</desc>\n`;
      programmesXml += `  </programme>\n`;
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tv SYSTEM "xmltv.dtd">
<tv generator-info-name="Zenede" generator-info-url="https://github.com/">
${channelsXml}${programmesXml}</tv>`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml;charset=utf-8",
      "Cache-Control": "private, max-age=300",
    },
  });
}
