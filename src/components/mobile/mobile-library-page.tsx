"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { ZendeSpinner } from "@/components/loading/zende-spinner";
import { Button } from "@/components/ui/button";

import { MobileChannelCard } from "@/components/mobile/mobile-channel-card";
import { VirtualChannelList } from "@/components/library/virtual-channel-list";
import { LibraryResultsShell } from "@/components/library/library-results-shell";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { ZendeGlass } from "@/components/glass/zende-glass";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { useLibraryCatalog } from "@/features/iptv/use-library-catalog";
import { useLibraryContentTab } from "@/features/iptv/use-library-content-tab";
import { useLibrarySearch } from "@/features/iptv/use-library-search";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { contentTypeFromStreamUrl } from "@/lib/channels/content-type";
import { cn } from "@/lib/utils";
import { LivePreviewDialog } from "@/components/library/live-preview-dialog";

const source = BUILTIN_PLAYLIST_SOURCES[0]!;
const PAGE_STEP = 60;
const VIEW_STORAGE = "zende.mobileLibraryView";
const LIBRARY_STATE_STORAGE = "zende.library.state.mobile";

type FacetOption = { key: string; label: string; count: number };

function catalogNoun(contentTab: string): string {
  if (contentTab === "movie") return "movies";
  if (contentTab === "series") return "shows";
  if (contentTab === "live") return "live";
  return "signals";
}

function truncateFacet(value: string, max = 24): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function orderedLanguageOptions(options: FacetOption[]): FacetOption[] {
  const byKey = new Map(options.map((option) => [option.key, option]));
  const priority = ["en", "multi", "ar", "fa"];
  const prioritized = priority
    .map((key) => byKey.get(key))
    .filter((option): option is FacetOption => Boolean(option));
  const used = new Set(priority);
  const rest = options.filter((option) => !used.has(option.key));
  return [...prioritized, ...rest];
}

export function MobileLibraryPage() {
  const { openChannel, navError, clearNavError } = useWatchNavigation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    draftQuery,
    setDraftQuery,
    appliedQuery,
    clearSearch,
    isSearchPending,
  } = useLibrarySearch(searchInputRef);

  const [categoryFilter, setCategoryFilter] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(LIBRARY_STATE_STORAGE);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { categoryFilter?: string | null };
      return typeof parsed.categoryFilter === "string" ? parsed.categoryFilter : null;
    } catch {
      return null;
    }
  });
  const [languageFilter, setLanguageFilter] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(LIBRARY_STATE_STORAGE);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { languageFilter?: string | null };
      if (typeof parsed.languageFilter === "string") return parsed.languageFilter;
      return null;
    } catch {
      return null;
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
  const [catalogErrorDismissed, setCatalogErrorDismissed] = useState(false);
  const [previewChannel, setPreviewChannel] = useState<M3uChannel | null>(null);
  const [view, setView] = useState<"posters" | "compact">(() => {
    if (typeof window === "undefined") return "posters";
    const v = sessionStorage.getItem(VIEW_STORAGE);
    return v === "compact" ? "compact" : "posters";
  });

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
          categoryFilter,
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
  }, [categoryFilter, languageFilter, countryFilter, yearFilter, offset, view]);

  const { channels, total, facets, loading, refreshing, error: catalogError, hasMore } = useLibraryCatalog({
    presetId: source.presetId,
    contentTab,
    query: appliedQuery,
    groupFilter: null,
    categoryFilter,
    languageFilter,
    countryFilter,
    yearFilter,
    offset,
    pageSize: PAGE_STEP,
  });
  const resultsBusy = loading || refreshing || isSearchPending;

  const categoryOptions = facets.categories;
  const languageOptions = useMemo(
    () => orderedLanguageOptions(facets.languages),
    [facets.languages],
  );
  const countryOptions = facets.countries;
  const yearOptions = facets.years;

  useEffect(() => {
    startTransition(() => {
      setCategoryFilter(null);
      setLanguageFilter(null);
      setCountryFilter(null);
      setYearFilter(null);
      setOffset(0);
    });
  }, [contentTab]);

  useEffect(() => {
    startTransition(() => setOffset(0));
  }, [appliedQuery, categoryFilter, languageFilter, countryFilter, yearFilter]);

  const visible = channels;
  const filteredCount = total;
  const activeFilters = Boolean(
    appliedQuery.trim() || categoryFilter || languageFilter || countryFilter || yearFilter,
  );
  const categoryLabel = categoryFilter
    ? categoryOptions.find((option) => option.key === categoryFilter)?.label ?? categoryFilter
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
    categoryFilter,
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
    <main className="zen-page-bg min-h-screen pb-28 pt-[5.35rem] text-foreground">
      <section className="px-4">
        <ZendeGlass
          variant="panelCompact"
          className="relative overflow-hidden rounded-[30px] border-white/[0.12] bg-black/58 p-3 shadow-[0_22px_72px_-40px_rgba(0,0,0,0.94)]"
        >
          <div
            className="pointer-events-none absolute -right-16 -top-20 size-48 rounded-full bg-[var(--zen-signal)]/16 blur-3xl"
            aria-hidden
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="zen-kicker text-[10px]">Signal deck</p>
              <h1 className="mt-1 text-[2rem] font-semibold leading-[0.88] tracking-[-0.075em] text-white">
                Tune faster.
              </h1>
              <p className="mt-2 max-w-[32ch] text-[12px] leading-snug text-white/46">
                Search, filter, preview, then keep moving.
              </p>
            </div>
            <div className="rounded-[20px] border border-white/[0.1] bg-black/35 px-3 py-2 text-right ring-1 ring-white/[0.04]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Showing</p>
              <p className="mt-0.5 text-[20px] font-semibold tracking-[-0.055em] text-white">
                {resultsBusy ? <ZendeSpinner size="tiny" label="Updating results" /> : total.toLocaleString()}
              </p>
            </div>
          </div>

          <label className="relative mt-4 block">
            <span className="sr-only">Search channels</span>
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-[19px] -translate-y-1/2 text-[var(--zen-signal)]/72"
              aria-hidden
            />
            <input
              ref={searchInputRef}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              role="searchbox"
              placeholder="Search channels, countries…"
              autoComplete="off"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              onKeyDown={onSearchKeyDown}
              className="h-[52px] w-full rounded-[22px] border border-white/[0.12] bg-black/42 pl-11 pr-11 text-[17px] font-semibold tracking-[-0.02em] text-white outline-none placeholder:text-white/34 focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]/60"
            />
            {draftQuery ? (
              <button
                type="button"
                onClick={() => clearSearch()}
                className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-2xl text-white/55 outline-none active:bg-white/10 focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
                aria-label="Clear search"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </label>

          <div className="tv-row-scroll mt-3 flex gap-2 overflow-x-auto pb-0.5" role="tablist" aria-label="Content type">
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
                  "zen-pressable min-h-11 shrink-0 rounded-[18px] px-4 text-[13px] font-semibold outline-none",
                  "transition-[background-color,color,transform,box-shadow] duration-200 ease-out",
                  contentTab === id
                    ? "bg-[var(--zen-frost)] text-[var(--zen-void)] shadow-[0_14px_34px_-22px_rgba(56,217,255,0.65)]"
                    : "border border-white/[0.1] bg-white/[0.06] text-white/70 hover:bg-white/[0.1]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative mt-3 grid gap-2">
            <select
              value={categoryFilter ?? ""}
              onChange={(event) => setCategoryFilter(event.target.value || null)}
              className="h-12 w-full rounded-[20px] border border-white/[0.11] bg-black/45 px-3 text-[14px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
              aria-label="Category"
            >
              <option value="">All categories</option>
              {categoryOptions.map(({ key, label, count }) => (
                <option key={key} value={key}>
                  {label} ({count.toLocaleString()})
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={languageFilter ?? ""}
                onChange={(event) => setLanguageFilter(event.target.value || null)}
                className="h-12 w-full rounded-[20px] border border-white/[0.11] bg-black/45 px-3 text-[14px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
                aria-label="Language"
              >
                <option value="">All languages</option>
                {languageOptions.map((language) => (
                  <option key={language.key} value={language.key}>
                    {language.label} ({language.count.toLocaleString()})
                  </option>
                ))}
              </select>
              <select
                value={countryFilter ?? ""}
                onChange={(event) => setCountryFilter(event.target.value || null)}
                className="h-12 w-full rounded-[20px] border border-white/[0.11] bg-black/45 px-3 text-[14px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
                aria-label="Country"
              >
                <option value="">All countries</option>
                {countryOptions.map((country) => (
                  <option key={country.key} value={country.key}>
                    {country.label} ({country.count.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
            <select
              value={yearFilter ?? ""}
              onChange={(event) => setYearFilter(event.target.value || null)}
              className="h-12 w-full rounded-[20px] border border-white/[0.11] bg-black/45 px-3 text-[14px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
              aria-label="Year"
            >
              <option value="">All years</option>
              {yearOptions.map((year) => (
                <option key={year.key} value={year.key}>
                  {year.label} ({year.count.toLocaleString()})
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[18px] border border-white/[0.1] bg-black/25 px-3 py-2 text-[12px] font-semibold text-white/46">
              <SlidersHorizontal className="size-4 shrink-0 text-white/35" aria-hidden />
              <span className="truncate">
                {activeFilterCount > 0
                  ? `${activeFilterCount} tuned · ${catalogNoun(contentTab)}`
                  : `All ${catalogNoun(contentTab)}`}
              </span>
            </div>
            <div className="flex rounded-2xl border border-white/[0.1] bg-black/25 p-1">
            <button
              type="button"
              onClick={() => setView("posters")}
              className={cn(
                "zen-pressable flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-semibold outline-none",
                view === "posters" ? "bg-[var(--zen-frost)] text-[var(--zen-void)]" : "text-white/60",
              )}
              aria-pressed={view === "posters"}
            >
              <LayoutGrid className="size-3.5" aria-hidden />
              Posters
            </button>
            <button
              type="button"
              onClick={() => setView("compact")}
              className={cn(
                "zen-pressable flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-semibold outline-none",
                view === "compact" ? "bg-[var(--zen-frost)] text-[var(--zen-void)]" : "text-white/60",
              )}
              aria-pressed={view === "compact"}
            >
              <List className="size-3.5" aria-hidden />
              List
            </button>
            </div>
          </div>
          {activeFilters ? (
            <div className="tv-row-scroll mt-3 flex gap-2 overflow-x-auto border-t border-white/[0.06] pt-3">
              {appliedQuery.trim() ? (
                <span className="shrink-0 rounded-full bg-[var(--zen-signal)]/13 px-3 py-1.5 text-[12px] font-semibold text-white/86">
                  “{truncateFacet(appliedQuery.trim())}”
                </span>
              ) : null}
              {categoryLabel ? (
                <span className="shrink-0 rounded-full bg-white/[0.08] px-3 py-1.5 text-[12px] font-semibold text-white/78">
                  {truncateFacet(categoryLabel)}
                </span>
              ) : null}
              {languageLabel ? (
                <span className="shrink-0 rounded-full bg-white/[0.08] px-3 py-1.5 text-[12px] font-semibold text-white/78">
                  {truncateFacet(languageLabel)}
                </span>
              ) : null}
              {countryLabel ? (
                <span className="shrink-0 rounded-full bg-white/[0.08] px-3 py-1.5 text-[12px] font-semibold text-white/78">
                  {truncateFacet(countryLabel)}
                </span>
              ) : null}
              {yearLabel ? (
                <span className="shrink-0 rounded-full bg-white/[0.08] px-3 py-1.5 text-[12px] font-semibold text-white/78">
                  {yearLabel}
                </span>
              ) : null}
              <Button
                type="button"
                onClick={() => {
                  clearSearch();
                  setCategoryFilter(null);
                  setLanguageFilter(null);
                  setCountryFilter(null);
                  setYearFilter(null);
                }}
                size="xs"
                className="shrink-0"
              >
                Clear
              </Button>
            </div>
          ) : null}
        </ZendeGlass>
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
            <Button
              type="button"
              onClick={() => {
                clearSearch();
                setCategoryFilter(null);
                setLanguageFilter(null);
                setCountryFilter(null);
                setYearFilter(null);
              }}
              size="sm"
            >
              Reset
            </Button>
          ) : null}
        </div>

        {view === "posters" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {visible.map((channel, index) => (
              <MobileChannelCard
                key={`${channel.url}-${index}`}
                channel={channel}
                fastMode
                onSelect={(ch) =>
                  contentTypeFromStreamUrl(ch.url) === "live"
                    ? setPreviewChannel(ch)
                    : openChannel(ch)
                }
                onPreview={
                  contentTypeFromStreamUrl(channel.url) === "live"
                    ? (ch) => setPreviewChannel(ch)
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <VirtualChannelList
            items={visible}
            estimateSize={92}
            gap={12}
            className="max-h-none"
            getKey={(channel, index) => `${channel.url}-${index}`}
            renderItem={(channel) => (
              <MobileChannelCard
                channel={channel}
                fastMode
                onSelect={(ch) =>
                  contentTypeFromStreamUrl(ch.url) === "live"
                    ? setPreviewChannel(ch)
                    : openChannel(ch)
                }
                onPreview={
                  contentTypeFromStreamUrl(channel.url) === "live"
                    ? (ch) => setPreviewChannel(ch)
                    : undefined
                }
                compact
              />
            )}
          />
        )}

        {!resultsBusy && visible.length === 0 ? (
          <div className="zen-panel rounded-[26px] p-5 text-[14px] leading-relaxed text-white/58">
            {contentTab === "movie"
              ? "No on-demand movies found. Re-import your Xtream account in Settings — Movies are VOD files, not live movie channels."
              : contentTab === "series"
                ? "No shows found. Re-import your Xtream account in Settings."
                : "No channels match those filters."}
          </div>
        ) : null}

        {hasMore ? (
          <Button
            type="button"
            onClick={() => setOffset((count) => count + PAGE_STEP)}
            size="lg"
            className="mt-5 w-full"
          >
            Load more
          </Button>
        ) : null}
      </section>
      </LibraryResultsShell>

      {catalogError && !catalogErrorDismissed && (
        <NavErrorBanner
          message={catalogError}
          onDismiss={() => setCatalogErrorDismissed(true)}
        />
      )}
      <LivePreviewDialog
        channel={previewChannel}
        onClose={() => setPreviewChannel(null)}
      />
      {navError && <NavErrorBanner message={navError} onDismiss={clearNavError} />}
    </main>
  );
}
