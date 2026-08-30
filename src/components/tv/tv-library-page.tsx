"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@appica/ui-react/select";

import { Input } from "@appica/ui-react/input";

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
} from "@/components/layout/browse-page-shell";
import {
  TV_BROWSE_STICKY_TOP_CLASS,
  TV_BROWSE_TOP_PAD_CLASS,
} from "@/components/tv/tv-top-bar";
import { useLibraryCatalog } from "@/features/iptv/use-library-catalog";
import { useLibraryContentTab } from "@/features/iptv/use-library-content-tab";
import { useLibrarySearch } from "@/features/iptv/use-library-search";
import { LibraryResultsShell } from "@/components/library/library-results-shell";
import { VirtualChannelList, VirtualChannelGrid } from "@/components/library/virtual-channel-list";
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
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { ZendeSpinner } from "@/components/loading/zende-spinner";
import { Button } from "@appica/ui-react/button";


const VIEW_STORAGE = "zende.libraryView";
const LIBRARY_STATE_STORAGE = "zende.library.state.tv";
const PAGE_STEP = 200;

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
  const priority = ["en", "multi", "ar", "fa"];
  const prioritized = priority
    .map((key) => byKey.get(key))
    .filter((option): option is FacetOption => Boolean(option));
  const used = new Set(priority);
  const rest = options.filter((option) => !used.has(option.key));
  return [...prioritized, ...rest];
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
  /** Lowercase language key from playlist `tvg-language` / `language` when present */
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
  const catalogTotal = total;
  const activeFilters = Boolean(
    appliedQuery.trim() || categoryFilter || languageFilter || countryFilter || yearFilter,
  );
  const spotlightChannel = visible[0] ?? null;
  const spotlightLabel = spotlightChannel
    ? parseChannelLabel(spotlightChannel.name ?? "Untitled").displayName
    : null;
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
    <div className="bg-background min-h-screen text-foreground">
      <main className={cn("pb-28", TV_BROWSE_TOP_PAD_CLASS)}>
        <section className={cn(BROWSE_CONTAINER_CLASS, "pb-3 pt-4")}>
          <div
            data-tv-layout="horizontal"
            data-tv-skip-initial
            className="grid gap-4 rounded-lg border border-border bg-background p-4 shadow-sm 2xl:grid-cols-[auto_minmax(24rem,1fr)_auto_minmax(20rem,28rem)] 2xl:items-center"
          >
            <div className="relative min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Library</span>
                {activeFilterCount > 0 ? (
                  <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground-intense">
                    {activeFilterCount} tuned
                  </span>
                ) : null}
              </div>
              <h1 className="mt-1 text-[clamp(1.35rem,2vw,2rem)] font-semibold leading-none tracking-[-0.06em] text-foreground-intense">
                Signal deck
              </h1>
            </div>

            <label className="relative flex min-h-[48px] items-center">
              <span className="sr-only">Search channels</span>
              <Search
                className="pointer-events-none absolute left-4 size-[18px] text-primary-strong/75"
                aria-hidden
              />
              <Input
                ref={searchInputRef}
                id="channel-search"
                type="text"
                inputMode="search"
                enterKeyHint="search"
                role="searchbox"
                placeholder="Search channels, countries, languages…"
                autoComplete="off"
                value={draftQuery}
                onValueChange={(value) => setDraftQuery(value)}
                onKeyDown={onSearchKeyDown}
                className={cn(
                  "h-12 w-full rounded-lg border border-border bg-background pl-11 pr-11",
                  "text-[16px] font-semibold tracking-[-0.02em] text-foreground-intense placeholder:text-foreground-intense",
                  "outline-none shadow-lg",
                  "transition-[border-color,box-shadow] duration-200",
                  "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/45",
                )}
              />
              {draftQuery ? (
                <Button variant="ghost"
                  type="button"
                  onClick={() => clearSearch()}
                  className="absolute right-2 flex size-9 items-center justify-center rounded-2xl text-foreground-intense outline-none transition-colors hover:bg-background-muted hover:text-foreground-intense focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Clear search"
                >
                  <X className="size-4" strokeWidth={2.25} />
                </Button>
              ) : null}
            </label>

            <div className="relative grid grid-cols-3 gap-2 lg:w-[20rem]">
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground-intense">
                  Showing
                </p>
                <p className="mt-0.5 text-[17px] font-semibold tracking-[-0.045em] text-foreground-intense">
                  {resultsBusy ? (
                    <ZendeSpinner size="tiny" label="Updating results" />
                  ) : (
                    filteredCount.toLocaleString()
                  )}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground-intense">
                  Mode
                </p>
                <p className="mt-0.5 truncate text-[17px] font-semibold capitalize tracking-[-0.045em] text-foreground-intense">
                  {catalogNoun(contentTab)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground-intense">
                  Facets
                </p>
                <p className="mt-0.5 text-[17px] font-semibold tracking-[-0.045em] text-foreground-intense">
                  {languageOptions.length + countryOptions.length + yearOptions.length}
                </p>
              </div>
            </div>

            <aside className="min-w-0">
              {spotlightChannel && spotlightLabel ? (
                <Button variant="ghost"
                  type="button"
                  onClick={() =>
                    contentTypeFromStreamUrl(spotlightChannel.url) === "live"
                      ? setPreviewChannel(spotlightChannel)
                      : openChannel(spotlightChannel)
                  }
                  size="lg"
                  className="h-auto min-h-16 w-full justify-start gap-3 overflow-hidden text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground-intense">
                      First match
                    </span>
                    <span className="mt-0.5 block truncate text-[14px] font-semibold text-foreground-intense">
                      {spotlightLabel}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-foreground-intense">
                      {sanitizeGroupTitle(spotlightChannel.groupTitle) ?? "Live"}
                    </span>
                  </span>
                  <Play className="ml-auto size-4 shrink-0" aria-hidden />
                </Button>
              ) : (
                <div className="flex min-h-20 items-center gap-3 rounded-lg border border-dashed border-border bg-background p-3">
                  <Sparkles className="size-5 shrink-0 text-primary-strong/65" aria-hidden />
                  <p className="text-[13px] font-semibold text-foreground-intense">
                    Search or relax filters to surface a match.
                  </p>
                </div>
              )}
            </aside>
          </div>
        </section>

        <div
          className={cn(
            "sticky z-30 border-y border-border backdrop-blur-2xl",
            TV_BROWSE_STICKY_TOP_CLASS,
            "bg-background-subtle",
          )}
        >
          <div className={cn(BROWSE_CONTAINER_CLASS, "py-3")}>
            <div className="grid gap-3 rounded-lg border border-border bg-background-muted p-3 ring-1 ring-border xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-center">
              <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Content type">
                {([
                  ["all", "All"],
                  ["live", "Live"],
                  ["movie", "Movies"],
                  ["series", "Shows"],
                ] as const).map(([id, label]) => (
                  <Button variant="ghost"
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={contentTab === id}
                    onClick={() => setContentTab(id)}
                    className={cn(
                      "transition-colors min-h-12 shrink-0 rounded-lg px-5 text-[15px] font-semibold outline-none transition-[background-color,color,box-shadow]",
                      "focus-visible:ring-2 focus-visible:ring-primary",
                      contentTab === id
                        ? "bg-primary text-primary-foreground shadow-lg"
                        : "border border-border bg-background text-foreground-intense hover:bg-background-muted hover:text-foreground-intense",
                    )}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              <div className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-4">
                <label className="min-w-0">
                  <span className="sr-only">Category</span>
                  <Select
                    value={categoryFilter ?? "all"}
                    onValueChange={(value) => setCategoryFilter(value === "all" ? null : String(value))}
                    size="lg"
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="all">Regular channels</SelectItem>
                    {categoryOptions.map(({ key, label, count }) => (
                      <SelectItem key={key} value={key}>
                        {label} ({count.toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent></Select>
                </label>
                <label className="min-w-0">
                  <span className="sr-only">Language</span>
                  <Select
                    value={languageFilter ?? "all"}
                    onValueChange={(value) => setLanguageFilter(value === "all" ? null : String(value))}
                    size="lg"
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="all">All languages</SelectItem>
                    {languageOptions.map(({ key, label, count }) => (
                      <SelectItem key={key} value={key}>
                        {label} ({count.toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent></Select>
                </label>
                <label className="min-w-0">
                  <span className="sr-only">Country</span>
                  <Select
                    value={countryFilter ?? "all"}
                    onValueChange={(value) => setCountryFilter(value === "all" ? null : String(value))}
                    size="lg"
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="all">All countries</SelectItem>
                    {countryOptions.map(({ key, label, count }) => (
                      <SelectItem key={key} value={key}>
                        {label} ({count.toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent></Select>
                </label>
                <label className="min-w-0">
                  <span className="sr-only">Year</span>
                  <Select
                    value={yearFilter ?? "all"}
                    onValueChange={(value) => setYearFilter(value === "all" ? null : String(value))}
                    size="lg"
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="all">All years</SelectItem>
                    {yearOptions.map(({ key, label, count }) => (
                      <SelectItem key={key} value={key}>
                        {label} ({count.toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent></Select>
                </label>
              </div>

              <div className="flex items-center gap-2 xl:justify-end">
                <div className="flex rounded-lg border border-border bg-background p-1" role="group" aria-label="Layout">
                  <Button variant="ghost"
                    type="button"
                    onClick={() => setView("posters")}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-2 rounded-2xl px-3.5 text-[14px] font-semibold outline-none transition-colors",
                      view === "posters" ? "bg-primary text-primary-foreground" : "text-foreground-intense hover:bg-background-muted hover:text-foreground-intense",
                    )}
                    aria-pressed={view === "posters"}
                  >
                    <LayoutGrid className="size-4" aria-hidden />
                    Posters
                  </Button>
                  <Button variant="ghost"
                    type="button"
                    onClick={() => setView("compact")}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-2 rounded-2xl px-3.5 text-[14px] font-semibold outline-none transition-colors",
                      view === "compact" ? "bg-primary text-primary-foreground" : "text-foreground-intense hover:bg-background-muted hover:text-foreground-intense",
                    )}
                    aria-pressed={view === "compact"}
                  >
                    <List className="size-4" aria-hidden />
                    List
                  </Button>
                </div>
                <p className="hidden items-center gap-2 text-[13px] tabular-nums text-foreground-intense 2xl:flex">
                  <SlidersHorizontal className="size-4 shrink-0 opacity-70" aria-hidden />
                  {filteredCount.toLocaleString()} {catalogNoun(contentTab)}
                </p>
              </div>

              {activeFilters ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 xl:col-span-3">
                  <span className="text-[13px] font-semibold text-foreground-intense">Tuned to</span>
                  {appliedQuery.trim() ? (
                    <span className="rounded-full bg-primary px-3 py-1.5 text-[13px] font-semibold text-foreground-intense">
                      “{truncateFacet(appliedQuery.trim(), 48)}”
                    </span>
                  ) : null}
                  {categoryLabel ? (
                    <span className="rounded-full bg-background-muted px-3 py-1.5 text-[13px] font-semibold text-foreground-intense">
                      {truncateFacet(categoryLabel)}
                    </span>
                  ) : null}
                  {languageLabel ? (
                    <span className="rounded-full bg-background-muted px-3 py-1.5 text-[13px] font-semibold text-foreground-intense">
                      {languageLabel}
                    </span>
                  ) : null}
                  {countryLabel ? (
                    <span className="rounded-full bg-background-muted px-3 py-1.5 text-[13px] font-semibold text-foreground-intense">
                      {countryLabel}
                    </span>
                  ) : null}
                  {yearLabel ? (
                    <span className="rounded-full bg-background-muted px-3 py-1.5 text-[13px] font-semibold text-foreground-intense">
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
                    size="sm"
                  >
                    Clear
                  </Button>
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
            <div className="rounded-3xl border border-dashed border-border bg-background-muted px-8 py-16 text-center ring-1 ring-border">
              <p className="text-[18px] font-semibold text-foreground-intense">No movies yet</p>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-foreground-intense">
                Movies are on-demand files from your IPTV provider (Xtream{" "}
                <span className="font-mono text-foreground-intense">/movie/…</span> URLs), not 24/7 live
                movie channels. Re-import your Xtream account in{" "}
                <Link
                  href="/settings"
                  onClick={onNavigateClick("/settings")}
                  className="font-medium text-foreground-intense underline-offset-4 hover:underline"
                >
                  Settings
                </Link>
                .
              </p>
            </div>
          ) : !resultsBusy && catalogTotal === 0 && contentTab === "series" ? (
            <div className="rounded-3xl border border-dashed border-border bg-background-muted px-8 py-16 text-center ring-1 ring-border">
              <p className="text-[18px] font-semibold text-foreground-intense">No shows yet</p>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-foreground-intense">
                Shows come from your IPTV series catalog. Re-import your Xtream account in{" "}
                <Link
                  href="/settings"
                  onClick={onNavigateClick("/settings")}
                  className="font-medium text-foreground-intense underline-offset-4 hover:underline"
                >
                  Settings
                </Link>
                .
              </p>
            </div>
          ) : !resultsBusy && catalogTotal === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-background-muted px-8 py-16 text-center ring-1 ring-border">
              <p className="text-[18px] font-semibold text-foreground-intense">
                No channels yet
              </p>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-foreground-intense">
                Run{" "}
                <Link
                  href="/setup"
                  onClick={onNavigateClick("/setup")}
                  className="font-medium text-foreground-intense underline-offset-4 hover:underline"
                >
                  Set up
                </Link>{" "}
                once, or open{" "}
                <Link
                  href="/settings"
                  onClick={onNavigateClick("/settings")}
                  className="font-medium text-foreground-intense underline-offset-4 hover:underline"
                >
                  Settings
                </Link>{" "}
                → Channel catalog to download channels to this device.
              </p>
            </div>
          ) : !resultsBusy && filteredCount === 0 ? (
            <div className="border border-border bg-background-subtle shadow-sm flex flex-col items-center justify-center rounded-lg px-8 py-20 text-center">
              <Search className="mb-4 size-10 text-primary-strong/60" aria-hidden />
              <p className="text-[22px] font-semibold tracking-[-0.04em] text-foreground-intense">
                No matches
              </p>
              <p className="text-sm text-foreground-muted mt-2 max-w-sm">
                Try a shorter search, pick another category or language, or clear
                filters.
              </p>
              <Button
                type="button"
                onClick={() => {
                  clearSearch();
                  setCategoryFilter(null);
                  setLanguageFilter(null);
                }}
                size="lg"
                className="mt-6"
              >
                Reset filters
              </Button>
            </div>
          ) : view === "posters" ? (
            <div className="flex flex-col gap-6">
              <VirtualChannelGrid
                items={visible}
                columnWidth={195}
                rowHeight={340}
                itemAspectRatio={1.5}
                itemChromeHeight={128}
                gap={16}
                getKey={(ch, i) => `${ch.url}-${i}`}
                renderItem={(ch, i) => (
                  <TvChannelTile
                    key={`${ch.url}-${i}`}
                    channel={ch}
                    className="w-full sm:w-full h-full"
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
                  />
                )}
              />
              {hasMore ? (
                <div className="flex justify-center pb-4">
                  <Button
                    type="button"
                    onClick={() =>
                      setOffset((n) => n + PAGE_STEP)
                    }
                    size="lg"
                  >
                    Load more ({(filteredCount - visible.length).toLocaleString()}{" "}
                    left)
                  </Button>
                </div>
              ) : filteredCount > PAGE_STEP ? (
                <p className="pb-4 text-center text-[13px] text-foreground-intense">
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
                        "group flex w-full items-center gap-4 rounded-lg border border-border",
                        "bg-background-muted p-3 text-left ring-1 ring-border",
                        "transition-[transform,background-color,box-shadow] duration-200",
                        "hover:border-border hover:bg-background-muted",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
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
                        <p className="truncate text-[16px] font-semibold text-foreground-intense">
                          {parsed.displayName || "Untitled"}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] text-foreground-intense">
                          {sanitizeGroupTitle(ch.groupTitle) ?? "Live"}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 text-[14px] font-semibold text-foreground-intense group-hover:text-foreground-intense">
                        {contentTypeFromStreamUrl(ch.url) === "live" ? (
                          <Button variant="ghost"
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPreviewChannel(ch);
                            }}
                            className="mr-2 rounded-full border border-border bg-background px-3 py-1 text-[12px] font-semibold text-foreground-intense hover:bg-background-muted"
                          >
                            Preview
                          </Button>
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
                  <Button
                    type="button"
                    onClick={() => setOffset((n) => n + PAGE_STEP)}
                    size="lg"
                  >
                    Load more ({(filteredCount - visible.length).toLocaleString()} left)
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </LibraryResultsShell>
      </main>

      <footer className="border-t border-border py-10 text-center">
        <p className="text-[13px] leading-relaxed text-foreground-intense">
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
