import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { parseXtreamVodIdFromStreamUrl } from "@/lib/iptv/xtream-url";

export function buildMoviePageHref(
  movieId: string,
  channel?: Pick<M3uChannel, "name" | "tvgLogo" | "groupTitle">,
): string {
  const params = new URLSearchParams();
  if (channel?.name?.trim()) params.set("title", channel.name.trim());
  if (channel?.tvgLogo?.trim()) params.set("logo", channel.tvgLogo.trim());
  if (channel?.groupTitle?.trim()) params.set("group", channel.groupTitle.trim());
  const query = params.toString();
  return `/library/movie/${encodeURIComponent(movieId)}${query ? `?${query}` : ""}`;
}

export function moviePageHrefFromChannel(channel: M3uChannel): string | null {
  if (channel.providerChannelId?.trim()) {
    return buildMoviePageHref(`channel:${channel.providerChannelId.trim()}`, channel);
  }
  const vodId = parseXtreamVodIdFromStreamUrl(channel.url);
  if (!vodId) return null;
  const scopedId = channel.providerId?.trim() ? `${channel.providerId.trim()}:${vodId}` : vodId;
  return buildMoviePageHref(scopedId, channel);
}
