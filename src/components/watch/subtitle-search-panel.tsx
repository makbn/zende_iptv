"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@appica/ui-react/select";

import { Input } from "@appica/ui-react/input";

import Link from "next/link";
import { Search, Subtitles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ZendeLoadingState, ZendeSpinner } from "@/components/loading/zende-spinner";
import { Button } from "@appica/ui-react/button";

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
      className="fixed inset-0 z-[140] flex items-end justify-center bg-background p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Search subtitles"
    >
      <div
        className="flex max-h-[min(88vh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-foreground-intense">
              <Subtitles className="size-4 text-primary-strong" aria-hidden />
              Subtitle search
            </div>
            <h2 className="mt-1 truncate text-[20px] font-semibold tracking-[-0.03em] text-foreground-intense">
              {selectedLabel}
            </h2>
            <p className="mt-1 text-[13px] text-foreground-intense">
              Search by title or ID, refine by release/language, then load subtitles.
            </p>
          </div>
          <Button variant="ghost"
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-foreground-intense transition-colors hover:bg-background-muted hover:text-foreground-intense"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden />
          </Button>
        </div>

        <div className="space-y-3 border-b border-border px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="text-[12px] font-medium text-foreground-intense">Movie or show title</span>
              <Input
                value={titleQuery}
                onValueChange={(value) => setTitleQuery(value)}
                className="mt-1.5 h-11 w-full rounded-2xl border border-border bg-background px-3 text-[15px] text-foreground-intense outline-none focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="e.g. 1899, or tt1234567 / TMDB id"
              />
            </label>
            <label className="block min-w-0">
              <span className="text-[12px] font-medium text-foreground-intense">Release filter (optional)</span>
              <Input
                value={releaseFilter}
                onValueChange={(value) => setReleaseFilter(value)}
                className="mt-1.5 h-11 w-full rounded-2xl border border-border bg-background px-3 text-[15px] text-foreground-intense outline-none focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="1080p, WEB-DL, release name…"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <label className="block">
              <span className="text-[12px] font-medium text-foreground-intense">Language</span>
              <Select
                value={language}
                onValueChange={(value) =>setLanguage(String(value))}
              >
<SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                {LANGUAGE_OPTIONS.map((option) => (
                  <SelectItem key={option.code} value={option.code}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent></Select>
            </label>
            <div className="flex items-end justify-end gap-2">
              <Button
                type="button"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void searchTitles()}
                disabled={loading}
              >
                {loading ? (
                  <ZendeSpinner size="tiny" label="Finding title" />
                ) : (
                  <Search className="size-4" aria-hidden />
                )}
                Find title
              </Button>
              <Button
                type="button"
                onClick={() => void searchSubtitles(null)}
                disabled={loading || wyzieEnabled === false}
                variant="primary"
              >
                {loading ? (
                  <ZendeSpinner size="tiny" label="Searching subtitles" />
                ) : (
                  <Search className="size-4" aria-hidden />
                )}
                Search subtitles
              </Button>
            </div>
          </div>

          {wyzieEnabled === false ? (
            <p className="rounded-2xl border border-warning bg-warning-subtle px-3 py-2.5 text-[13px] text-warning-strong">
              Subtitle download needs a Wyzie API key in{" "}
              <Link
                href="/settings?tab=integrations"
                className="font-semibold text-warning-strong underline underline-offset-2 hover:text-foreground-intense"
              >
                Settings → Integrations
              </Link>
              .
            </p>
          ) : null}
          {tmdbEnabled === false ? (
            <p className="rounded-2xl border border-warning bg-warning-subtle px-3 py-2.5 text-[13px] text-warning-strong">
              Title search needs a free TMDB API key in{" "}
              <Link
                href="/settings?tab=integrations"
                className="font-semibold text-warning-strong underline underline-offset-2 hover:text-foreground-intense"
              >
                Settings → Integrations
              </Link>{" "}
              (
              <a
                href="https://developer.themoviedb.org/docs/getting-started"
                target="_blank"
                rel="noreferrer"
                className="text-warning-strong underline underline-offset-2 hover:text-foreground-intense"
              >
                get one here
              </a>
              ).
            </p>
          ) : null}
          {error ? (
            <p className="rounded-2xl border border-error bg-error-subtle px-3 py-2.5 text-[13px] text-error-strong">
              {error}
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading && mediaMatches.length === 0 && results.length === 0 ? (
            <ZendeLoadingState className="py-16" size="small" label="Searching subtitles…" />
          ) : results.length === 0 ? (
            <p className="py-16 text-center text-[14px] text-foreground-intense">
              No subtitles found. Try another language or release filter.
            </p>
          ) : (
            <>
              {mediaMatches.length > 0 ? (
                <div className="mb-4 space-y-2">
                  <p className="px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-foreground-intense">
                    Matching titles (optional)
                  </p>
                  <ul className="space-y-2">
                    {mediaMatches.map((match) => (
                      <li key={`${match.mediaType}-${match.tmdbId}`}>
                        <Button variant="ghost"
                          type="button"
                          disabled={loading}
                          onClick={() => void pickMedia(match)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg border border-border bg-background-muted px-4 py-3 text-left transition-colors",
                            "hover:border-border hover:bg-background-muted disabled:opacity-50",
                          )}
                        >
                          <div className="flex h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-background-muted">
                            {match.posterUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={secureImageUrl(match.posterUrl, undefined, "poster")} alt="" className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-semibold text-foreground-intense">
                              {match.title}
                              {match.year ? (
                                <span className="font-normal text-foreground-intense"> ({match.year})</span>
                              ) : null}
                            </p>
                            <p className="mt-0.5 text-[12px] uppercase tracking-wide text-foreground-intense">
                              {match.mediaType === "tv" ? "TV show" : "Movie"}
                            </p>
                            {match.overview ? (
                              <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-foreground-intense">
                                {match.overview}
                              </p>
                            ) : null}
                          </div>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <ul className="space-y-2">
                {results.map((result) => {
                  const busy = loadingSubtitleId === result.id;
                  return (
                    <li key={result.id}>
                      <Button variant="ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => void loadSubtitle(result)}
                        className={cn(
                          "w-full rounded-lg border border-border bg-background-muted px-4 py-3 text-left transition-colors",
                          "hover:border-border hover:bg-background-muted disabled:opacity-50",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold text-foreground-intense">
                              {result.languageName}
                              {result.hearingImpaired ? (
                                <span className="ml-2 rounded-full bg-background-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-intense">
                                  CC
                                </span>
                              ) : null}
                            </p>
                            <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-foreground-intense">
                              {result.release}
                            </p>
                            <p className="mt-1 text-[11px] text-foreground-intense">
                              {result.downloadCount > 0
                                ? `${result.downloadCount.toLocaleString()} downloads`
                                : null}
                              {result.source ? ` · ${result.source}` : ""}
                              {result.format ? ` · ${result.format.toUpperCase()}` : ""}
                            </p>
                          </div>
                          {busy ? (
                            <ZendeSpinner className="mt-1" size="tiny" label="Loading subtitle" />
                          ) : null}
                        </div>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
