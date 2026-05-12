import "server-only";

import { unstable_cache } from "next/cache";

type GuideRow = {
  channel?: string | null;
  feed?: string | null;
  site?: string | null;
  site_id?: string | null;
};

function isIptvxSite(site: string): boolean {
  const s = site.toLowerCase();
  return s.includes("iptvx");
}

/**
 * iptv-org/api/guides.json: map iptv channel id (e.g. TSN1.ca) → iptvx XML `channel="…"`
 * **only** from epg.iptvx.one rows.
 *
 * Rows for other sites (freeview, etc.) use different site_ids — feeding those into the
 * iptvx consolidated gzip made the scanner chase IDs that never appear there (empty EPG).
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
        const site = row.site?.trim() ?? "";
        if (!ch || !sid || !isIptvxSite(site)) continue;
        const list = byChannel.get(ch) ?? [];
        list.push(row);
        byChannel.set(ch, list);
      }
      const out: Record<string, string> = {};
      for (const [ch, list] of byChannel) {
        const sd = list.find((r) => r.feed === "SD");
        const pick = sd ?? list[0];
        if (pick?.site_id) {
          const sid = pick.site_id.trim();
          out[ch] = sid;
          const lo = ch.toLowerCase();
          if (!(lo in out)) out[lo] = sid;
        }
      }
      return out;
    },
    ["iptv-org-iptvx-site-id-lookup-v2"],
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
  return (
    lookup[stripped] ??
    lookup[trimmed] ??
    lookup[stripped.toLowerCase()] ??
    lookup[trimmed.toLowerCase()] ??
    null
  );
}
