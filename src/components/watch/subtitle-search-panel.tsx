"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@appica/ui-react/select";
import { Input } from "@appica/ui-react/input";
import Link from "next/link";
import { Check, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZendeLoadingState, ZendeSpinner } from "@/components/loading/zende-spinner";
import { Button } from "@appica/ui-react/button";

import { zendeFetch } from "@/lib/auth/zende-fetch";
import {
  buildSubtitleSearchQuery,
  defaultTitleQuery,
  formatSubtitleSearchLabel,
  hasResolvableMediaId,
  parseMediaIdOverride,
  rankSubtitleResults,
  releaseTokensFromTitle,
} from "@/lib/subtitles/search-query";
import type { SubtitleSearchResult } from "@/lib/subtitles/types";
import type { TmdbMediaMatch } from "@/lib/tmdb/types";
import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";
import { secureImageUrl } from "@/lib/media/secure-image-url";
import { cn } from "@/lib/utils";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "pt-br", label: "Portuguese (BR)" },
  { code: "ar", label: "Arabic" },
  { code: "fa", label: "Persian" },
  { code: "tr", label: "Turkish" },
  { code: "ru", label: "Russian" },
  { code: "zh-cn", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
];

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      text.startsWith("<!DOCTYPE") ? `Server error (${res.status}).` : text || `Request failed (${res.status}).`,
    );
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  playback?: PlaybackSessionMeta;
  tvMode?: boolean;
  activeTrackId?: string | null;
  onTurnOff: () => void;
  onSelect: (track: {
    id: string;
    label: string;
    language: string;
    vttUrl: string;
  }) => void;
};

export function SubtitleSearchPanel({
  open,
  onClose,
  title,
  playback,
  tvMode = false,
  activeTrackId = null,
  onTurnOff,
  onSelect,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const autoSearchedFor = useRef<string | null>(null);
  const [wyzieEnabled, setWyzieEnabled] = useState<boolean | null>(null);
  const [tmdbEnabled, setTmdbEnabled] = useState<boolean | null>(null);
  const [language, setLanguage] = useState("en");
  const [titleQuery, setTitleQuery] = useState("");
  const [releaseFilter, setReleaseFilter] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<TmdbMediaMatch | null>(null);
  const [mediaMatches, setMediaMatches] = useState<TmdbMediaMatch[]>([]);
  const [results, setResults] = useState<SubtitleSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSubtitleId, setLoadingSubtitleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ctx = useMemo(() => ({ title, playback }), [title, playback]);
  const defaultLabel = useMemo(() => formatSubtitleSearchLabel(ctx), [ctx]);
  const preferTmdbType = playback?.contentKind === "episode" ? "tv" : "any";
  const releaseTokens = useMemo(
    () =>
      releaseTokensFromTitle(
        title,
        playback?.seriesTitle,
        playback?.searchTitle,
        playback?.episodeTitle,
      ),
    [title, playback?.seriesTitle, playback?.searchTitle, playback?.episodeTitle],
  );
  const rankedResults = useMemo(
    () => rankSubtitleResults(results, releaseTokens),
    [results, releaseTokens],
  );
  const canAutoSearch = hasResolvableMediaId(ctx);
  const sessionKey = [
    playback?.imdbId ?? "",
    playback?.tmdbId ?? "",
    playback?.season ?? "",
    playback?.episodeNum ?? "",
    language,
  ].join("|");

  useEffect(() => {
    if (!open) {
      autoSearchedFor.current = null;
      return;
    }
    const initialTitle = defaultTitleQuery(ctx);
    setTitleQuery(initialTitle);
    setReleaseFilter("");
    setSelectedMedia(null);
    setMediaMatches([]);
    setResults([]);
    setError(null);
    setAdvancedOpen(!canAutoSearch);

    void zendeFetch("/api/subtitles/status")
      .then((res) => parseJsonResponse<{ enabled?: boolean; tmdbEnabled?: boolean }>(res))
      .then((body) => {
        setWyzieEnabled(Boolean(body.enabled));
        setTmdbEnabled(Boolean(body.tmdbEnabled));
      })
      .catch(() => {
        setWyzieEnabled(false);
        setTmdbEnabled(false);
      });
  }, [open, ctx, canAutoSearch]);

  useEffect(() => {
    if (!open || !tvMode) return;
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>("[data-subtitle-primary]")
        ?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, tvMode, rankedResults.length, loading]);

  const searchSubtitles = useCallback(
    async (media: { tmdbId?: string; imdbId?: string } | null) => {
      if (wyzieEnabled === false) return;
      setLoading(true);
      setError(null);
      try {
        const built = buildSubtitleSearchQuery(ctx, {
          languages: language,
          selectedTmdbId: media?.tmdbId ?? selectedMedia?.tmdbId,
          selectedMediaType: selectedMedia?.mediaType,
          // Prefer client-side ranking from portal tags; hard releaseFilter often returns nothing.
          releaseFilter: releaseFilter.trim() || undefined,
          mediaIdInput: media?.imdbId
            ? media.imdbId
            : media?.tmdbId
              ? media.tmdbId
              : undefined,
        });

        const params = new URLSearchParams();
        if (built.languages) params.set("languages", built.languages);
        if (built.imdbId) params.set("imdbId", built.imdbId);
        if (built.tmdbId) params.set("tmdbId", built.tmdbId);
        if (built.season != null) params.set("season", String(built.season));
        if (built.episode != null) params.set("episode", String(built.episode));
        if (built.type) params.set("type", built.type);
        if (built.releaseFilter) params.set("releaseFilter", built.releaseFilter);

        if (!built.imdbId && !built.tmdbId) {
          setResults([]);
          setError("No IMDb or TMDB id is available for this title yet. Use Advanced search.");
          setAdvancedOpen(true);
          return;
        }

        const res = await zendeFetch(`/api/subtitles/search?${params.toString()}`);
        const body = await parseJsonResponse<{
          enabled?: boolean;
          results?: SubtitleSearchResult[];
          error?: string;
        }>(res);

        if (!res.ok) {
          throw new Error(body.error ?? `Search failed (${res.status}).`);
        }

        setResults(Array.isArray(body.results) ? body.results : []);
        if (body.error) setError(body.error);
        if (Array.isArray(body.results) && body.results.length === 0 && !body.error) {
          setError("No subtitles found for this title. Try Advanced search or another language.");
        }
      } catch (e) {
        setResults([]);
        setError(e instanceof Error ? e.message : "Subtitle search failed.");
      } finally {
        setLoading(false);
      }
    },
    [ctx, language, releaseFilter, selectedMedia, wyzieEnabled],
  );

  useEffect(() => {
    if (!open || wyzieEnabled !== true || !canAutoSearch) return;
    if (autoSearchedFor.current === sessionKey) return;
    autoSearchedFor.current = sessionKey;
    void searchSubtitles(null);
  }, [open, wyzieEnabled, canAutoSearch, sessionKey, searchSubtitles]);

  const searchTitles = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMediaMatches([]);
    setResults([]);
    setSelectedMedia(null);

    const mediaOverride = parseMediaIdOverride(titleQuery);
    if (mediaOverride.imdbId || mediaOverride.tmdbId) {
      await searchSubtitles({
        imdbId: mediaOverride.imdbId,
        tmdbId: mediaOverride.tmdbId,
      });
      return;
    }

    if (hasResolvableMediaId(ctx) && !titleQuery.trim()) {
      await searchSubtitles(null);
      return;
    }

    if (!tmdbEnabled) {
      setError(
        "Add a TMDB API key in Settings → Integrations to search by movie or show title.",
      );
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({
        query: titleQuery.trim(),
        type: preferTmdbType,
      });
      const res = await zendeFetch(`/api/subtitles/tmdb-search?${params.toString()}`);
      const body = await parseJsonResponse<{
        results?: TmdbMediaMatch[];
        error?: string;
      }>(res);
      if (!res.ok) {
        throw new Error(body.error ?? `Title search failed (${res.status}).`);
      }
      const matches = Array.isArray(body.results) ? body.results : [];
      setMediaMatches(matches);
      if (matches.length === 0) {
        setError("No movies or shows found on TMDB. Try a different title.");
      }
    } catch (e) {
      setMediaMatches([]);
      setError(e instanceof Error ? e.message : "Title search failed.");
    } finally {
      setLoading(false);
    }
  }, [ctx, preferTmdbType, searchSubtitles, titleQuery, tmdbEnabled]);

  const pickMedia = useCallback(
    (media: TmdbMediaMatch) => {
      setSelectedMedia(media);
      setError(null);
      setResults([]);
      void searchSubtitles({ tmdbId: media.tmdbId });
    },
    [searchSubtitles],
  );

  const loadSubtitle = useCallback(
    async (result: SubtitleSearchResult) => {
      setLoadingSubtitleId(result.id);
      setError(null);
      try {
        const res = await zendeFetch("/api/subtitles/load", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: result.url,
            label: `${result.languageName} · ${result.release}`,
            language: result.language,
            fileName: result.release,
          }),
        });
        const body = await parseJsonResponse<{
          trackId?: string;
          label?: string;
          language?: string;
          vttUrl?: string;
          error?: string;
        }>(res);
        if (!res.ok || !body.trackId || !body.vttUrl || !body.label || !body.language) {
          throw new Error(body.error ?? `Could not load subtitle (${res.status}).`);
        }
        onSelect({
          id: body.trackId,
          label: body.label,
          language: body.language,
          vttUrl: body.vttUrl,
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load subtitle.");
      } finally {
        setLoadingSubtitleId(null);
      }
    },
    [onClose, onSelect],
  );

  if (!open) return null;

  const selectedLabel = selectedMedia
    ? `${selectedMedia.title}${selectedMedia.year ? ` (${selectedMedia.year})` : ""}`
    : defaultLabel;

  return (
    <div
      ref={dialogRef}
      className={cn(
        "fixed inset-0 z-[140] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6",
        tvMode && "items-center p-8",
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Subtitles"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.keyCode === 10009) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        className={cn(
          "flex max-h-[min(84vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c1220] shadow-2xl",
          tvMode && "max-h-[90vh] max-w-3xl rounded-3xl",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          data-tv-layout={tvMode ? "horizontal" : undefined}
          className={cn(
            "flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4",
            tvMode && "gap-6 px-8 py-5",
          )}
        >
          <div className="min-w-0">
            <p
              className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45",
                tvMode && "text-sm",
              )}
            >
              Subtitles
            </p>
            <h2
              className={cn(
                "mt-0.5 truncate text-[17px] font-semibold tracking-tight text-white",
                tvMode && "mt-1 text-2xl",
              )}
            >
              {selectedLabel}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-white/70 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40",
              tvMode && "size-14",
            )}
            aria-label="Close"
          >
            <X className={cn("size-5", tvMode && "size-7")} aria-hidden />
          </button>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-4", tvMode && "px-6 py-5")}>
          <div className={cn("flex flex-col gap-2", tvMode && "gap-3")}>
            <button
              type="button"
              data-subtitle-primary
              onClick={() => {
                onTurnOff();
                onClose();
              }}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left outline-none transition-colors",
                "bg-white/[0.06] hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white/30",
                !activeTrackId && "ring-1 ring-white/25",
                tvMode && "min-h-16 px-5 text-xl",
              )}
            >
              <span className="text-[14px] font-medium text-white">Off</span>
              {!activeTrackId ? (
                <Check className="size-4 shrink-0 text-emerald-400" aria-hidden />
              ) : null}
            </button>

            {wyzieEnabled === false ? (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-100">
                Add a Wyzie API key in{" "}
                <Link
                  href="/settings?tab=integrations"
                  className="font-semibold underline underline-offset-2"
                >
                  Settings → Integrations
                </Link>
                .
              </p>
            ) : null}

            {error ? (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-100">
                {error}
              </p>
            ) : null}

            {loading && rankedResults.length === 0 && mediaMatches.length === 0 ? (
              <ZendeLoadingState className="py-14" size="small" label="Loading subtitles…" />
            ) : null}

            {mediaMatches.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  Titles
                </p>
                <ul
                  data-tv-layout={tvMode ? "vertical" : undefined}
                  className="flex flex-col gap-2"
                >
                  {mediaMatches.map((match) => (
                    <li key={`${match.mediaType}-${match.tmdbId}`}>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void pickMedia(match)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl bg-white/[0.06] px-3 py-2.5 text-left outline-none transition-colors",
                          "hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-50",
                          tvMode && "min-h-20 gap-4 px-4 py-3",
                        )}
                      >
                        <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-white/5">
                          {match.posterUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={secureImageUrl(match.posterUrl, undefined, "poster")}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate text-[14px] font-medium text-white", tvMode && "text-xl")}>
                            {match.title}
                            {match.year ? (
                              <span className="font-normal text-white/45"> ({match.year})</span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-[12px] text-white/40">
                            {match.mediaType === "tv" ? "TV show" : "Movie"}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {rankedResults.length > 0 ? (
              <ul
                data-tv-layout={tvMode ? "vertical" : undefined}
                className="flex flex-col gap-2"
              >
                {rankedResults.map((result) => {
                  const busy = loadingSubtitleId === result.id;
                  const selected = activeTrackId === result.id;
                  const metaBits = [
                    result.hearingImpaired ? "CC" : null,
                    result.downloadCount > 0
                      ? `${result.downloadCount.toLocaleString()} dl`
                      : null,
                    result.format ? result.format.toUpperCase() : null,
                  ].filter(Boolean);
                  return (
                    <li key={result.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void loadSubtitle(result)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left outline-none transition-colors",
                          "bg-white/[0.06] hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white/30",
                          selected && "bg-white/[0.12] ring-1 ring-white/30",
                          busy && "opacity-70",
                          tvMode && "min-h-16 px-5 py-4",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-baseline gap-2">
                            <span
                              className={cn(
                                "shrink-0 text-[14px] font-semibold text-white",
                                tvMode && "text-xl",
                              )}
                            >
                              {result.languageName}
                            </span>
                            {metaBits.length > 0 ? (
                              <span className="truncate text-[11px] text-white/40">
                                {metaBits.join(" · ")}
                              </span>
                            ) : null}
                          </div>
                          <p
                            className={cn(
                              "mt-1 truncate font-mono text-[12px] text-white/50",
                              tvMode && "text-base",
                            )}
                            title={result.release}
                          >
                            {result.release}
                          </p>
                        </div>
                        <span className="flex size-5 shrink-0 items-center justify-center">
                          {busy ? (
                            <ZendeSpinner size="tiny" label="Loading subtitle" />
                          ) : selected ? (
                            <Check className="size-4 text-emerald-400" aria-hidden />
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {!loading && rankedResults.length === 0 && mediaMatches.length === 0 && !error ? (
              <p className={cn("py-8 text-center text-[14px] text-white/45", tvMode && "text-xl")}>
                {canAutoSearch
                  ? "No subtitle tracks yet."
                  : "Open Advanced search to look up this title."}
              </p>
            ) : null}
          </div>
        </div>

        <div className={cn("shrink-0 border-t border-white/10 px-4 py-3", tvMode && "px-6 py-4")}>
          <button
            type="button"
            onClick={() => setAdvancedOpen((value) => !value)}
            className={cn(
              "mx-auto flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium text-white/70 outline-none transition-colors",
              "hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-white/30",
              tvMode && "min-h-14 text-lg",
            )}
          >
            <Search className="size-4" aria-hidden />
            {advancedOpen ? "Hide advanced search" : "Advanced search"}
          </button>

          {advancedOpen ? (
            <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
              <div
                data-tv-layout={tvMode ? "grid" : undefined}
                data-tv-columns={tvMode ? "2" : undefined}
                className="grid gap-3 sm:grid-cols-2"
              >
                <label className="block min-w-0">
                  <span className={cn("text-[12px] font-medium text-white/55", tvMode && "text-lg")}>
                    Movie or show title
                  </span>
                  <Input
                    value={titleQuery}
                    onValueChange={(value) => setTitleQuery(value)}
                    className={cn(
                      "mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[14px] text-white",
                      tvMode && "mt-2 h-14 px-5 text-xl",
                    )}
                    placeholder="e.g. blackAF, or tt1234567"
                  />
                </label>
                <label className="block min-w-0">
                  <span className={cn("text-[12px] font-medium text-white/55", tvMode && "text-lg")}>
                    Release filter (optional)
                  </span>
                  <Input
                    value={releaseFilter}
                    onValueChange={(value) => setReleaseFilter(value)}
                    className={cn(
                      "mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[14px] text-white",
                      tvMode && "mt-2 h-14 px-5 text-xl",
                    )}
                    placeholder="EN, WEB-DL, release name…"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
                <label className="block">
                  <span className={cn("text-[12px] font-medium text-white/55", tvMode && "text-lg")}>
                    Language
                  </span>
                  <Select value={language} onValueChange={(value) => setLanguage(String(value))}>
                    <SelectTrigger className={cn("mt-1.5", tvMode && "mt-2 min-h-14 text-lg")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_OPTIONS.map((option) => (
                        <SelectItem key={option.code} value={option.code}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <div className="flex items-end justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void searchTitles()}
                    disabled={loading}
                    className={cn(tvMode && "min-h-14 px-6 text-lg")}
                  >
                    {loading ? <ZendeSpinner size="tiny" label="Finding title" /> : null}
                    Find title
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => void searchSubtitles(null)}
                    disabled={loading || wyzieEnabled === false}
                    className={cn(tvMode && "min-h-14 px-6 text-lg")}
                  >
                    {loading ? (
                      <ZendeSpinner size="tiny" label="Searching subtitles" />
                    ) : null}
                    Search
                  </Button>
                </div>
              </div>
              {tmdbEnabled === false ? (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-100">
                  Title search needs a TMDB API key in Settings → Integrations.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
