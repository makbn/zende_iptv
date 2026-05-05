import type { M3uChannel } from "@/core/playlist/m3u-parse";

/** Manual streams first; duplicate URLs keep the first occurrence only. */
export function mergeBuiltinAndManual(
  builtin: M3uChannel[],
  manual: M3uChannel[],
): M3uChannel[] {
  const seen = new Set<string>();
  const out: M3uChannel[] = [];
  for (const ch of [...manual, ...builtin]) {
    const key = ch.url.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(ch);
  }
  return out;
}
