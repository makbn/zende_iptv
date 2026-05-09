"use client";

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
import { ChannelResolutionBadge } from "@/components/tv/channel-resolution-badge";
import { FavoriteStarButton } from "@/components/tv/favorite-star-button";
import { FavoritesEpgTimeline } from "@/components/tv/favorites-epg-timeline";
import { TvChannelTile } from "@/components/tv/tv-channel-tile";
import {
  TV_BROWSE_STICKY_TOP_CLASS,
  TV_BROWSE_TOP_PAD_CLASS,
} from "@/components/tv/tv-top-bar";
import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import {
  enrichFavoriteWithCatalog,
  listFavorites,
  subscribeFavorites,
} from "@/lib/favorites/favorites-store";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ChevronRight,
  Heart,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from "lucide-react";

const source = BUILTIN_PLAYLIST_SOURCES[0]!;

const VIEW_STORAGE = "zenede.favoritesView";
const PAGE_STEP = 60;

/** Full-bleed content width — matches hero/sticky for pixel-aligned layout */
const FAV_PAGE_GUTTER =
  "mx-auto w-full max-w-[min(100%,2400px)] px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16";

type SortMode = "recent" | "name" | "group";

export function TvFavoritesPage() {
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

  const rawFavorites = useMemo(() => listFavorites(), [favEpoch]);

  const { channels: catalog } = useCatalogBootstrap(source);
  const { getScoreForChannel } = useChannelHealthLookup(catalog);

  const enriched = useMemo(() => {
    return rawFavorites.map((f) => enrichFavoriteWithCatalog(f, catalog));
  }, [rawFavorites, catalog]);

  const sorted = useMemo(() => {
    const list = enriched.slice();
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
        rawFavorites.map((f, i) => [f.url, f.addedAt]),
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
    <div className="min-h-screen bg-[var(--tv-page-bg)] text-foreground">
      <main className={cn("pb-28", TV_BROWSE_TOP_PAD_CLASS)}>
        <div className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_45%_at_30%_-15%,oklch(0.38_0.12_35),transparent_58%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_40%_at_85%_35%,oklch(0.32_0.1_285),transparent_52%)]" />
          </div>

          <header className={cn("relative pb-8 pt-10 sm:pb-10 lg:pb-12", FAV_PAGE_GUTTER)}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-amber-200/90">
                <Star className="size-3.5 fill-amber-400/90 text-amber-300" aria-hidden />
                Saved
              </span>
            </div>
            <h1 className="mt-3 max-w-[20ch] text-[clamp(1.85rem,4.2vw,2.65rem)] font-semibold tracking-tight text-white">
              Favorites
            </h1>
            <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-white/50">
              Your hand-picked channels in one place — tuned for quick launches,
              search, and browsing by category. Star channels from Library, Home,
              or while watching.
            </p>

            {favCount > 0 ? (
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 ring-1 ring-white/[0.05]">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/38">
                    Saved channels
                  </p>
                  <p className="mt-2 text-[34px] font-semibold tabular-nums tracking-tight text-white">
                    {favCount.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[13px] text-white/42">
                    Tap the star anywhere to add or remove.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 ring-1 ring-white/[0.05]">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/38">
                    Categories
                  </p>
                  <p className="mt-2 text-[34px] font-semibold tabular-nums tracking-tight text-white">
                    {groupOptions.length.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[13px] text-white/42">
                    Filter chips below mirror your catalog metadata.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 ring-1 ring-white/[0.05]">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/38">
                    Tip
                  </p>
                  <p className="mt-3 flex items-start gap-2 text-[14px] leading-snug text-white/55">
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-400/90" aria-hidden />
                    Sort by <span className="text-white/75">Recent</span> for your
                    latest picks, or <span className="text-white/75">A–Z</span> for
                    scanning long lists.
                  </p>
                </div>
              </div>
            ) : null}
          </header>
        </div>

        <div
          className={cn(
            "sticky z-30 border-b border-white/[0.06]",
            TV_BROWSE_STICKY_TOP_CLASS,
            "bg-[color-mix(in_oklab,var(--tv-page-bg)_88%,transparent)] backdrop-blur-xl backdrop-saturate-150",
          )}
        >
          <div className={cn("py-4", FAV_PAGE_GUTTER)}>
            <ZenedeGlass
              variant="panel"
              className={cn(
                "shadow-[0_20px_60px_-28px_rgba(0,0,0,0.85)]",
                "ring-1 ring-white/[0.06]",
              )}
            >
              <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 sm:py-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:gap-5">
                  <label className="relative flex min-h-[52px] flex-1 items-center">
                    <span className="sr-only">Search favorites</span>
                    <Search
                      className="pointer-events-none absolute left-4 size-[18px] text-white/35"
                      aria-hidden
                    />
                    <input
                      ref={searchInputRef}
                      type="search"
                      placeholder="Search saved channels…"
                      autoComplete="off"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={onSearchKeyDown}
                      disabled={favCount === 0}
                      className={cn(
                        "h-[52px] w-full rounded-2xl border border-white/[0.12] bg-black/35 pl-12 pr-11",
                        "text-[17px] text-white placeholder:text-white/35",
                        "outline-none transition-shadow duration-200",
                        "focus-visible:border-white/25 focus-visible:ring-2 focus-visible:ring-white/25",
                        favCount === 0 && "opacity-40",
                      )}
                    />
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className={cn(
                          "absolute right-3 flex size-9 items-center justify-center rounded-xl",
                          "text-white/50 outline-none transition-colors hover:bg-white/10 hover:text-white",
                          "focus-visible:ring-2 focus-visible:ring-white",
                        )}
                        aria-label="Clear search"
                      >
                        <X className="size-[18px]" strokeWidth={2.25} />
                      </button>
                    ) : null}
                  </label>

                  <div className="flex flex-wrap items-center gap-2 xl:shrink-0">
                    <div
                      className="flex rounded-2xl border border-white/[0.1] bg-black/25 p-1"
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
                        <button
                          key={id}
                          type="button"
                          onClick={() => setSort(id)}
                          disabled={favCount === 0}
                          className={cn(
                            "rounded-xl px-3.5 py-2 text-[13px] font-semibold outline-none transition-colors sm:text-[14px]",
                            sort === id
                              ? "bg-white text-zinc-950 shadow-sm"
                              : "text-white/55 hover:bg-white/[0.06] hover:text-white disabled:opacity-35",
                          )}
                          aria-pressed={sort === id}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="hidden h-8 w-px bg-white/[0.1] sm:block" aria-hidden />

                    <div
                      className="flex rounded-2xl border border-white/[0.1] bg-black/25 p-1"
                      role="group"
                      aria-label="Layout"
                    >
                      <button
                        type="button"
                        onClick={() => setView("posters")}
                        disabled={favCount === 0}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] font-semibold outline-none transition-colors",
                          view === "posters"
                            ? "bg-white text-zinc-950 shadow-sm"
                            : "text-white/55 hover:bg-white/[0.06] hover:text-white disabled:opacity-35",
                        )}
                        aria-pressed={view === "posters"}
                      >
                        <LayoutGrid className="size-4" aria-hidden />
                        Posters
                      </button>
                      <button
                        type="button"
                        onClick={() => setView("compact")}
                        disabled={favCount === 0}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] font-semibold outline-none transition-colors",
                          view === "compact"
                            ? "bg-white text-zinc-950 shadow-sm"
                            : "text-white/55 hover:bg-white/[0.06] hover:text-white disabled:opacity-35",
                        )}
                        aria-pressed={view === "compact"}
                      >
                        <List className="size-4" aria-hidden />
                        List
                      </button>
                    </div>

                    <div className="hidden h-8 w-px bg-white/[0.1] lg:block" aria-hidden />

                    <p className="flex items-center gap-2 text-[14px] tabular-nums text-white/45">
                      <SlidersHorizontal className="size-4 shrink-0 opacity-70" aria-hidden />
                      <span>
                        <span className="font-medium text-white/70">
                          {filtered.length.toLocaleString()}
                        </span>
                        <span className="text-white/35"> shown</span>
                      </span>
                    </p>
                  </div>
                </div>

                {favCount > 0 && groupOptions.length > 0 ? (
                  <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-4">
                    <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/35">
                      Categories
                    </p>
                    <div
                      className={cn(
                        "flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]",
                        "[&::-webkit-scrollbar]:hidden",
                      )}
                      role="tablist"
                      aria-label="Filter saved by category"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={groupFilter === null}
                        onClick={() => setGroupFilter(null)}
                        className={cn(
                          "shrink-0 rounded-full px-4 py-2 text-[14px] font-semibold outline-none transition-colors",
                          groupFilter === null
                            ? "bg-white text-zinc-950"
                            : "border border-white/[0.12] bg-white/[0.05] text-white/75 hover:bg-white/[0.09]",
                        )}
                      >
                        All
                      </button>
                      {groupOptions.map(([name, count]) => (
                        <button
                          key={name}
                          type="button"
                          role="tab"
                          aria-selected={groupFilter === name}
                          onClick={() => setGroupFilter(name)}
                          className={cn(
                            "flex max-w-[220px] shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold outline-none transition-colors",
                            groupFilter === name
                              ? "bg-white text-zinc-950"
                              : "border border-white/[0.12] bg-white/[0.05] text-white/75 hover:bg-white/[0.09]",
                          )}
                        >
                          <span className="truncate">{name}</span>
                          <span
                            className={cn(
                              "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums font-semibold",
                              groupFilter === name
                                ? "bg-zinc-950/10 text-zinc-900"
                                : "bg-white/[0.08] text-white/45",
                            )}
                          >
                            {count.toLocaleString()}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {activeFilters ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
                    <span className="text-[13px] text-white/40">Active:</span>
                    {query.trim() ? (
                      <span className="rounded-full bg-white/[0.08] px-3 py-1 text-[13px] text-white/85">
                        “{query.trim().slice(0, 48)}
                        {query.trim().length > 48 ? "…" : ""}”
                      </span>
                    ) : null}
                    {groupFilter ? (
                      <span className="rounded-full bg-white/[0.08] px-3 py-1 text-[13px] text-white/85">
                        {groupFilter}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setGroupFilter(null);
                      }}
                      className="text-[13px] font-semibold text-emerald-400/95 underline-offset-4 hover:underline"
                    >
                      Clear all
                    </button>
                  </div>
                ) : null}
              </div>
            </ZenedeGlass>
          </div>
        </div>

        <div className={cn("mt-8 lg:mt-10", FAV_PAGE_GUTTER)}>
          {favCount === 0 ? (
            <div className="relative overflow-hidden rounded-[28px] border border-white/[0.1] bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-transparent px-8 py-20 text-center ring-1 ring-white/[0.06] sm:px-14 sm:py-24">
              <div className="pointer-events-none absolute inset-0 opacity-[0.45]" aria-hidden>
                <div className="absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.42_0.14_85/0.35),transparent_68%)]" />
              </div>
              <Heart
                className="relative mx-auto mb-6 size-14 text-amber-400/75"
                strokeWidth={1.25}
                aria-hidden
              />
              <p className="relative text-[22px] font-semibold tracking-tight text-white">
                No favorites yet
              </p>
              <p className="relative mx-auto mt-3 max-w-lg text-[16px] leading-relaxed text-white/48">
                Browse the library or live shelves and tap the star on any channel.
                Favorites stay on this device and sync across tabs instantly.
              </p>
              <div className="relative mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/library"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-[15px] font-semibold text-zinc-950",
                    "outline-none transition-[transform,box-shadow] hover:scale-[1.02] hover:shadow-lg focus-visible:ring-2 focus-visible:ring-white",
                  )}
                >
                  Open Library
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link
                  href="/"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border border-white/[0.18] bg-white/[0.06] px-7 py-3 text-[15px] font-semibold text-white",
                    "outline-none transition-colors hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white",
                  )}
                >
                  Browse Home
                </Link>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-white/[0.08] bg-white/[0.03] px-8 py-20 text-center transition-opacity duration-300">
              <Search className="mb-4 size-10 text-white/25" aria-hidden />
              <p className="text-[18px] font-semibold text-white">No matches</p>
              <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-white/45">
                Try another word, switch category, or clear filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setGroupFilter(null);
                }}
                className="mt-6 rounded-full bg-white px-6 py-2.5 text-[15px] font-semibold text-zinc-950 outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-white"
              >
                Reset filters
              </button>
            </div>
          ) : view === "posters" ? (
            <div className="flex flex-col gap-8 lg:gap-10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">
                    Library
                  </p>
                  <h2 className="mt-1 text-[clamp(1.35rem,2.8vw,1.85rem)] font-semibold tracking-tight text-white">
                    Your channels
                  </h2>
                  <p className="mt-1 text-[14px] text-white/42">
                    {filtered.length.toLocaleString()} in view
                    {activeFilters ? " · filtered" : ""}
                  </p>
                </div>
              </div>
              <div
                className={cn(
                  "grid w-full gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
                  "justify-items-stretch",
                )}
              >
                {visible.map((ch, i) => (
                  <div
                    key={`${ch.url}-${i}`}
                    className={cn(
                      "motion-safe:animate-fav-page-tile motion-reduce:animate-none motion-reduce:opacity-100",
                      "flex justify-center sm:justify-start",
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
                      className="w-full max-w-[320px] sm:max-w-none"
                    />
                  </div>
                ))}
              </div>
              {hasMore ? (
                <div className="flex justify-center pb-4">
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCount((n) => n + PAGE_STEP)
                    }
                    className="rounded-full border border-white/[0.14] bg-white/[0.06] px-8 py-3 text-[15px] font-semibold text-white outline-none transition-colors hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white"
                  >
                    Load more ({(
                      filtered.length - visible.length
                    ).toLocaleString()}{" "}
                    left)
                  </button>
                </div>
              ) : filtered.length > PAGE_STEP ? (
                <p className="pb-4 text-center text-[13px] text-white/35">
                  Showing all {filtered.length.toLocaleString()} saved channels.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">
                  Library
                </p>
                <h2 className="mt-1 text-[clamp(1.35rem,2.8vw,1.85rem)] font-semibold tracking-tight text-white">
                  Your channels
                </h2>
                <p className="mt-1 text-[14px] text-white/42">
                  {filtered.length.toLocaleString()} in view
                </p>
              </div>
              <ul className="flex flex-col gap-2" aria-label="Favorites compact list">
                {visible.map((ch, i) => {
                  const parsed = parseChannelLabel(ch.name ?? "");
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
                          "group flex w-full items-center gap-3 rounded-2xl border border-white/[0.08]",
                          "bg-white/[0.04] p-3 ring-1 ring-white/[0.04]",
                          "transition-[transform,background-color,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                          "hover:border-white/[0.14] hover:bg-white/[0.07] hover:shadow-lg hover:shadow-black/25",
                          "motion-safe:hover:-translate-y-px",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => openChannel(ch)}
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-4 text-left outline-none",
                            "focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-white",
                            "motion-safe:active:scale-[0.995]",
                          )}
                        >
                          <div
                            className={cn(
                              "relative size-[52px] shrink-0 overflow-hidden rounded-xl",
                              "bg-zinc-800 ring-1 ring-white/[0.08]",
                            )}
                          >
                            {ch.tvgLogo ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={ch.tvgLogo}
                                  alt=""
                                  className="size-full object-contain p-1.5"
                                  loading="lazy"
                                />
                              </>
                            ) : (
                              <div className="flex size-full items-center justify-center bg-gradient-to-br from-white/10 to-black/40 text-[11px] font-bold text-white/50">
                                {(parsed.displayName ?? "?").slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            {parsed.resolutionLabel ? (
                              <div className="absolute right-0.5 top-0.5 z-[1]">
                                <ChannelResolutionBadge
                                  label={parsed.resolutionLabel}
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
                              {ch.groupTitle ?? "Live"}
                            </p>
                          </div>
                          <ChannelHealthBadge
                            score={getScoreForChannel(ch)}
                            className="hidden shrink-0 sm:flex"
                          />
                          <span className="flex shrink-0 items-center gap-1 text-[14px] font-semibold text-white/55 group-hover:text-white">
                            Play
                            <ChevronRight
                              className="size-4 opacity-70 transition-transform group-hover:translate-x-0.5"
                              aria-hidden
                            />
                          </span>
                        </button>
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
                    onClick={() =>
                      setVisibleCount((n) => n + PAGE_STEP)
                    }
                    className="rounded-full border border-white/[0.14] bg-white/[0.06] px-8 py-3 text-[15px] font-semibold text-white outline-none transition-colors hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white"
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
              className="mt-10 lg:mt-14"
            />
          ) : null}
        </div>
      </main>
      {navError && <NavErrorBanner message={navError} onDismiss={clearNavError} />}
    </div>
  );
}
