import type { M3uChannel } from "@/core/playlist/m3u-parse";

/** Builds `/watch` URL with encoded stream URL and title. */
export function watchHref(
  channel: Pick<M3uChannel, "url" | "name"> &
    Partial<Pick<M3uChannel, "tvgLogo" | "groupTitle">>,
): string {
  const params = new URLSearchParams();
  params.set("url", channel.url);
  params.set("title", channel.name?.trim() || "Live");
  if (channel.tvgLogo) params.set("logo", channel.tvgLogo);
  if (channel.groupTitle) params.set("group", channel.groupTitle);
  return `/watch?${params.toString()}`;
}
