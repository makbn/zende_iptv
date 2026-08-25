import type { XtreamEpgListing } from "@/lib/iptv/xtream-types";
import type { XmltvProgramme } from "@/lib/epg/xmltv-parse";

function looksReadable(value: string): boolean {
  if (!value || value.includes("\uFFFD")) return false;
  let readable = 0;
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || code === 13 || code >= 32) readable += 1;
  }
  return readable / value.length >= 0.95;
}

/** Decode Xtream's optional Base64 text while leaving ordinary titles untouched. */
export function decodeXtreamEpgText(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || value.length < 4 || value.length % 4 !== 0) return value;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return value;

  try {
    const decoded = Buffer.from(value, "base64").toString("utf8").trim();
    const canonicalInput = value.replace(/=+$/, "");
    const canonicalDecoded = Buffer.from(decoded, "utf8")
      .toString("base64")
      .replace(/=+$/, "");
    return decoded && canonicalDecoded === canonicalInput && looksReadable(decoded)
      ? decoded
      : value;
  } catch {
    return value;
  }
}

function epochMs(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric * 1000 : Number.NaN;
}

function providerDateMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  const normalized = value.trim().replace(" ", "T");
  const explicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  return Date.parse(explicitZone ? normalized : `${normalized}Z`);
}

export function parseXtreamEpgListings(
  listings: XtreamEpgListing[],
  channelId: string,
): XmltvProgramme[] {
  const programmes: XmltvProgramme[] = [];
  for (const row of listings) {
    let startMs = epochMs(row.start_timestamp);
    let stopMs = epochMs(row.stop_timestamp);
    if (!Number.isFinite(startMs)) startMs = providerDateMs(row.start);
    if (!Number.isFinite(stopMs)) stopMs = providerDateMs(row.end ?? row.stop);
    if (!Number.isFinite(startMs) || !Number.isFinite(stopMs) || stopMs <= startMs) continue;
    programmes.push({
      channelId,
      title: decodeXtreamEpgText(row.title) || "Programme",
      startMs,
      stopMs,
    });
  }
  return programmes.sort((a, b) => a.startMs - b.startMs || a.stopMs - b.stopMs);
}
