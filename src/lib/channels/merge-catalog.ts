import type { M3uChannel } from "@/core/playlist/m3u-parse";

/** Provider streams keep their database identity; legacy/builtin rows dedupe by URL. */
export function mergeBuiltinAndManual(
  builtin: M3uChannel[],
  manual: M3uChannel[],
): M3uChannel[] {
  const seen = new Set<string>();
  const out: M3uChannel[] = [];
  for (const ch of [...manual, ...builtin]) {
    const key = ch.providerChannelId ? `provider:${ch.providerChannelId}` : `url:${ch.url.trim()}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(ch);
  }
  return out;
}
