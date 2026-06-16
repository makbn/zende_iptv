import type { AggregatedStreamRow } from "@/lib/iptv/aggregated-channels";

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

export type XmltvChannelRef = {
  cid: string;
  name: string;
  logo?: string;
};

export function collectXmltvChannels(
  streams: AggregatedStreamRow[],
  channelIdForRow: (row: AggregatedStreamRow) => string,
): XmltvChannelRef[] {
  const seen = new Set<string>();
  const channels: XmltvChannelRef[] = [];

  for (const row of streams) {
    const cid = channelIdForRow(row);
    if (seen.has(cid)) continue;
    seen.add(cid);
    channels.push({
      cid,
      name: row.channel.name,
      logo: row.channel.tvgLogo?.trim() || undefined,
    });
  }

  return channels;
}

export function buildXmltvDocument(channels: XmltvChannelRef[]): string {
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

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tv SYSTEM "xmltv.dtd">
<tv generator-info-name="Zenede" generator-info-url="https://github.com/">
${channelsXml}${programmesXml}</tv>`;
}
