"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@appica/ui-react/select";

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
import { Card } from "@appica/ui-react/card";
import { Button, buttonVariants } from "@appica/ui-react/button";
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
  SlidersHorizontal,
  Star,
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

  return (
    <div className="bg-background min-h-screen text-foreground">
      <main className={cn("pb-28", TV_BROWSE_TOP_PAD_CLASS)}>
        <div
          className={cn(
            "sticky z-30 border-b border-border transition-[background-color,backdrop-filter] duration-300",
            TV_BROWSE_STICKY_TOP_CLASS,
            "bg-background-subtle backdrop-blur-xl backdrop-saturate-150",
          )}
        >
          <div className={cn("py-3.5 sm:py-4", FAV_PAGE_GUTTER)}>
            <Card
              frame="glass"
              className={cn(
                "shadow-lg",
                "ring-1 ring-border",
                "transition-[box-shadow,transform] duration-300 ease-out",
              )}
            >
              <div className="flex flex-col gap-3.5 px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground-muted">
                      <Star className="size-4 fill-current text-warning-strong" aria-hidden />
                      Saved
                    </div>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground-intense sm:text-3xl">
                      Favorites
                    </h1>
                    <p className="mt-1 text-sm text-foreground-muted">Search, sort, and open saved channels.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border bg-background-muted px-3 py-1.5 text-sm text-foreground-muted">
                      {favCount.toLocaleString()} saved
                    </span>
                    <span className="rounded-full border border-border bg-background-muted px-3 py-1.5 text-sm text-foreground-muted">
                      {groupOptions.length.toLocaleString()} groups
                    </span>
                    <span className="rounded-full border border-border bg-background-muted px-3 py-1.5 text-sm text-foreground-muted">
                      {filtered.length.toLocaleString()} shown
                    </span>
                    <Link
                      href="/guide"
                      onClick={onNavigateClick("/guide")}
                      className={buttonVariants({ variant: "secondary", size: "md" })}
                    >
                      Open TV guide
                    </Link>
                  </div>
                </div>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:gap-5">
                  <label className="relative flex min-h-[52px] flex-1 items-center">
                    <span className="sr-only">Search favorites</span>
                    <Search
                      className="pointer-events-none absolute left-4 size-[18px] text-foreground-intense"
                      aria-hidden
                    />
                    <Input
                      ref={searchInputRef}
                      type="search"
                      placeholder="Search saved channels…"
                      autoComplete="off"
                      value={query}
                      onValueChange={(value) => setQuery(value)}
                      onKeyDown={onSearchKeyDown}
                      disabled={favCount === 0}
                      className={cn(
                        "h-[52px] w-full rounded-2xl border border-border bg-background pl-12 pr-11",
                        "text-[17px] text-foreground-intense placeholder:text-foreground-intense",
                        "outline-none transition-shadow duration-200",
                        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/45",
                        favCount === 0 && "opacity-40",
                      )}
                    />
                    {query ? (
                      <Button variant="ghost"
                        type="button"
                        onClick={() => setQuery("")}
                        className={cn(
                          "absolute right-3 flex size-9 items-center justify-center rounded-xl",
                          "text-foreground-intense outline-none transition-colors hover:bg-background-muted hover:text-foreground-intense",
                          "focus-visible:ring-2 focus-visible:ring-primary",
                        )}
                        aria-label="Clear search"
                      >
                        <X className="size-[18px]" strokeWidth={2.25} />
                      </Button>
                    ) : null}
                  </label>

                  <div className="flex flex-wrap items-center gap-2 xl:shrink-0">
                    <div
                      className="flex rounded-2xl border border-border bg-background p-1"
                      role="group"
                      aria-label="Sort favorites"
                    >
                      {(
                        [
                          ["recent", "Recent"],
                          ["name", "A–Z"],
                          ["group", "Category"],
                        ] as const
                      ).map(([id, label]) => (
                        <Button variant="ghost"
                          key={id}
                          type="button"
                          onClick={() => setSort(id)}
                          disabled={favCount === 0}
                          className={cn(
                            "rounded-xl px-3.5 py-2 text-[13px] font-semibold outline-none transition-[color,background-color,transform,box-shadow] duration-200 ease-out sm:text-[14px]",
                            "enabled:active:scale-[0.98]",
                            sort === id
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-foreground-intense hover:bg-background-muted hover:text-foreground-intense disabled:opacity-35",
                          )}
                          aria-pressed={sort === id}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>

                    <div className="hidden h-8 w-px bg-background-muted sm:block" aria-hidden />

                    <div
                      className="flex rounded-2xl border border-border bg-background p-1"
                      role="group"
                      aria-label="Layout"
                    >
                      <Button variant="ghost"
                        type="button"
                        onClick={() => setView("posters")}
                        disabled={favCount === 0}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] font-semibold outline-none transition-[color,background-color,transform,box-shadow] duration-200 ease-out",
                          "enabled:active:scale-[0.98]",
                          view === "posters"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-foreground-intense hover:bg-background-muted hover:text-foreground-intense disabled:opacity-35",
                        )}
                        aria-pressed={view === "posters"}
                      >
                        <LayoutGrid className="size-4" aria-hidden />
                        Posters
                      </Button>
                      <Button variant="ghost"
                        type="button"
                        onClick={() => setView("compact")}
                        disabled={favCount === 0}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] font-semibold outline-none transition-[color,background-color,transform,box-shadow] duration-200 ease-out",
                          "enabled:active:scale-[0.98]",
                          view === "compact"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-foreground-intense hover:bg-background-muted hover:text-foreground-intense disabled:opacity-35",
                        )}
                        aria-pressed={view === "compact"}
                      >
                        <List className="size-4" aria-hidden />
                        List
                      </Button>
                    </div>

                    <div className="hidden h-8 w-px bg-background-muted lg:block" aria-hidden />

                    <p className="flex items-center gap-2 text-[14px] tabular-nums text-foreground-intense">
                      <SlidersHorizontal className="size-4 shrink-0 opacity-70" aria-hidden />
                      <span>
                        <span className="font-medium text-foreground-intense">
                          {filtered.length.toLocaleString()}
                        </span>
                        <span className="text-foreground-intense"> shown</span>
                      </span>
                    </p>
                  </div>
                </div>

                {favCount > 0 && groupOptions.length > 0 ? (
                  <label className="grid gap-1.5 border-t border-border pt-3 sm:max-w-md">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground-intense">
                      Category
                    </span>
                    <Select
                      value={groupFilter ?? ""}
                      onValueChange={(value) => setGroupFilter(value ? String(value) : null)
                      }
                    >
<SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                      <SelectItem value="">All categories</SelectItem>
                      {groupOptions.map(([name, count]) => (
                        <SelectItem key={name} value={name}>
                          {name} ({count.toLocaleString()})
                        </SelectItem>
                      ))}
                    </SelectContent></Select>
                  </label>
                ) : null}

                {activeFilters ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    <span className="text-[13px] text-foreground-intense">Active:</span>
                    {query.trim() ? (
                      <span className="rounded-full bg-background-muted px-3 py-1 text-[13px] text-foreground-intense">
                        “{query.trim().slice(0, 48)}
                        {query.trim().length > 48 ? "…" : ""}”
                      </span>
                    ) : null}
                    {groupFilter ? (
                      <span className="rounded-full bg-background-muted px-3 py-1 text-[13px] text-foreground-intense">
                        {groupFilter}
                      </span>
                    ) : null}
                    <Button variant="ghost"
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setGroupFilter(null);
                      }}
                      className="text-[13px] font-semibold text-success-strong underline-offset-4 hover:underline"
                    >
                      Clear all
                    </Button>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        </div>

        <div className={cn("mt-4 lg:mt-6", FAV_PAGE_GUTTER)}>
          {favoritesLoading ? (
            <Card frame="solid" contentProps={{ className: "py-16" }}>
              <ZendeLoadingState
                size="large"
                label="Loading favorites"
                description="Retrieving your saved channels."
              />
            </Card>
          ) : favCount === 0 ? (
            <div className="relative overflow-hidden rounded-lg border border-border bg-background px-8 py-20 text-center shadow-sm sm:px-14 sm:py-24">
              <div className="pointer-events-none absolute inset-0 opacity-[0.45]" aria-hidden>
                <div className="absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-background-subtle" />
              </div>
              <Heart
                className="relative mx-auto mb-6 size-14 text-warning-strong"
                strokeWidth={1.25}
                aria-hidden
              />
              <p className="relative text-[22px] font-semibold tracking-tight text-foreground-intense">
                No favorites yet
              </p>
              <p className="relative mx-auto mt-3 max-w-lg text-[16px] leading-relaxed text-foreground-intense">
                Browse the library or live shelves and tap the star on any channel.
                Favorites stay on this device and sync across tabs instantly.
              </p>
              <div className="relative mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/library"
                  onClick={onNavigateClick("/library")}
                  className={buttonVariants({ variant: "secondary", size: "lg" })}
                >
                  Open Library
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link
                  href="/"
                  onClick={onNavigateClick("/")}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border border-border bg-background-muted px-7 py-3 text-[15px] font-semibold text-foreground-intense",
                    "outline-none transition-colors hover:bg-background-muted focus-visible:ring-2 focus-visible:ring-primary",
                  )}
                >
                  Browse Home
                </Link>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-background-muted px-8 py-20 text-center transition-opacity duration-300">
              <Search className="mb-4 size-10 text-foreground-intense" aria-hidden />
              <p className="text-[18px] font-semibold text-foreground-intense">No matches</p>
              <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-foreground-intense">
                Try another word, switch category, or clear filters.
              </p>
              <Button
                type="button"
                onClick={() => {
                  setQuery("");
                  setGroupFilter(null);
                }}
                size="lg"
                className="mt-6"
              >
                Reset filters
              </Button>
            </div>
          ) : view === "posters" ? (
            <div className="flex flex-col gap-8 lg:gap-10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-intense">
                    Library
                  </p>
                  <h2 className="text-4xl font-semibold tracking-tight text-foreground-intense mt-1 text-[clamp(1.55rem,3vw,2.2rem)]">
                    Your channels
                  </h2>
                  <p className="mt-1 text-[14px] text-foreground-intense">
                    {filtered.length.toLocaleString()} in view
                    {activeFilters ? " · filtered" : ""}
                  </p>
                </div>
              </div>
              <div data-tv-layout="grid" className={POSTER_GRID_CLASS}>
                {visible.map((ch, i) => (
                  <div
                    key={`${ch.url}-${i}`}
                    data-tv-index={i}
                    className={cn(
                      "motion-safe:animate-fav-page-tile motion-reduce:animate-none motion-reduce:opacity-100",
                    )}
                    style={{
                      animationDelay: `${Math.min(i, 28) * 38}ms`,
                    }}
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
                  <Button
                    type="button"
                    onClick={() =>
                      setVisibleCount((n) => n + PAGE_STEP)
                    }
                    size="lg"
                  >
                    Load more ({(
                      filtered.length - visible.length
                    ).toLocaleString()}{" "}
                    left)
                  </Button>
                </div>
              ) : filtered.length > PAGE_STEP ? (
                <p className="pb-4 text-center text-[13px] text-foreground-intense">
                  Showing all {filtered.length.toLocaleString()} saved channels.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-intense">
                  Library
                </p>
                <h2 className="text-4xl font-semibold tracking-tight text-foreground-intense mt-1 text-[clamp(1.55rem,3vw,2.2rem)]">
                  Your channels
                </h2>
                <p className="mt-1 text-[14px] text-foreground-intense">
                  {filtered.length.toLocaleString()} in view
                </p>
              </div>
              <ul className="flex flex-col gap-2" aria-label="Favorites compact list">
                {visible.map((ch, i) => {
                  const parsed = parseChannelLabel(ch.name ?? "");
                  const contentType = resolveLibraryContentType(ch);
                  return (
                    <li
                      key={`${ch.url}-${i}`}
                      className={cn(
                        "motion-safe:animate-fav-page-tile motion-reduce:animate-none motion-reduce:opacity-100",
                      )}
                      style={{
                        animationDelay: `${Math.min(i, 28) * 32}ms`,
                      }}
                    >
                      <div
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-2xl border border-border",
                          "bg-background-muted p-3 ring-1 ring-border",
                          "transition-[transform,background-color,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                          "hover:border-border-strong hover:bg-background-muted hover:shadow-lg",
                          "motion-safe:hover:-translate-y-px",
                        )}
                      >
                        <Button variant="ghost"
                          type="button"
                          onClick={() => openChannel(ch)}
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-4 text-left outline-none",
                            "focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-primary",
                            "motion-safe:active:scale-[0.995]",
                          )}
                        >
                          <div
                            className={cn(
                              "relative size-[52px] shrink-0 overflow-hidden rounded-xl",
                              "bg-background ring-1 ring-border",
                            )}
                          >
                            {ch.tvgLogo ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={secureImageUrl(ch.tvgLogo, undefined, "logo")}
                                  alt=""
                                  className="size-full object-contain p-1.5"
                                  loading="lazy"
                                />
                              </>
                            ) : (
                              <div className="flex size-full items-center justify-center bg-gradient-to-br from-background-muted to-background text-[11px] font-bold text-foreground-intense">
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
                            <p className="truncate text-[16px] font-semibold text-foreground-intense">
                              {parsed.displayName || "Untitled"}
                            </p>
                            <p className="mt-0.5 truncate text-[13px] text-foreground-intense">
                              {ch.groupTitle ?? "Live"}
                            </p>
                          </div>
                          <ChannelHealthBadge
                            score={getScoreForChannel(ch)}
                            className="hidden shrink-0 sm:flex"
                          />
                          <span className="flex shrink-0 items-center gap-1 text-[14px] font-semibold text-foreground-intense group-hover:text-foreground-intense">
                            Play
                            <ChevronRight
                              className="size-4 opacity-70 transition-transform group-hover:translate-x-0.5"
                              aria-hidden
                            />
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
                  <Button
                    type="button"
                    onClick={() =>
                      setVisibleCount((n) => n + PAGE_STEP)
                    }
                    size="lg"
                  >
                    Load more
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          {filtered.length > 0 ? (
            <FavoritesEpgTimeline
              channels={filtered}
              onSelectChannel={openChannel}
              className="mt-10 lg:mt-14"
            />
          ) : null}
        </div>
      </main>
      {navError && <NavErrorBanner message={navError} onDismiss={clearNavError} />}
    </div>
  );
}
