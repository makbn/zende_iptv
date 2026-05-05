/**
 * Minimal XMLTV subset parser for programme listings (title + start/stop times).
 */

export type XmltvProgramme = {
  channelId: string;
  title: string;
  startMs: number;
  stopMs: number;
};

export type XmltvNowNext = {
  current: { title: string; startMs: number; stopMs: number } | null;
  next: { title: string; startMs: number; stopMs: number } | null;
};

function parseXmltvInstant(raw: string): number {
  const m = raw
    .trim()
    .match(/^(\d{14})\s+([+-])(\d{2})(\d{2})$/);
  if (!m) return NaN;
  const [, digits, sign, oh, om] = m;
  const Y = digits.slice(0, 4);
  const Mo = digits.slice(4, 6);
  const D = digits.slice(6, 8);
  const H = digits.slice(8, 10);
  const Mi = digits.slice(10, 12);
  const S = digits.slice(12, 14);
  const iso = `${Y}-${Mo}-${D}T${H}:${Mi}:${S}${sign}${oh}:${om}`;
  return Date.parse(iso);
}

function extractTitle(block: string): string {
  const tm = block.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = tm?.[1]?.trim();
  return title || "Programme";
}

/** Pull programme blocks from raw XMLTV (handles minified single-line docs). */
export function parseXmltvProgrammes(xml: string): XmltvProgramme[] {
  const out: XmltvProgramme[] = [];
  const re =
    /<programme\s+([^>]+)>([\s\S]*?)<\/programme>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1] ?? "";
    const inner = m[2] ?? "";
    const startRaw = attrs.match(/\bstart="([^"]+)"/)?.[1];
    const stopRaw = attrs.match(/\bstop="([^"]+)"/)?.[1];
    const channelId = attrs.match(/\bchannel="([^"]+)"/)?.[1];
    if (!startRaw || !stopRaw || !channelId) continue;
    const startMs = parseXmltvInstant(startRaw);
    const stopMs = parseXmltvInstant(stopRaw);
    if (!Number.isFinite(startMs) || !Number.isFinite(stopMs)) continue;
    out.push({
      channelId,
      title: extractTitle(inner),
      startMs,
      stopMs,
    });
  }
  return out;
}

function programmeSort(a: XmltvProgramme, b: XmltvProgramme): number {
  return a.startMs - b.startMs || a.stopMs - b.stopMs;
}

/** Resolve current (now ∈ [start,stop)) and following programme per channel. */
export function pickNowNextForChannels(
  programmes: XmltvProgramme[],
  channelIds: string[],
  nowMs: number,
): Map<string, XmltvNowNext> {
  const wanted = new Set(channelIds);
  const byChannel = new Map<string, XmltvProgramme[]>();
  for (const p of programmes) {
    if (!wanted.has(p.channelId)) continue;
    const list = byChannel.get(p.channelId) ?? [];
    list.push(p);
    byChannel.set(p.channelId, list);
  }
  for (const [, list] of byChannel) {
    list.sort(programmeSort);
  }

  const result = new Map<string, XmltvNowNext>();
  for (const id of channelIds) {
    const list = byChannel.get(id);
    if (!list?.length) {
      result.set(id, { current: null, next: null });
      continue;
    }

    let current: XmltvProgramme | null = null;
    for (const p of list) {
      if (nowMs >= p.startMs && nowMs < p.stopMs) {
        current = p;
        break;
      }
    }

    let next: XmltvProgramme | null = null;
    if (current) {
      const idx = list.indexOf(current);
      next = list[idx + 1] ?? null;
    } else {
      for (const p of list) {
        if (p.startMs > nowMs) {
          next = p;
          break;
        }
      }
    }

    result.set(id, {
      current: current
        ? {
            title: current.title,
            startMs: current.startMs,
            stopMs: current.stopMs,
          }
        : null,
      next: next
        ? { title: next.title, startMs: next.startMs, stopMs: next.stopMs }
        : null,
    });
  }
  return result;
}

/** Try alternate iptv-org style ids (feed suffixes). */
export function expandChannelIdVariants(id: string): string[] {
  const t = id.trim();
  if (!t) return [];
  const out = new Set<string>([t]);
  const at = t.lastIndexOf("@");
  if (at > 0) {
    out.add(t.slice(0, at));
  }
  return [...out];
}
