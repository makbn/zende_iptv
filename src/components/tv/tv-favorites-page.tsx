"use client";

import { Input } from "@appica/ui-react/input";

import Link from "next/link";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { ChannelHealthBadge } from "@/components/health/channel-health-badge";
import { ChannelArtBadge } from "@/components/channels/channel-presentation";
import { FavoriteStarButton } from "@/components/tv/favorite-star-button";
import { FavoritesEpgTimeline } from "@/components/tv/favorites-epg-timeline";
import { StreamPageHero, StreamPageShell } from "@/components/tv/stream-page-shell";
import { TvChannelTile } from "@/components/tv/tv-channel-tile";
import {
  BROWSE_CONTAINER_CLASS,
  POSTER_GRID_TILE_CLASS,
} from "@/components/layout/browse-page-shell";
import {
  TV_BROWSE_TOP_PAD_CLASS,
} from "@/components/tv/tv-top-bar";
import { Button } from "@appica/ui-react/button";
import {
  listFavorites,
  subscribeFavorites,
} from "@/lib/favorites/favorites-store";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import { useEnrichedFavoritesState } from "@/features/iptv/use-enriched-favorites";
import { ZendeLoadingState } from "@/components/loading/zende-spinner";
import { useRemoteNavigation } from "@/lib/navigation/use-remote-navigation";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { resolveLibraryContentType } from "@/lib/channels/content-type";
import { secureImageUrl } from "@/lib/media/secure-image-url";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ChevronRight,
  Heart,
  LayoutGrid,
  List,
  Search,
  X,
} from "lucide-react";

const VIEW_STORAGE = "zende.favoritesView";
const PAGE_STEP = 60;

/** Full-bleed content width — matches hero/sticky for pixel-aligned layout */
const FAV_PAGE_GUTTER =
  BROWSE_CONTAINER_CLASS;

type SortMode = "recent" | "name" | "group";

export function TvFavoritesPage() {
  const { onNavigateClick } = useRemoteNavigation();
  const { openChannel, navError, clearNavError } = useWatchNavigation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [favEpoch, setFavEpoch] = useState(0);

  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("recent");
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);
  const [view, setView] = useState<"posters" | "compact">(() => {
    if (typeof window === "undefined") return "posters";
    const v = sessionStorage.getItem(VIEW_STORAGE);
    return v === "compact" ? "compact" : "posters";
  });

  useEffect(() => {
    return subscribeFavorites(() => setFavEpoch((n) => n + 1));
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_STORAGE, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  const rawFavorites = useMemo(() => {
    void favEpoch;
    return listFavorites();
  }, [favEpoch]);

  const { channels: enriched, loading: favoritesLoading } = useEnrichedFavoritesState();
  const { getScoreForChannel } = useChannelHealthLookup(enriched);

  const sorted = useMemo(() => {
    const byUrl = new Map(enriched.map((ch) => [ch.url, ch]));
    const list = rawFavorites.map(
      (f) => byUrl.get(f.url) ?? { url: f.url, name: f.name, duration: -1 },
    );
    if (sort === "name") {
      list.sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "", undefined, {
          sensitivity: "base",
        }),
      );
    } else if (sort === "group") {
      list.sort((a, b) => {
        const ga = a.groupTitle ?? "\uffff";
        const gb = b.groupTitle ?? "\uffff";
        const g = ga.localeCompare(gb, undefined, { sensitivity: "base" });
        if (g !== 0) return g;
        return (a.name ?? "").localeCompare(b.name ?? "", undefined, {
          sensitivity: "base",
        });
      });
    } else {
      const order = new Map(
        rawFavorites.map((f) => [f.url, f.addedAt]),
      );
      list.sort(
        (a, b) =>
          (order.get(b.url) ?? 0) - (order.get(a.url) ?? 0),
      );
    }
    return list;
  }, [enriched, rawFavorites, sort]);

  const groupOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of enriched) {
      const g = c.groupTitle?.trim() || "Other";
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 32);
  }, [enriched]);

  const filtered = useMemo(() => {
    let list = sorted;
    if (groupFilter) {
      list = list.filter(
        (c) => (c.groupTitle?.trim() || "Other") === groupFilter,
      );
    }
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      const name = (c.name ?? "").toLowerCase();
      const group = (c.groupTitle ?? "").toLowerCase();
      return name.includes(q) || group.includes(q);
    });
  }, [sorted, query, groupFilter]);

  useEffect(() => {
    startTransition(() => setVisibleCount(PAGE_STEP));
  }, [query, groupFilter, sort, favEpoch]);

  const visible = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  const hasMore = filtered.length > visible.length;
  const activeFilters = Boolean(query.trim() || groupFilter);


  const onSearchKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setQuery("");
      searchInputRef.current?.blur();
    }
  }, []);

  const favCount = enriched.length;
  const spotlight = enriched.find((ch) => ch.tvgLogo) ?? enriched[0] ?? null;
  const spotlightArt = spotlight?.tvgLogo
    ? secureImageUrl(spotlight.tvgLogo, undefined, "poster")
    : null;

  return (
    <StreamPageShell pageClassName="tv-favorites-page">
      <main className={cn("tv-browse-main pb-28", TV_BROWSE_TOP_PAD_CLASS)}>
        <StreamPageHero
          eyebrow="Favorites"
          title="Your channels"
          subtitle={
            favCount > 0
              ? `${favCount.toLocaleString()} saved · star more from Library or Home`
              : "Star live channels and shows to build a personal shelf."
          }
          artUrl={spotlightArt}
          focusProps={{
            "data-tv-skip-initial": "",
            "data-tv-nav-down": "#fav-filter-deck",
          }}
          search={
            <label className="stream-search">
              <span className="sr-only">Search favorites</span>
              <Search
                className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-white/45"
                aria-hidden
              />
              <Input
                ref={searchInputRef}
                id="fav-search"
                type="search"
                placeholder="Search saved channels…"
                autoComplete="off"
                value={query}
                onValueChange={(value) => setQuery(value)}
                onKeyDown={onSearchKeyDown}
                disabled={favCount === 0}
                data-tv-nav-input="spatial"
                data-tv-nav-down="#fav-filter-deck,#fav-results,#favorites-epg-carousel"
                className="!border-0 !bg-transparent !shadow-none focus-visible:!ring-0"
              />
              {query ? (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="size-[18px]" strokeWidth={2.25} />
                </Button>
              ) : null}
            </label>
          }
          actions={
            <Link
              href="/guide"
              onClick={onNavigateClick("/guide")}
              className="stream-cta-secondary"
            >
              Open guide
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
          chips={
            favCount > 0 ? (
              <div
                id="fav-filter-deck"
                data-tv-layout="horizontal"
                data-tv-skip-initial
                data-tv-nav-up="#fav-search"
                data-tv-nav-down="#fav-results,#favorites-epg-carousel"
                className="flex flex-wrap gap-2"
              >
                {(
                  [
                    ["recent", "Recent"],
                    ["name", "A–Z"],
                    ["group", "Category"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSort(id)}
                    className={cn("stream-chip", sort === id && "is-active")}
                    aria-pressed={sort === id}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setView("posters")}
                  className={cn("stream-chip", view === "posters" && "is-active")}
                  aria-pressed={view === "posters"}
                >
                  <LayoutGrid className="mr-1.5 size-3.5" aria-hidden />
                  Posters
                </button>
                <button
                  type="button"
                  onClick={() => setView("compact")}
                  className={cn("stream-chip", view === "compact" && "is-active")}
                  aria-pressed={view === "compact"}
                >
                  <List className="mr-1.5 size-3.5" aria-hidden />
                  List
                </button>
                {groupOptions.slice(0, 8).map(([name]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() =>
                      setGroupFilter((current) => (current === name ? null : name))
                    }
                    className={cn("stream-chip", groupFilter === name && "is-active")}
                    aria-pressed={groupFilter === name}
                  >
                    {name}
                  </button>
                ))}
                {activeFilters ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setGroupFilter(null);
                    }}
                    className="stream-chip"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            ) : null
          }
        />

        <div className={cn(FAV_PAGE_GUTTER, "mt-2")}>
          {navError ? (
            <NavErrorBanner message={navError} onDismiss={clearNavError} />
          ) : null}

          {favoritesLoading ? (
            <div className="stream-empty">
              <ZendeLoadingState
                size="large"
                label="Loading favorites"
                description="Building your personal shelf…"
              />
            </div>
          ) : favCount === 0 ? (
            <div className="stream-empty">
              <Heart className="mx-auto size-12 text-[#ff3f91]" strokeWidth={1.25} aria-hidden />
              <h2>No favorites yet</h2>
              <p>Star channels from Library or Home. They stay on this device for quick D-pad access.</p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/library"
                  onClick={onNavigateClick("/library")}
                  data-tv-initial-focus=""
                  className="stream-cta"
                >
                  Open Library
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link href="/" onClick={onNavigateClick("/")} className="stream-cta-secondary">
                  Browse Home
                </Link>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="stream-empty">
              <Search className="mx-auto size-10 text-white/40" aria-hidden />
              <h2>No matches</h2>
              <p>Try another word, switch category, or clear filters.</p>
              <button
                type="button"
                className="stream-cta mt-8"
                onClick={() => {
                  setQuery("");
                  setGroupFilter(null);
                }}
              >
                Reset filters
              </button>
            </div>
          ) : view === "posters" ? (
            <div className="flex flex-col gap-6">
              <div
                id="fav-results"
                data-tv-layout="grid"
                data-tv-nav-up="#fav-filter-deck"
                data-tv-nav-down="#favorites-epg-carousel"
                className="stream-poster-grid"
              >
                {visible.map((ch, i) => (
                  <div
                    key={`${ch.url}-${i}`}
                    data-tv-index={i}
                    className="motion-safe:animate-fav-page-tile motion-reduce:animate-none motion-reduce:opacity-100"
                    style={{ animationDelay: `${Math.min(i, 28) * 38}ms` }}
                  >
                    <TvChannelTile
                      channel={ch}
                      healthScore={getScoreForChannel(ch)}
                      onSelect={openChannel}
                      showFavoriteStar
                      className={POSTER_GRID_TILE_CLASS}
                    />
                  </div>
                ))}
              </div>
              {hasMore ? (
                <div className="flex justify-center pb-4">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((n) => n + PAGE_STEP)}
                    className="stream-cta-secondary"
                  >
                    Load more ({(filtered.length - visible.length).toLocaleString()} left)
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <ul
                id="fav-results"
                data-tv-layout="vertical"
                data-tv-nav-up="#fav-filter-deck"
                data-tv-nav-down="#favorites-epg-carousel"
                className="flex flex-col gap-2"
                aria-label="Favorites compact list"
              >
                {visible.map((ch, i) => {
                  const parsed = parseChannelLabel(ch.name ?? "");
                  const contentType = resolveLibraryContentType(ch);
                  return (
                    <li
                      key={`${ch.url}-${i}`}
                      data-tv-index={i}
                      className="motion-safe:animate-fav-page-tile motion-reduce:animate-none motion-reduce:opacity-100"
                      style={{ animationDelay: `${Math.min(i, 28) * 32}ms` }}
                    >
                      <div className="guide-channel-row !gap-3 !py-3">
                        <Button
                          variant="ghost"
                          type="button"
                          data-tv-card=""
                          onClick={() => openChannel(ch)}
                          className="flex min-h-14 min-w-0 flex-1 items-center gap-4 bg-transparent p-0 text-left text-white outline-none hover:bg-transparent"
                        >
                          <div className="relative size-[56px] shrink-0 overflow-hidden rounded-xl bg-[#141925] ring-1 ring-white/10">
                            {ch.tvgLogo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={secureImageUrl(ch.tvgLogo, undefined, "logo")}
                                alt=""
                                className="size-full object-contain p-1.5"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex size-full items-center justify-center text-[11px] font-bold text-white/50">
                                {(parsed.displayName ?? "?").slice(0, 2).toUpperCase()}
                              </div>
                            )}
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
                            <p className="truncate text-[17px] font-semibold text-white">
                              {parsed.displayName || "Untitled"}
                            </p>
                            <p className="mt-0.5 truncate text-[13px] text-white/45">
                              {ch.groupTitle ?? "Live"}
                            </p>
                          </div>
                          <ChannelHealthBadge
                            score={getScoreForChannel(ch)}
                            className="hidden shrink-0 sm:flex"
                          />
                          <span className="flex shrink-0 items-center gap-1 text-[14px] font-semibold text-white/70">
                            Play
                            <ChevronRight className="size-4 opacity-70" aria-hidden />
                          </span>
                        </Button>
                        <FavoriteStarButton channel={ch} size="md" />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {hasMore ? (
                <div className="flex justify-center pt-4">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((n) => n + PAGE_STEP)}
                    className="stream-cta-secondary"
                  >
                    Load more
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {filtered.length > 0 ? (
            <FavoritesEpgTimeline
              channels={filtered}
              onSelectChannel={openChannel}
              className="mt-10 lg:mt-12"
            />
          ) : null}
        </div>
      </main>
    </StreamPageShell>
  );
}
