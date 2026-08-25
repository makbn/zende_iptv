import type { AggregatedStreamRow } from "@/lib/iptv/aggregated-channels";
import { secureImageUrl } from "@/lib/media/secure-image-url";

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

export type XmltvProgrammeRef = {
  channelId: string;
  title: string;
  description?: string;
  startMs: number;
  stopMs: number;
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

export function buildXmltvDocument(
  channels: XmltvChannelRef[],
  imageOrigin?: string,
  programmes?: XmltvProgrammeRef[],
): string {
  let channelsXml = "";
  for (const c of channels) {
    const name = xmlEscape(c.name);
    channelsXml += `  <channel id="${xmlEscape(c.cid)}">\n`;
    channelsXml += `    <display-name>${name}</display-name>\n`;
    if (c.logo) {
      channelsXml += `    <icon src="${xmlEscape(secureImageUrl(c.logo, imageOrigin, "logo") ?? c.logo)}" />\n`;
    }
    channelsXml += `  </channel>\n`;
  }

  let programmesXml = "";
  if (programmes) {
    for (const programme of programmes) {
      programmesXml += `  <programme start="${formatXmltvTime(new Date(programme.startMs))}" stop="${formatXmltvTime(new Date(programme.stopMs))}" channel="${xmlEscape(programme.channelId)}">\n`;
      programmesXml += `    <title lang="en">${xmlEscape(programme.title)}</title>\n`;
      if (programme.description) {
        programmesXml += `    <desc lang="en">${xmlEscape(programme.description)}</desc>\n`;
      }
      programmesXml += `  </programme>\n`;
    }
  } else {
    const hourMs = 3_600_000;
    const gridStart = new Date();
    gridStart.setUTCMinutes(0, 0, 0);
    const slotsPerChannel = 18;
    for (const c of channels) {
      for (let h = 0; h < slotsPerChannel; h++) {
        const st = new Date(gridStart.getTime() + h * hourMs);
        const en = new Date(st.getTime() + hourMs);
        programmesXml += `  <programme start="${formatXmltvTime(st)}" stop="${formatXmltvTime(en)}" channel="${xmlEscape(c.cid)}">\n`;
        programmesXml += `    <title lang="en">${xmlEscape("No programme data")}</title>\n`;
        programmesXml += `    <desc lang="en">${xmlEscape("No schedule is available for this channel.")}</desc>\n`;
        programmesXml += `  </programme>\n`;
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tv SYSTEM "xmltv.dtd">
<tv generator-info-name="Zende" generator-info-url="https://github.com/">
${channelsXml}${programmesXml}</tv>`;
}

function xmlUnescapeAttribute(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function rewriteXmltvIconUrls(xml: string, imageOrigin: string): string {
  return xml.replace(
    /(<icon\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)(\2)/gi,
    (_full, prefix: string, quote: string, encodedUrl: string) => {
      const proxied = secureImageUrl(xmlUnescapeAttribute(encodedUrl), imageOrigin, "logo");
      return `${prefix}${quote}${xmlEscape(proxied ?? encodedUrl)}${quote}`;
    },
  );
}

/** Rewrites provider XMLTV icon URLs without buffering a potentially huge guide. */
export function createXmltvImageProxyTransform(imageOrigin: string): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let carry = "";
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      carry += decoder.decode(chunk, { stream: true });
      const lastOpen = carry.lastIndexOf("<");
      const lastClose = carry.lastIndexOf(">");
      const cutoff = lastOpen > lastClose ? lastOpen : carry.length;
      if (cutoff === 0) return;
      controller.enqueue(encoder.encode(rewriteXmltvIconUrls(carry.slice(0, cutoff), imageOrigin)));
      carry = carry.slice(cutoff);
    },
    flush(controller) {
      carry += decoder.decode();
      if (carry) controller.enqueue(encoder.encode(rewriteXmltvIconUrls(carry, imageOrigin)));
    },
  });
}
