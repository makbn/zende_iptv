import "server-only";

import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";

import { parseXmltvProgrammes, type XmltvProgramme } from "@/lib/epg/xmltv-parse";

/** Consolidated multi-channel XMLTV (gzip). Channel ids match iptv-org guide `site_id` for iptvx rows. */
export const IPTVX_NOARCH_GZ_URL =
  "https://iptvx.one/epg/epg_noarch.xml.gz";

const MAX_PER_CHANNEL = 48;

/**
 * Stream-parse the iptvx gzip XMLTV file and collect programmes only for the
 * requested XMLTV channel ids (memory-safe vs loading ~300MB uncompressed).
 */
export async function collectProgrammesForXmltvIds(
  wantedIds: Set<string>,
): Promise<XmltvProgramme[]> {
  if (wantedIds.size === 0) return [];

  const res = await fetch(IPTVX_NOARCH_GZ_URL, {
    headers: {
      Accept: "application/gzip, application/xml, */*",
      "User-Agent":
        "Zenede/0.1 (EPG merge; iptvx consolidated guide; +https://iptvx.one)",
    },
    next: { revalidate: 900 },
  });

  if (!res.ok || !res.body) {
    return [];
  }

  const nodeReadable = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
  const gunzip = createGunzip();
  nodeReadable.pipe(gunzip);

  const counts = new Map<string, number>();
  const out: XmltvProgramme[] = [];

  let buf = "";
  let settled = false;

  const enoughForAll = () => {
    for (const id of wantedIds) {
      if ((counts.get(id) ?? 0) < MAX_PER_CHANNEL) return false;
    }
    return true;
  };

  const finish = (resolve: () => void) => {
    if (settled) return;
    settled = true;
    gunzip.destroy();
    nodeReadable.destroy();
    resolve();
  };

  const maybeTrimBuf = () => {
    const keepFrom = Math.max(0, buf.length - 2_000_000);
    if (keepFrom === 0) return;
    const firstProg = buf.indexOf("<programme", keepFrom);
    buf = firstProg === -1 ? buf.slice(keepFrom) : buf.slice(firstProg);
  };

  await new Promise<void>((resolve, reject) => {
    const safeReject = (e: unknown) => {
      if (settled) return;
      reject(e);
    };

    gunzip.on("data", (chunk: Buffer | string) => {
      buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");

      while (true) {
        const start = buf.indexOf("<programme");
        if (start === -1) break;
        const end = buf.indexOf("</programme>", start);
        if (end === -1) break;
        const block = buf.slice(start, end + "</programme>".length);
        buf = buf.slice(end + "</programme>".length);

        const ch = block.match(/\bchannel="([^"]+)"/)?.[1];
        if (!ch || !wantedIds.has(ch)) continue;
        const n = counts.get(ch) ?? 0;
        if (n >= MAX_PER_CHANNEL) continue;
        counts.set(ch, n + 1);
        out.push(...parseXmltvProgrammes(block));
      }

      if (buf.length > 3_000_000) maybeTrimBuf();

      if (enoughForAll()) finish(resolve);
    });

    gunzip.on("end", () => {
      if (settled) return;
      if (buf.includes("<programme")) {
        const start = buf.indexOf("<programme");
        const end = buf.indexOf("</programme>", start);
        if (start !== -1 && end !== -1) {
          const block = buf.slice(start, end + "</programme>".length);
          const ch = block.match(/\bchannel="([^"]+)"/)?.[1];
          if (ch && wantedIds.has(ch)) {
            const n = counts.get(ch) ?? 0;
            if (n < MAX_PER_CHANNEL) {
              out.push(...parseXmltvProgrammes(block));
            }
          }
        }
      }
      if (!settled) resolve();
    });

    gunzip.on("error", safeReject);
    nodeReadable.on("error", safeReject);
  });

  return out;
}
