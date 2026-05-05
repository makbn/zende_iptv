import "server-only";

import { unstable_cache } from "next/cache";

type GuideRow = {
  channel?: string | null;
  site?: string | null;
  site_id?: string | null;
};

/**
 * iptv-org/api/guides.json maps iptv channel ids (e.g. TSN1.ca) to site-specific
 * XMLTV channel ids (e.g. tsn1-ca for epg.iptvx.one). Prefer iptvx rows when
 * multiple sources exist so we can resolve programmes from the consolidated iptvx feed.
 */
export async function getIptvOrgSiteIdLookup(): Promise<Record<string, string>> {
  return unstable_cache(
    async (): Promise<Record<string, string>> => {
      const res = await fetch("https://iptv-org.github.io/api/guides.json", {
        headers: { Accept: "application/json" },
        next: { revalidate: 86_400 },
      });
      if (!res.ok) {
        return {};
      }
      const rows = (await res.json()) as GuideRow[];
      const byChannel = new Map<string, GuideRow[]>();
      for (const row of rows) {
        const ch = row.channel?.trim();
        const sid = row.site_id?.trim();
        if (!ch || !sid) continue;
        const list = byChannel.get(ch) ?? [];
        list.push(row);
        byChannel.set(ch, list);
      }
      const out: Record<string, string> = {};
      for (const [ch, list] of byChannel) {
        const iptvx = list.find((r) => r.site?.includes("iptvx"));
        const pick = iptvx ?? list[0];
        if (pick?.site_id) out[ch] = pick.site_id.trim();
      }
      return out;
    },
    ["iptv-org-guides-site-id-lookup"],
    { revalidate: 86_400 },
  )();
}

/** Strip iptv-org feed suffix: Channel.us@SD → Channel.us */
export function stripTvgFeedSuffix(tvgId: string): string {
  const t = tvgId.trim();
  const at = t.lastIndexOf("@");
  if (at > 0) return t.slice(0, at);
  return t;
}

export function resolveXmltvSiteId(
  tvgId: string,
  lookup: Record<string, string>,
): string | null {
  const trimmed = tvgId.trim();
  if (!trimmed) return null;
  const stripped = stripTvgFeedSuffix(trimmed);
  return lookup[stripped] ?? lookup[trimmed] ?? null;
}
