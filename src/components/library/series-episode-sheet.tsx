"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { isXtreamSeriesContainer } from "@/lib/channels/content-type";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { parseXtreamSeriesIdFromContainerUrl } from "@/lib/iptv/xtream-url";
import { cn } from "@/lib/utils";

type EpisodeRow = {
  season: string;
  episodeNum: string;
  title: string;
  playUrl: string;
};

type Props = {
  channel: M3uChannel | null;
  onClose: () => void;
  onPlayEpisode: (episode: Pick<M3uChannel, "url" | "name" | "tvgLogo" | "groupTitle">) => void;
};

export function SeriesEpisodeSheet({ channel, onClose, onPlayEpisode }: Props) {
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!channel || !isXtreamSeriesContainer(channel)) return;
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      setError(null);
      setEpisodes([]);
      try {
        const seriesId = parseXtreamSeriesIdFromContainerUrl(channel.url);
        const params = new URLSearchParams();
        if (seriesId) params.set("seriesId", seriesId);
        else params.set("url", channel.url);
        if (channel.tvgId?.startsWith("xtream-series:")) {
          params.set("tvgId", channel.tvgId);
        }
        const res = await zendeFetch(`/api/xtream/series-info?${params.toString()}`, {
          signal: controller.signal,
        });
        const body = (await res.json().catch(() => ({}))) as {
          episodes?: EpisodeRow[];
          error?: string;
        };
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setEpisodes(Array.isArray(body.episodes) ? body.episodes : []);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load episodes");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [channel]);

  if (!channel) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal
      aria-label={`Episodes for ${channel.name}`}
      onClick={onClose}
    >
      <div
        className={cn(
          "flex max-h-[min(80vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl",
          "border border-white/10 bg-zinc-950 shadow-2xl",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[13px] font-medium uppercase tracking-wide text-white/45">Show</p>
            <h2 className="text-[20px] font-semibold text-white">{channel.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/60 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <p className="px-2 py-8 text-center text-[15px] text-white/50">Loading episodes…</p>
          ) : error ? (
            <p className="px-2 py-8 text-center text-[15px] text-red-300">{error}</p>
          ) : episodes.length === 0 ? (
            <p className="px-2 py-8 text-center text-[15px] text-white/50">No episodes found.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {episodes.map((ep) => (
                <li key={ep.playUrl}>
                  <button
                    type="button"
                    className="flex w-full flex-col rounded-2xl px-3 py-3 text-left outline-none transition-colors hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-white"
                    onClick={() =>
                      onPlayEpisode({
                        url: ep.playUrl,
                        name: `${channel.name} · S${ep.season}E${ep.episodeNum || "?"} · ${ep.title}`,
                        tvgLogo: channel.tvgLogo,
                        groupTitle: channel.groupTitle,
                      })
                    }
                  >
                    <span className="text-[14px] font-semibold text-white">
                      S{ep.season}E{ep.episodeNum || "?"} · {ep.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
