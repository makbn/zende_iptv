"use client";

import Link from "next/link";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { ChannelLogo, sanitizeGroupTitle, ChannelArtBadge } from "@/components/channels/channel-presentation";
import { TvChannelTile } from "@/components/tv/tv-channel-tile";
import {
  BROWSE_CONTAINER_CLASS,
  POSTER_GRID_CLASS,
  POSTER_GRID_TILE_CLASS,
} from "@/components/layout/browse-page-shell";
import {
  TV_BROWSE_STICKY_TOP_CLASS,
  TV_BROWSE_TOP_PAD_CLASS,
} from "@/components/tv/tv-top-bar";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { useLibraryCatalog } from "@/features/iptv/use-library-catalog";
import { useLibraryContentTab } from "@/features/iptv/use-library-content-tab";
import { useLibrarySearch } from "@/features/iptv/use-library-search";
import { LibraryResultsShell } from "@/components/library/library-results-shell";
import { VirtualChannelList } from "@/components/library/virtual-channel-list";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { contentTypeFromStreamUrl, resolveLibraryContentType } from "@/lib/channels/content-type";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import { useRemoteNavigation } from "@/lib/navigation/use-remote-navigation";
import { cn } from "@/lib/utils";
import { LivePreviewDialog } from "@/components/library/live-preview-dialog";
import {
  ChevronRight,
  LayoutGrid,
  List,
  Loader2,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";


const source = BUILTIN_PLAYLIST_SOURCES[0]!;

const VIEW_STORAGE = "zende.libraryView";
const LIBRARY_STATE_STORAGE = "zende.library.state.tv";
const PAGE_STEP = 200;
const DEFAULT_LANGUAGE_FILTER = "en";

type FacetOption = { key: string; label: string; count: number };

function catalogNoun(contentTab: string): string {
  if (contentTab === "movie") return "movies";
  if (contentTab === "series") return "shows";
  if (contentTab === "live") return "live channels";
  return "signals";
}

function truncateFacet(value: string, max = 34): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function orderedLanguageOptions(options: FacetOption[]): FacetOption[] {
  const byKey = new Map(options.map((option) => [option.key, option]));
  const en = byKey.get("en") ?? { key: "en", label: "English (EN)", count: 0 };
  const priority = ["fa", "pr", "ir"];
  const prioritized = priority
    .map((key) => byKey.get(key))
    .filter((option): option is FacetOption => Boolean(option));
  const used = new Set(["en", ...priority]);
  const rest = options.filter((option) => !used.has(option.key));
  return [en, ...prioritized, ...rest];
}

export function TvLibraryPage() {
  const { onNavigateClick } = useRemoteNavigation();
  const { openChannel, navError, clearNavError } = useWatchNavigation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    draftQuery,
    setDraftQuery,
    appliedQuery,
    clearSearch,
    isSearchPending,
  } = useLibrarySearch(searchInputRef);

  const [groupFilter, setGroupFilter] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(LIBRARY_STATE_STORAGE);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { groupFilter?: string | null };
      return typeof parsed.groupFilter === "string" ? parsed.groupFilter : null;
    } catch {
      return null;
    }
  });
  /** Lowercase language key from playlist `tvg-language` / `language` when present */
  const [languageFilter, setLanguageFilter] = useState<string | null>(() => {
    if (typeof window === "undefined") return DEFAULT_LANGUAGE_FILTER;
    try {
      const raw = sessionStorage.getItem(LIBRARY_STATE_STORAGE);
      if (!raw) return DEFAULT_LANGUAGE_FILTER;
      const parsed = JSON.parse(raw) as { languageFilter?: string | null };
      if (typeof parsed.languageFilter === "string") return parsed.languageFilter;
      if (parsed.languageFilter === null) return null;
      return DEFAULT_LANGUAGE_FILTER;
    } catch {
      return DEFAULT_LANGUAGE_FILTER;
    }
  });
  const [countryFilter, setCountryFilter] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(LIBRARY_STATE_STORAGE);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { countryFilter?: string | null };
      return typeof parsed.countryFilter === "string" ? parsed.countryFilter : null;
    } catch {
      return null;
    }
  });
  const [yearFilter, setYearFilter] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(LIBRARY_STATE_STORAGE);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { yearFilter?: string | null };
      return typeof parsed.yearFilter === "string" ? parsed.yearFilter : null;
    } catch {
      return null;
    }
  });
  const { contentTab, setContentTab } = useLibraryContentTab();
  const [offset, setOffset] = useState(() => {
    if (typeof window === "undefined") return 0;
    try {
      const raw = sessionStorage.getItem(LIBRARY_STATE_STORAGE);
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as { offset?: number };
      return typeof parsed.offset === "number" && parsed.offset >= 0
        ? parsed.offset
        : 0;
    } catch {
      return 0;
    }
  });
  const [view, setView] = useState<"posters" | "compact">(() => {
    if (typeof window === "undefined") return "posters";
    const v = sessionStorage.getItem(VIEW_STORAGE);
    return v === "compact" ? "compact" : "posters";
  });
  const [previewChannel, setPreviewChannel] = useState<M3uChannel | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_STORAGE, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        LIBRARY_STATE_STORAGE,
        JSON.stringify({
          groupFilter,
          languageFilter,
          countryFilter,
          yearFilter,
          offset,
          view,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [groupFilter, languageFilter, countryFilter, yearFilter, offset, view]);

  const { channels, total, facets, loading, refreshing, error: catalogError, hasMore } = useLibraryCatalog({
    presetId: source.presetId,
    contentTab,
    query: appliedQuery,
    groupFilter,
    languageFilter,
    countryFilter,
    yearFilter,
    offset,
    pageSize: PAGE_STEP,
  });
  const resultsBusy = loading || refreshing || isSearchPending;

  const groupOptions = useMemo(
    () => facets.groups.map((g) => [g.name, g.count] as const),
    [facets.groups],
  );

  const languageOptions = useMemo(
    () => orderedLanguageOptions(facets.languages),
    [facets.languages],
  );
  const countryOptions = facets.countries;
  const yearOptions = facets.years;

  useEffect(() => {
    startTransition(() => {
      setGroupFilter(null);
      setLanguageFilter(DEFAULT_LANGUAGE_FILTER);
      setCountryFilter(null);
      setYearFilter(null);
      setOffset(0);
    });
  }, [contentTab]);

  useEffect(() => {
    startTransition(() => setOffset(0));
  }, [appliedQuery, groupFilter, languageFilter, countryFilter, yearFilter]);

  const visible = channels;
  const filteredCount = total;
  const catalogTotal = total;
  const activeFilters = Boolean(
    appliedQuery.trim() || groupFilter || languageFilter || countryFilter || yearFilter,
  );
  const spotlightChannel = visible[0] ?? null;
  const spotlightLabel = spotlightChannel
    ? parseChannelLabel(spotlightChannel.name ?? "Untitled").displayName
    : null;
  const languageLabel = languageFilter
    ? languageOptions.find((option) => option.key === languageFilter)?.label ?? languageFilter
    : null;
  const countryLabel = countryFilter
    ? countryOptions.find((option) => option.key === countryFilter)?.label ?? countryFilter
    : null;
  const yearLabel = yearFilter
    ? yearOptions.find((option) => option.key === yearFilter)?.label ?? yearFilter
    : null;
  const activeFilterCount = [
    appliedQuery.trim(),
    groupFilter,
    languageFilter,
    countryFilter,
    yearFilter,
  ].filter(Boolean).length;

  const onSearchKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      clearSearch();
      searchInputRef.current?.blur();
    }
  }, [clearSearch]);

  return (
    <div className="zen-page-bg min-h-screen text-foreground">
      <main className={cn("pb-28", TV_BROWSE_TOP_PAD_CLASS)}>
        <section className={cn(BROWSE_CONTAINER_CLASS, "pb-3 pt-4")}>
          <div className="relative grid gap-3 overflow-hidden rounded-[28px] border border-white/[0.1] bg-[linear-gradient(135deg,rgba(247,250,255,0.085),rgba(247,250,255,0.025))] p-3 shadow-[0_22px_78px_-54px_rgba(0,0,0,0.95)] ring-1 ring-white/[0.05] backdrop-blur-2xl lg:grid-cols-[auto_minmax(20rem,1fr)_auto_minmax(16rem,23rem)] lg:items-center">
            <div
              className="pointer-events-none absolute -right-16 -top-24 size-56 rounded-full bg-[var(--zen-signal)]/12 blur-3xl"
              aria-hidden
            />
            <div className="relative min-w-0">
              <div className="flex items-center gap-2">
                <span className="zen-kicker">Library</span>
                {activeFilterCount > 0 ? (
                  <span className="rounded-full border border-white/[0.1] bg-black/30 px-2.5 py-1 text-[11px] font-semibold text-white/55">
                    {activeFilterCount} tuned
                  </span>
                ) : null}
              </div>
              <h1 className="mt-1 text-[clamp(1.35rem,2vw,2rem)] font-semibold leading-none tracking-[-0.06em] text-white">
                Signal deck
              </h1>
            </div>

            <label className="relative flex min-h-[48px] items-center">
              <span className="sr-only">Search channels</span>
              <Search
                className="pointer-events-none absolute left-4 size-[18px] text-[var(--zen-signal)]/75"
                aria-hidden
              />
              <input
                ref={searchInputRef}
                id="channel-search"
                type="text"
                inputMode="search"
                enterKeyHint="search"
                role="searchbox"
                placeholder="Search channels, countries, languages…"
                autoComplete="off"
                value={draftQuery}
                onChange={(e) => setDraftQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                className={cn(
                  "h-12 w-full rounded-[20px] border border-white/[0.14] bg-black/44 pl-11 pr-11",
                  "text-[16px] font-semibold tracking-[-0.02em] text-white placeholder:text-white/32",
                  "outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]",
                  "transition-[border-color,box-shadow] duration-200",
                  "focus-visible:border-[var(--zen-signal)]/70 focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]/45",
                )}
              />
              {draftQuery ? (
                <button
                  type="button"
                  onClick={() => clearSearch()}
                  className="absolute right-2 flex size-9 items-center justify-center rounded-2xl text-white/55 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
                  aria-label="Clear search"
                >
                  <X className="size-4" strokeWidth={2.25} />
                </button>
              ) : null}
            </label>

            <div className="relative grid grid-cols-3 gap-2 lg:w-[20rem]">
              <div className="rounded-[18px] border border-white/[0.1] bg-black/28 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
                  Showing
                </p>
                <p className="mt-0.5 text-[17px] font-semibold tracking-[-0.045em] text-white">
                  {resultsBusy ? (
                    <Loader2 className="inline size-4 animate-spin" aria-hidden />
                  ) : (
                    filteredCount.toLocaleString()
                  )}
                </p>
              </div>
              <div className="rounded-[18px] border border-white/[0.1] bg-black/28 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
                  Mode
                </p>
                <p className="mt-0.5 truncate text-[17px] font-semibold capitalize tracking-[-0.045em] text-white">
                  {catalogNoun(contentTab)}
                </p>
              </div>
              <div className="rounded-[18px] border border-white/[0.1] bg-black/28 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
                  Facets
                </p>
                <p className="mt-0.5 text-[17px] font-semibold tracking-[-0.045em] text-white">
                  {languageOptions.length + countryOptions.length + yearOptions.length}
                </p>
              </div>
            </div>

            <aside className="relative min-w-0">
              {spotlightChannel && spotlightLabel ? (
                <button
                  type="button"
                  onClick={() =>
                    contentTypeFromStreamUrl(spotlightChannel.url) === "live"
                      ? setPreviewChannel(spotlightChannel)
                      : openChannel(spotlightChannel)
                  }
                  className="grid w-full grid-cols-[4.8rem_minmax(0,1fr)_auto] items-center gap-3 rounded-[22px] border border-white/[0.11] bg-black/32 p-2 text-left outline-none transition-colors hover:bg-white/[0.065] focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
                >
                  <ChannelLogo
                    name={spotlightLabel}
                    logoUrl={spotlightChannel.tvgLogo}
                    eager
                    className="rounded-[16px] border border-white/[0.08] bg-black/55"
                  />
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/36">
                      First match
                    </span>
                    <span className="mt-0.5 block truncate text-[14px] font-semibold text-white">
                      {spotlightLabel}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-white/44">
                      {sanitizeGroupTitle(spotlightChannel.groupTitle) ?? "Live"}
                    </span>
                  </span>
                  <Play className="size-4 fill-current text-white/72" aria-hidden />
                </button>
              ) : (
                <div className="flex min-h-20 items-center gap-3 rounded-[22px] border border-dashed border-white/[0.12] bg-black/24 p-3">
                  <Sparkles className="size-5 shrink-0 text-[var(--zen-signal)]/65" aria-hidden />
                  <p className="text-[13px] font-semibold text-white/58">
                    Search or relax filters to surface a match.
                  </p>
                </div>
              )}
            </aside>
          </div>
        </section>

        <div
          className={cn(
            "sticky z-30 border-y border-white/[0.07] backdrop-blur-2xl",
            TV_BROWSE_STICKY_TOP_CLASS,
            "bg-[color-mix(in_oklab,var(--tv-page-bg)_86%,transparent)]",
          )}
        >
          <div className={cn(BROWSE_CONTAINER_CLASS, "py-3")}>
            <div className="grid gap-3 rounded-[30px] border border-white/[0.1] bg-white/[0.045] p-3 ring-1 ring-white/[0.045] xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-center">
              <div className="tv-row-scroll flex gap-2 overflow-x-auto" role="tablist" aria-label="Content type">
                {([
                  ["all", "All"],
                  ["live", "Live"],
                  ["movie", "Movies"],
                  ["series", "Shows"],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={contentTab === id}
                    onClick={() => setContentTab(id)}
                    className={cn(
                      "zen-pressable min-h-12 shrink-0 rounded-[20px] px-5 text-[15px] font-semibold outline-none transition-[background-color,color,box-shadow]",
                      "focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]",
                      contentTab === id
                        ? "bg-[var(--zen-frost)] text-[var(--zen-void)] shadow-[0_16px_38px_-24px_rgba(56,217,255,0.72)]"
                        : "border border-white/[0.1] bg-black/25 text-white/68 hover:bg-white/[0.08] hover:text-white",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-4">
                <label className="min-w-0">
                  <span className="sr-only">Category</span>
                  <select
                    value={groupFilter ?? ""}
                    onChange={(event) => setGroupFilter(event.target.value || null)}
                    className="h-12 w-full rounded-[20px] border border-white/[0.11] bg-black/42 px-3 text-[14px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
                  >
                    <option value="">All categories</option>
                    {groupOptions.map(([name, count]) => (
                      <option key={name} value={name}>
                        {name} ({count.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className="sr-only">Language</span>
                  <select
                    value={languageFilter ?? ""}
                    onChange={(event) => setLanguageFilter(event.target.value || null)}
                    className="h-12 w-full rounded-[20px] border border-white/[0.11] bg-black/42 px-3 text-[14px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
                  >
                    {languageOptions.slice(0, 1).map(({ key, label, count }) => (
                      <option key={key} value={key}>
                        {label} ({count.toLocaleString()})
                      </option>
                    ))}
                    <option value="">All languages</option>
                    {languageOptions.slice(1).map(({ key, label, count }) => (
                      <option key={key} value={key}>
                        {label} ({count.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className="sr-only">Country</span>
                  <select
                    value={countryFilter ?? ""}
                    onChange={(event) => setCountryFilter(event.target.value || null)}
                    className="h-12 w-full rounded-[20px] border border-white/[0.11] bg-black/42 px-3 text-[14px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
                  >
                    <option value="">All countries</option>
                    {countryOptions.map(({ key, label, count }) => (
                      <option key={key} value={key}>
                        {label} ({count.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className="sr-only">Year</span>
                  <select
                    value={yearFilter ?? ""}
                    onChange={(event) => setYearFilter(event.target.value || null)}
                    className="h-12 w-full rounded-[20px] border border-white/[0.11] bg-black/42 px-3 text-[14px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
                  >
                    <option value="">All years</option>
                    {yearOptions.map(({ key, label, count }) => (
                      <option key={key} value={key}>
                        {label} ({count.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex items-center gap-2 xl:justify-end">
                <div className="flex rounded-[20px] border border-white/[0.1] bg-black/28 p-1" role="group" aria-label="Layout">
                  <button
                    type="button"
                    onClick={() => setView("posters")}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-2 rounded-2xl px-3.5 text-[14px] font-semibold outline-none transition-colors",
                      view === "posters" ? "bg-[var(--zen-frost)] text-[var(--zen-void)]" : "text-white/56 hover:bg-white/[0.06] hover:text-white",
                    )}
                    aria-pressed={view === "posters"}
                  >
                    <LayoutGrid className="size-4" aria-hidden />
                    Posters
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("compact")}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-2 rounded-2xl px-3.5 text-[14px] font-semibold outline-none transition-colors",
                      view === "compact" ? "bg-[var(--zen-frost)] text-[var(--zen-void)]" : "text-white/56 hover:bg-white/[0.06] hover:text-white",
                    )}
                    aria-pressed={view === "compact"}
                  >
                    <List className="size-4" aria-hidden />
                    List
                  </button>
                </div>
                <p className="hidden items-center gap-2 text-[13px] tabular-nums text-white/45 2xl:flex">
                  <SlidersHorizontal className="size-4 shrink-0 opacity-70" aria-hidden />
                  {filteredCount.toLocaleString()} {catalogNoun(contentTab)}
                </p>
              </div>

              {activeFilters ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3 xl:col-span-3">
                  <span className="text-[13px] font-semibold text-white/38">Tuned to</span>
                  {appliedQuery.trim() ? (
                    <span className="rounded-full bg-[var(--zen-signal)]/12 px-3 py-1.5 text-[13px] font-semibold text-white/88">
                      “{truncateFacet(appliedQuery.trim(), 48)}”
                    </span>
                  ) : null}
                  {groupFilter ? (
                    <span className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[13px] font-semibold text-white/82">
                      {truncateFacet(groupFilter)}
                    </span>
                  ) : null}
                  {languageLabel ? (
                    <span className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[13px] font-semibold text-white/82">
                      {languageLabel}
                    </span>
                  ) : null}
                  {countryLabel ? (
                    <span className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[13px] font-semibold text-white/82">
                      {countryLabel}
                    </span>
                  ) : null}
                  {yearLabel ? (
                    <span className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[13px] font-semibold text-white/82">
                      {yearLabel}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      clearSearch();
                      setGroupFilter(null);
                      setLanguageFilter(null);
                      setCountryFilter(null);
                      setYearFilter(null);
                    }}
                    className="rounded-full border border-white/[0.12] bg-black/28 px-3 py-1.5 text-[13px] font-semibold text-white/68 outline-none hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <LibraryResultsShell
          busy={resultsBusy}
          label={isSearchPending ? "Searching…" : "Updating results…"}
          className={cn(BROWSE_CONTAINER_CLASS, "mt-4 lg:mt-5")}
        >
          {!resultsBusy && catalogTotal === 0 && contentTab === "movie" ? (
            <div className="rounded-3xl border border-dashed border-white/[0.12] bg-white/[0.03] px-8 py-16 text-center ring-1 ring-white/[0.04]">
              <p className="text-[18px] font-semibold text-white">No movies yet</p>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-white/48">
                Movies are on-demand files from your IPTV provider (Xtream{" "}
                <span className="font-mono text-white/55">/movie/…</span> URLs), not 24/7 live
                movie channels. Re-import your Xtream account in{" "}
                <Link
                  href="/settings"
                  onClick={onNavigateClick("/settings")}
                  className="font-medium text-white/90 underline-offset-4 hover:underline"
                >
                  Settings
                </Link>
                .
              </p>
            </div>
          ) : !resultsBusy && catalogTotal === 0 && contentTab === "series" ? (
            <div className="rounded-3xl border border-dashed border-white/[0.12] bg-white/[0.03] px-8 py-16 text-center ring-1 ring-white/[0.04]">
              <p className="text-[18px] font-semibold text-white">No shows yet</p>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-white/48">
                Shows come from your IPTV series catalog. Re-import your Xtream account in{" "}
                <Link
                  href="/settings"
                  onClick={onNavigateClick("/settings")}
                  className="font-medium text-white/90 underline-offset-4 hover:underline"
                >
                  Settings
                </Link>
                .
              </p>
            </div>
          ) : !resultsBusy && catalogTotal === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/[0.12] bg-white/[0.03] px-8 py-16 text-center ring-1 ring-white/[0.04]">
              <p className="text-[18px] font-semibold text-white">
                No channels yet
              </p>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-white/48">
                Run{" "}
                <Link
                  href="/setup"
                  onClick={onNavigateClick("/setup")}
                  className="font-medium text-white/90 underline-offset-4 hover:underline"
                >
                  Set up
                </Link>{" "}
                once, or open{" "}
                <Link
                  href="/settings"
                  onClick={onNavigateClick("/settings")}
                  className="font-medium text-white/90 underline-offset-4 hover:underline"
                >
                  Settings
                </Link>{" "}
                → Channel catalog to download channels to this device.
              </p>
            </div>
          ) : !resultsBusy && filteredCount === 0 ? (
            <div className="zen-panel flex flex-col items-center justify-center rounded-[32px] px-8 py-20 text-center">
              <Search className="mb-4 size-10 text-[var(--zen-signal)]/60" aria-hidden />
              <p className="text-[22px] font-semibold tracking-[-0.04em] text-white">
                No matches
              </p>
              <p className="zen-body-muted mt-2 max-w-sm">
                Try a shorter search, pick another category or language, or clear
                filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  clearSearch();
                  setGroupFilter(null);
                  setLanguageFilter(null);
                }}
                className="mt-6 rounded-full bg-[var(--zen-frost)] px-6 py-2.5 text-[15px] font-semibold text-[var(--zen-void)] outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
              >
                Reset filters
              </button>
            </div>
          ) : view === "posters" ? (
            <div className="flex flex-col gap-6">
              <div className={POSTER_GRID_CLASS}>
                {visible.map((ch, i) => (
                  <TvChannelTile
                    key={`${ch.url}-${i}`}
                    channel={ch}
                    fastMode
                    onSelect={(channel) =>
                      contentTypeFromStreamUrl(channel.url) === "live"
                        ? setPreviewChannel(channel)
                        : openChannel(channel)
                    }
                    onPreview={
                      contentTypeFromStreamUrl(ch.url) === "live"
                        ? (channel) => setPreviewChannel(channel)
                        : undefined
                    }
                    className={POSTER_GRID_TILE_CLASS}
                  />
                ))}
              </div>
              {hasMore ? (
                <div className="flex justify-center pb-4">
                  <button
                    type="button"
                    onClick={() =>
                      setOffset((n) => n + PAGE_STEP)
                    }
                    className="rounded-full border border-white/[0.14] bg-white/[0.06] px-8 py-3 text-[15px] font-semibold text-white outline-none transition-colors hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
                  >
                    Load more ({(filteredCount - visible.length).toLocaleString()}{" "}
                    left)
                  </button>
                </div>
              ) : filteredCount > PAGE_STEP ? (
                <p className="pb-4 text-center text-[13px] text-white/35">
                  Showing all {filteredCount.toLocaleString()} matches in this
                  view.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <VirtualChannelList
                items={visible}
                estimateSize={76}
                gap={8}
                getKey={(ch, i) => `${ch.url}-${i}`}
                renderItem={(ch) => {
                  const parsed = parseChannelLabel(ch.name ?? "");
                  const contentType = resolveLibraryContentType(ch);
                  return (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        contentTypeFromStreamUrl(ch.url) === "live"
                          ? setPreviewChannel(ch)
                          : openChannel(ch)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (contentTypeFromStreamUrl(ch.url) === "live") {
                            setPreviewChannel(ch);
                          } else {
                            openChannel(ch);
                          }
                        }
                      }}
                      className={cn(
                        "group flex w-full items-center gap-4 rounded-[22px] border border-white/[0.1]",
                        "bg-white/[0.05] p-3 text-left ring-1 ring-white/[0.045]",
                        "transition-[transform,background-color,box-shadow] duration-200",
                        "hover:border-white/[0.14] hover:bg-white/[0.07]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]",
                      )}
                    >
                      <div className="relative size-[52px] shrink-0">
                        <ChannelLogo
                          name={parsed.displayName || "?"}
                          logoUrl={ch.tvgLogo}
                          className="size-[52px] rounded-xl"
                        />
                        {parsed.yearLabel || parsed.resolutionLabel ? (
                          <div className="absolute right-0.5 top-0.5 z-[1]">
                            <ChannelArtBadge
                              parsed={parsed}
                              contentType={contentType}
                              className="origin-top-right scale-[0.82]"
                            />
                          </div>
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-semibold text-white">
                          {parsed.displayName || "Untitled"}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] text-white/45">
                          {sanitizeGroupTitle(ch.groupTitle) ?? "Live"}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 text-[14px] font-semibold text-white/55 group-hover:text-white">
                        {contentTypeFromStreamUrl(ch.url) === "live" ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPreviewChannel(ch);
                            }}
                            className="mr-2 rounded-full border border-white/[0.16] bg-black/55 px-3 py-1 text-[12px] font-semibold text-white/88 hover:bg-white/[0.1]"
                          >
                            Preview
                          </button>
                        ) : null}
                        Play
                        <ChevronRight className="size-4 opacity-70" aria-hidden />
                      </span>
                    </div>
                  );
                }}
              />
              {hasMore ? (
                <div className="flex justify-center pt-4">
                  <button
                    type="button"
                    onClick={() => setOffset((n) => n + PAGE_STEP)}
                    className="rounded-full border border-white/[0.14] bg-white/[0.06] px-8 py-3 text-[15px] font-semibold text-white outline-none transition-colors hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
                  >
                    Load more ({(filteredCount - visible.length).toLocaleString()} left)
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </LibraryResultsShell>
      </main>

      <footer className="border-t border-white/[0.06] py-10 text-center">
        <p className="text-[13px] leading-relaxed text-white/35">
          Third-party streams. You are responsible for content you access.
        </p>
      </footer>
      {catalogError && (
        <NavErrorBanner message={catalogError} onDismiss={() => {}} />
      )}
      <LivePreviewDialog
        channel={previewChannel}
        onClose={() => setPreviewChannel(null)}
      />
      {navError && <NavErrorBanner message={navError} onDismiss={clearNavError} />}
    </div>
  );
}
