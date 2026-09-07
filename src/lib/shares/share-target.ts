import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { resolveLibraryContentType } from "@/lib/channels/content-type";
import type { CreateWatchInput } from "@/lib/navigation/watch-url";
import type { MediaShareTarget } from "@/lib/shares/media-share-types";

export function mediaShareTargetForChannel(
  channel: M3uChannel | CreateWatchInput,
): MediaShareTarget | null {
  const contentType = resolveLibraryContentType(channel as M3uChannel);
  if (contentType === "series") return null;
  const kind = contentType === "movie" ? "movie" : "live";
  const watchChannel = channel as CreateWatchInput;
  return {
    kind,
    title: channel.name?.trim() || (kind === "live" ? "Live channel" : "Movie"),
    ...(channel.tvgLogo ? { logo: channel.tvgLogo } : {}),
    ...(channel.groupTitle ? { group: channel.groupTitle } : {}),
    items: [
      {
        id: "main",
        title: channel.name?.trim() || "Shared media",
        url: channel.url,
        playback: {
          contentKind: kind,
          ...(watchChannel.playback ?? {}),
          ...(channel.providerId?.trim()
            ? { guideProviderId: channel.providerId.trim() }
            : {}),
          ...(channel.tvgId?.trim() ? { guideTvgId: channel.tvgId.trim() } : {}),
        },
      },
    ],
  };
}
