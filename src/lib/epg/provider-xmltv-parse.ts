export type ProviderXmltvChannel = {
  id: string;
  name: string;
};

export type ProviderXmltvProgramme = {
  channelId: string;
  title: string;
  description: string;
  startMs: number;
  stopMs: number;
};

export function decodeXmltvText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 16)),
    )
    .trim();
}

export function parseProviderXmltvTime(raw: string): number {
  const match = raw.trim().match(/^(\d{14})(?:\s+([+-])(\d{2})(\d{2}))?$/);
  if (!match) return Number.NaN;
  const digits = match[1]!;
  const sign = match[2] ?? "+";
  const hours = match[3] ?? "00";
  const minutes = match[4] ?? "00";
  const iso =
    `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` +
    `T${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}` +
    `${sign}${hours}:${minutes}`;
  return Date.parse(iso);
}

function tagText(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1] ? decodeXmltvText(match[1]) : "";
}

export function parseProviderXmltvChannelBlock(
  block: string,
): ProviderXmltvChannel | null {
  const id = block.match(/<channel\b[^>]*\bid="([^"]+)"/i)?.[1]?.trim();
  if (!id) return null;
  return { id, name: tagText(block, "display-name") || id };
}

export function parseProviderXmltvProgrammeBlock(
  block: string,
): ProviderXmltvProgramme | null {
  const attrs = block.match(/<programme\b([^>]*)>/i)?.[1] ?? "";
  const channelId = attrs.match(/\bchannel="([^"]+)"/i)?.[1]?.trim();
  const startRaw = attrs.match(/\bstart="([^"]+)"/i)?.[1];
  const stopRaw = attrs.match(/\bstop="([^"]+)"/i)?.[1];
  if (!channelId || !startRaw || !stopRaw) return null;
  const startMs = parseProviderXmltvTime(startRaw);
  const stopMs = parseProviderXmltvTime(stopRaw);
  if (!Number.isFinite(startMs) || !Number.isFinite(stopMs) || stopMs <= startMs) return null;
  return {
    channelId,
    title: tagText(block, "title") || "Programme",
    description: tagText(block, "desc"),
    startMs,
    stopMs,
  };
}
