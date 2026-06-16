"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Search, Loader2, X } from "lucide-react";

import { MobileChannelCard } from "@/components/mobile/mobile-channel-card";
import { LibraryResultsShell } from "@/components/library/library-results-shell";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import {
  useLibraryCatalog,
  type LibraryContentTab,
} from "@/features/iptv/use-library-catalog";
import { useLibrarySearch } from "@/features/iptv/use-library-search";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import { showPageHrefFromChannel } from "@/lib/navigation/show-page";
import { isXtreamSeriesContainer } from "@/lib/channels/content-type";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { cn } from "@/lib/utils";

const source = BUILTIN_PLAYLIST_SOURCES[0]!;
const PAGE_STEP = 60;

export function MobileLibraryPage() {
  const router = useRouter();
  const { openChannel: playStream, navError, clearNavError } = useWatchNavigation();

  const openChannel = useCallback(
    (ch: M3uChannel) => {
      if (isXtreamSeriesContainer(ch)) {
        const href = showPageHrefFromChannel(ch);
        if (href) {
          router.push(href);
          return;
        }
      }
      playStream(ch);
    },
    [playStream, router],
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    draftQuery,
    setDraftQuery,
    appliedQuery,
    clearSearch,
    isSearchPending,
  } = useLibrarySearch(searchInputRef);

  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);
  const [contentTab, setContentTab] = useState<LibraryContentTab>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);

  const { channels, total, facets, loading, refreshing, hasMore } = useLibraryCatalog({
    presetId: source.presetId,
    contentTab,
    query: appliedQuery,
    groupFilter,
    languageFilter,
    limit: visibleCount,
  });
  const resultsBusy = loading || refreshing || isSearchPending;
  const { getScoreForChannel } = useChannelHealthLookup(channels);

  const groupOptions = useMemo(
    () => facets.groups.map((g) => [g.name, g.count] as const),
    [facets.groups],
  );
  const languageOptions = facets.languages;

  useEffect(() => {
    startTransition(() => {
      setGroupFilter(null);
      setLanguageFilter(null);
      setVisibleCount(PAGE_STEP);
    });
  }, [contentTab]);

  useEffect(() => {
    startTransition(() => setVisibleCount(PAGE_STEP));
  }, [appliedQuery, groupFilter, languageFilter]);

  const visible = channels;
  const filteredCount = total;
  const activeFilters = Boolean(
    appliedQuery.trim() || groupFilter || languageFilter,
  );

  const onSearchKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      clearSearch();
      searchInputRef.current?.blur();
    }
  }, [clearSearch]);

  return (
    <main className="min-h-screen bg-[var(--tv-page-bg)] pb-28 pt-[5.35rem] text-foreground">
      <section className="px-4">
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.035] px-3.5 py-2.5 ring-1 ring-white/[0.04]",
            "backdrop-blur-md transition-[border-color,box-shadow] duration-300 ease-out",
            "hover:border-white/[0.11] hover:shadow-[0_14px_44px_-28px_rgba(0,0,0,0.6)]",
            "motion-safe:animate-zen-shell-in motion-reduce:animate-none motion-reduce:opacity-100",
          )}
        >
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_120%_at_100%_0%,oklch(0.38_0.12_264/0.14),transparent_52%)]"
            aria-hidden
          />
          <div className="relative flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                Library
              </p>
              <h1 className="mt-0.5 text-[1.25rem] font-semibold leading-none tracking-tight text-white sm:text-[1.35rem]">
                Browse channels
              </h1>
            </div>
            <span className="shrink-0 rounded-lg border border-white/[0.08] bg-black/30 px-2 py-1 text-[10px] text-white/48 ring-1 ring-white/[0.03]">
              <span className="font-semibold tabular-nums text-white/88">
                {resultsBusy ? (
                  <Loader2 className="inline size-3 animate-spin" aria-hidden />
                ) : (
                  total.toLocaleString()
                )}
              </span>{" "}
              {contentTab === "movie"
                ? "movies"
                : contentTab === "series"
                  ? "shows"
                  : contentTab === "live"
                    ? "live"
                    : "total"}
            </span>
          </div>
          <p className="relative mt-1.5 text-[11.5px] leading-snug text-white/42">
            Search and filters — list starts below.
          </p>
        </div>
      </section>

      <section className="sticky top-[5.35rem] z-40 mt-2 px-3" aria-label="Library filters">
        <ZenedeGlass
          variant="panelCompact"
          className="rounded-[20px] border-white/[0.1] bg-black/58 p-2.5 shadow-[0_16px_48px_-26px_rgba(0,0,0,0.82)] transition-[box-shadow] duration-300"
        >
          <div className="tv-row-scroll mb-3 flex gap-2 overflow-x-auto pb-0.5">
            {([
              ["all", "All"],
              ["live", "Live"],
              ["movie", "Movies"],
              ["series", "Shows"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setContentTab(id)}
                className={cn(
                  "zen-pressable min-h-10 shrink-0 rounded-2xl px-4 text-[13px] font-semibold outline-none",
                  "transition-[background-color,color,transform,box-shadow] duration-200 ease-out",
                  contentTab === id
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "border border-white/[0.1] bg-white/[0.06] text-white/70 hover:bg-white/[0.1]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="relative block">
            <span className="sr-only">Search channels</span>
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-white/38"
              aria-hidden
            />
            <input
              ref={searchInputRef}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              role="searchbox"
              placeholder="Search channels"
              autoComplete="off"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              onKeyDown={onSearchKeyDown}
              className="h-12 w-full rounded-[20px] border border-white/[0.11] bg-black/35 pl-11 pr-11 text-[16px] text-white outline-none placeholder:text-white/34 focus-visible:ring-2 focus-visible:ring-white/35"
            />
            {draftQuery ? (
              <button
                type="button"
                onClick={() => clearSearch()}
                className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-2xl text-white/55 outline-none active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
                aria-label="Clear search"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </label>

          <div className="tv-row-scroll mt-3 flex gap-2 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => {
                setGroupFilter(null);
                setLanguageFilter(null);
              }}
              className={cn(
                "zen-pressable min-h-10 shrink-0 rounded-2xl px-4 text-[13px] font-semibold outline-none",
                "transition-[background-color,color,transform,box-shadow] duration-200 ease-out",
                !groupFilter && !languageFilter
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "border border-white/[0.1] bg-white/[0.06] text-white/70 hover:bg-white/[0.1]",
              )}
            >
              All
            </button>
            {groupOptions.map(([group, count]) => (
              <button
                key={group}
                type="button"
                onClick={() => {
                  setGroupFilter((current) => (current === group ? null : group));
                  setLanguageFilter(null);
                }}
                className={cn(
                  "zen-pressable min-h-10 shrink-0 rounded-2xl px-4 text-[13px] font-semibold outline-none",
                  "transition-[background-color,color,transform,box-shadow] duration-200 ease-out",
                  groupFilter === group
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "border border-white/[0.1] bg-white/[0.06] text-white/70 hover:bg-white/[0.1]",
                )}
              >
                {group} <span className="opacity-55">{count}</span>
              </button>
            ))}
            {languageOptions.map((language) => (
              <button
                key={language.key}
                type="button"
                onClick={() => {
                  setLanguageFilter((current) =>
                    current === language.key ? null : language.key,
                  );
                  setGroupFilter(null);
                }}
                className={cn(
                  "zen-pressable min-h-10 shrink-0 rounded-2xl px-4 text-[13px] font-semibold outline-none",
                  "transition-[background-color,color,transform,box-shadow] duration-200 ease-out",
                  languageFilter === language.key
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "border border-white/[0.1] bg-white/[0.06] text-white/70 hover:bg-white/[0.1]",
                )}
              >
                {language.label} <span className="opacity-55">{language.count}</span>
              </button>
            ))}
          </div>
        </ZenedeGlass>
      </section>

      <LibraryResultsShell busy={resultsBusy} label={isSearchPending ? "Searching…" : "Updating results…"}>
      <section className="mt-5 px-4" aria-live="polite">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-semibold text-white">
              {filteredCount.toLocaleString()}{" "}
              {contentTab === "movie"
                ? "movies"
                : contentTab === "series"
                  ? "shows"
                  : contentTab === "live"
                    ? "live channels"
                    : "channels"}
            </h2>
            <p className="mt-1 text-[13px] text-white/42">
              {activeFilters ? "Filtered results" : "Full catalog"}
            </p>
          </div>
          {activeFilters ? (
            <button
              type="button"
              onClick={() => {
                clearSearch();
                setGroupFilter(null);
                setLanguageFilter(null);
              }}
              className="min-h-10 rounded-2xl border border-white/[0.1] bg-white/[0.06] px-4 text-[13px] font-semibold text-white/72 outline-none transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-white/[0.1] active:scale-[0.99] motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Reset
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 zen-stagger-row">
          {visible.map((channel, index) => (
            <MobileChannelCard
              key={`${channel.url}-${index}`}
              channel={channel}
              healthScore={getScoreForChannel(channel)}
              onSelect={openChannel}
              compact
            />
          ))}
        </div>

        {!resultsBusy && visible.length === 0 ? (
          <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.04] p-5 text-[14px] leading-relaxed text-white/48">
            {contentTab === "movie"
              ? "No on-demand movies found. Re-import your Xtream account in Settings — Movies are VOD files, not live movie channels."
              : contentTab === "series"
                ? "No shows found. Re-import your Xtream account in Settings."
                : "No channels match those filters."}
          </div>
        ) : null}

        {hasMore ? (
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + PAGE_STEP)}
            className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-white text-[15px] font-semibold text-zinc-950 outline-none transition-[transform,box-shadow] duration-200 ease-out hover:shadow-lg hover:shadow-black/20 active:scale-[0.99] motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Load more
          </button>
        ) : null}
      </section>
      </LibraryResultsShell>

      {navError && <NavErrorBanner message={navError} onDismiss={clearNavError} />}
    </main>
  );
}
