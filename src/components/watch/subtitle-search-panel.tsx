"use client";

import Link from "next/link";
import { ArrowLeft, Loader2, Search, Subtitles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { zendeFetch } from "@/lib/auth/zende-fetch";
import {
  buildSubtitleSearchQuery,
  defaultTitleQuery,
  formatSubtitleSearchLabel,
  hasResolvableMediaId,
  parseMediaIdOverride,
} from "@/lib/subtitles/search-query";
import type { SubtitleSearchResult } from "@/lib/subtitles/types";
import type { TmdbMediaMatch } from "@/lib/tmdb/types";
import type { PlaybackSessionMeta } from "@/lib/playback/stream-session-meta";
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

type Phase = "pick" | "subs";

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text.startsWith("<!DOCTYPE") ? `Server error (${res.status}).` : text || `Request failed (${res.status}).`);
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  playback?: PlaybackSessionMeta;
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
  onSelect,
}: Props) {
  const [wyzieEnabled, setWyzieEnabled] = useState<boolean | null>(null);
  const [tmdbEnabled, setTmdbEnabled] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [language, setLanguage] = useState("en");
  const [titleQuery, setTitleQuery] = useState("");
  const [releaseFilter, setReleaseFilter] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<TmdbMediaMatch | null>(null);
  const [mediaMatches, setMediaMatches] = useState<TmdbMediaMatch[]>([]);
  const [results, setResults] = useState<SubtitleSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSubtitleId, setLoadingSubtitleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ctx = useMemo(() => ({ title, playback }), [title, playback]);
  const defaultLabel = useMemo(() => formatSubtitleSearchLabel(ctx), [ctx]);
  const preferTmdbType = playback?.contentKind === "episode" ? "tv" : "any";

  useEffect(() => {
    if (!open) {
      return;
    }
    const initialTitle = defaultTitleQuery(ctx);
    setTitleQuery(initialTitle);
    setReleaseFilter("");
    setSelectedMedia(null);
    setMediaMatches([]);
    setResults([]);
    setError(null);

    const directId = hasResolvableMediaId(ctx, { mediaIdInput: initialTitle });
    setPhase(directId ? "subs" : "pick");

    void zendeFetch("/api/subtitles/status")
      .then((res) => parseJsonResponse<{ enabled?: boolean; tmdbEnabled?: boolean }>(res))
      .then((body: { enabled?: boolean; tmdbEnabled?: boolean }) => {
        setWyzieEnabled(Boolean(body.enabled));
        setTmdbEnabled(Boolean(body.tmdbEnabled));
      })
      .catch(() => {
        setWyzieEnabled(false);
        setTmdbEnabled(false);
      });
  }, [open, ctx]);

  const searchSubtitles = useCallback(
    async (media: { tmdbId?: string; imdbId?: string } | null) => {
      if (!wyzieEnabled) return;
      setLoading(true);
      setError(null);
      try {
        const built = buildSubtitleSearchQuery(ctx, {
          languages: language,
          selectedTmdbId: media?.tmdbId ?? selectedMedia?.tmdbId,
          selectedMediaType: selectedMedia?.mediaType,
          releaseFilter,
          mediaIdInput: media?.imdbId
            ? media.imdbId
            : media?.tmdbId
              ? media.tmdbId
              : titleQuery,
        });

        const params = new URLSearchParams();
        if (built.languages) params.set("languages", built.languages);
        if (built.imdbId) params.set("imdbId", built.imdbId);
        if (built.tmdbId) params.set("tmdbId", built.tmdbId);
        if (built.season != null) params.set("season", String(built.season));
        if (built.episode != null) params.set("episode", String(built.episode));
        if (built.type) params.set("type", built.type);
        if (built.releaseFilter) params.set("releaseFilter", built.releaseFilter);

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
        setPhase("subs");
      } catch (e) {
        setResults([]);
        setError(e instanceof Error ? e.message : "Subtitle search failed.");
      } finally {
        setLoading(false);
      }
    },
    [ctx, language, releaseFilter, selectedMedia, titleQuery, wyzieEnabled],
  );

  const searchTitles = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMediaMatches([]);
    setResults([]);
    setSelectedMedia(null);

    const mediaOverride = parseMediaIdOverride(titleQuery);
    if (mediaOverride.imdbId || mediaOverride.tmdbId) {
      setPhase("subs");
      await searchSubtitles({
        imdbId: mediaOverride.imdbId,
        tmdbId: mediaOverride.tmdbId,
      });
      return;
    }

    if (hasResolvableMediaId(ctx) && !titleQuery.trim()) {
      setPhase("subs");
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
      setPhase("pick");
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
      setPhase("subs");
    },
    [],
  );

  const backToTitleSearch = useCallback(() => {
    setPhase("pick");
    setSelectedMedia(null);
    setResults([]);
    setMediaMatches([]);
    setError(null);
  }, []);

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
      className="fixed inset-0 z-[140] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Search subtitles"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(88vh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/[0.14] bg-zinc-950/96 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/42">
              <Subtitles className="size-4 text-[var(--zen-signal)]" aria-hidden />
              Subtitle search
            </div>
            <h2 className="mt-1 truncate text-[20px] font-semibold tracking-[-0.03em] text-white">
              {phase === "subs" ? selectedLabel : defaultLabel}
            </h2>
            <p className="mt-1 text-[13px] text-white/48">
              {phase === "pick"
                ? "Search TMDB by title, pick the right movie or show, then choose subtitles."
                : "Pick a subtitle file to load into the player."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-3 border-b border-white/[0.08] px-5 py-4">
          {phase === "subs" ? (
            <button
              type="button"
              onClick={backToTitleSearch}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/55 hover:text-white"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Change movie or show
            </button>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
            <label className="block min-w-0">
              <span className="text-[12px] font-medium text-white/45">
                {phase === "pick" ? "Movie or show title" : "Release filter (optional)"}
              </span>
              <input
                value={phase === "pick" ? titleQuery : releaseFilter}
                onChange={(e) =>
                  phase === "pick"
                    ? setTitleQuery(e.target.value)
                    : setReleaseFilter(e.target.value)
                }
                className="mt-1.5 h-11 w-full rounded-2xl border border-white/[0.12] bg-black/40 px-3 text-[15px] text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
                placeholder={
                  phase === "pick"
                    ? "e.g. 1899, or tt1234567 / TMDB id"
                    : "1080p, WEB-DL, release name…"
                }
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-white/45">Language</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-2xl border border-white/[0.12] bg-black/40 px-3 text-[15px] text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void (phase === "pick" ? searchTitles() : searchSubtitles(null))}
                disabled={loading || wyzieEnabled === false}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--zen-frost)] px-4 text-[14px] font-semibold text-[var(--zen-void)] disabled:opacity-45 sm:w-auto"
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Search className="size-4" aria-hidden />
                )}
                {phase === "pick" ? "Find title" : "Search"}
              </button>
            </div>
          </div>

          {wyzieEnabled === false ? (
            <p className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-100/90">
              Subtitle download needs a Wyzie API key in{" "}
              <Link
                href="/settings?tab=integrations"
                className="font-semibold text-amber-50 underline underline-offset-2 hover:text-white"
              >
                Settings → Integrations
              </Link>
              .
            </p>
          ) : null}
          {phase === "pick" && tmdbEnabled === false ? (
            <p className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-100/90">
              Title search needs a free TMDB API key in{" "}
              <Link
                href="/settings?tab=integrations"
                className="font-semibold text-amber-50 underline underline-offset-2 hover:text-white"
              >
                Settings → Integrations
              </Link>{" "}
              (
              <a
                href="https://developer.themoviedb.org/docs/getting-started"
                target="_blank"
                rel="noreferrer"
                className="text-amber-50 underline underline-offset-2 hover:text-white"
              >
                get one here
              </a>
              ).
            </p>
          ) : null}
          {error ? (
            <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-100/90">
              {error}
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading && phase === "pick" && mediaMatches.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[14px] text-white/50">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              Searching TMDB…
            </div>
          ) : phase === "pick" && mediaMatches.length > 0 ? (
            <ul className="space-y-2">
              {mediaMatches.map((match) => (
                <li key={`${match.mediaType}-${match.tmdbId}`}>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void pickMedia(match)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[22px] border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-left transition-colors",
                      "hover:border-white/[0.18] hover:bg-white/[0.07] disabled:opacity-50",
                    )}
                  >
                    <div className="flex h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-white/8">
                      {match.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={match.posterUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-white">
                        {match.title}
                        {match.year ? (
                          <span className="font-normal text-white/45"> ({match.year})</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[12px] uppercase tracking-wide text-white/38">
                        {match.mediaType === "tv" ? "TV show" : "Movie"}
                      </p>
                      {match.overview ? (
                        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-white/48">
                          {match.overview}
                        </p>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : loading && results.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[14px] text-white/50">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              Searching subtitles…
            </div>
          ) : phase === "subs" && results.length === 0 ? (
            <p className="py-16 text-center text-[14px] text-white/45">
              No subtitles found. Try another language or release filter.
            </p>
          ) : (
            <ul className="space-y-2">
              {results.map((result) => {
                const busy = loadingSubtitleId === result.id;
                return (
                  <li key={result.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void loadSubtitle(result)}
                      className={cn(
                        "w-full rounded-[22px] border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-left transition-colors",
                        "hover:border-white/[0.18] hover:bg-white/[0.07] disabled:opacity-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-white">
                            {result.languageName}
                            {result.hearingImpaired ? (
                              <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/65">
                                CC
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-white/58">
                            {result.release}
                          </p>
                          <p className="mt-1 text-[11px] text-white/35">
                            {result.downloadCount > 0
                              ? `${result.downloadCount.toLocaleString()} downloads`
                              : null}
                            {result.source ? ` · ${result.source}` : ""}
                            {result.format ? ` · ${result.format.toUpperCase()}` : ""}
                          </p>
                        </div>
                        {busy ? (
                          <Loader2 className="mt-1 size-4 shrink-0 animate-spin text-white/70" />
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
