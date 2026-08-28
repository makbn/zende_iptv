import { buildXtreamSeriesContainerUrl } from "@/lib/iptv/xtream-url";
import type { M3uChannel } from "@/core/playlist/m3u-parse";

export function buildShowPageHref(seriesId: string, channel?: Pick<M3uChannel, "name" | "tvgLogo" | "groupTitle" | "providerChannelId">): string {
  const params = new URLSearchParams();
  if (channel?.name?.trim()) params.set("title", channel.name.trim());
  if (channel?.tvgLogo?.trim()) params.set("logo", channel.tvgLogo.trim());
  if (channel?.groupTitle?.trim()) params.set("group", channel.groupTitle.trim());
  if (channel?.providerChannelId?.trim()) params.set("channelId", channel.providerChannelId.trim());
  const q = params.toString();
  return `/library/show/${encodeURIComponent(seriesId)}${q ? `?${q}` : ""}`;
}

export function showPageHrefFromChannel(channel: M3uChannel): string | null {
  const fromUrl = channel.url.trim();
  if (fromUrl.startsWith("zende://series/")) {
    const id = decodeURIComponent(fromUrl.replace("zende://series/", "")).trim();
    return id ? buildShowPageHref(id, channel) : null;
  }
  const tvg = channel.tvgId?.match(/^xtream-series:(.+)$/);
  if (tvg?.[1]) return buildShowPageHref(tvg[1], channel);
  return null;
}

export function seriesContainerUrl(seriesId: string): string {
  return buildXtreamSeriesContainerUrl(seriesId);
}
