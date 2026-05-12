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
import { Heart, Search, X } from "lucide-react";

import { MobileChannelCard } from "@/components/mobile/mobile-channel-card";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import {
  enrichFavoriteWithCatalog,
  listFavorites,
  subscribeFavorites,
} from "@/lib/favorites/favorites-store";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import { cn } from "@/lib/utils";

const source = BUILTIN_PLAYLIST_SOURCES[0]!;
const PAGE_STEP = 50;

type SortMode = "recent" | "name" | "group";

export function MobileFavoritesPage() {
  const { openChannel, navError, clearNavError } = useWatchNavigation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [favEpoch, setFavEpoch] = useState(0);
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("recent");
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);

  useEffect(() => subscribeFavorites(() => setFavEpoch((n) => n + 1)), []);

  void favEpoch;
  const rawFavorites = listFavorites();
  const { channels: catalog } = useCatalogBootstrap(source);
  const { getScoreForChannel } = useChannelHealthLookup(catalog);

  const enriched = useMemo(
    () => rawFavorites.map((favorite) => enrichFavoriteWithCatalog(favorite, catalog)),
    [catalog, rawFavorites],
  );

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
        const group = (a.groupTitle ?? "\uffff").localeCompare(
          b.groupTitle ?? "\uffff",
          undefined,
          { sensitivity: "base" },
        );
        return group || (a.name ?? "").localeCompare(b.name ?? "");
      });
    } else {
      const order = new Map(rawFavorites.map((favorite) => [favorite.url, favorite.addedAt]));
      list.sort((a, b) => (order.get(b.url) ?? 0) - (order.get(a.url) ?? 0));
    }
    return list;
  }, [enriched, rawFavorites, sort]);

  const groupOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const channel of enriched) {
      const group = channel.groupTitle?.trim() || "Other";
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 14);
  }, [enriched]);

  const filtered = useMemo(() => {
    let list = sorted;
    if (groupFilter) {
      list = list.filter(
        (channel) => (channel.groupTitle?.trim() || "Other") === groupFilter,
      );
    }
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((channel) => {
      const name = (channel.name ?? "").toLowerCase();
      const group = (channel.groupTitle ?? "").toLowerCase();
      return name.includes(needle) || group.includes(needle);
    });
  }, [groupFilter, query, sorted]);

  useEffect(() => {
    startTransition(() => setVisibleCount(PAGE_STEP));
  }, [favEpoch, groupFilter, query, sort]);

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

  return (
    <main className="min-h-screen bg-[var(--tv-page-bg)] pb-28 pt-[6.25rem] text-foreground">
      <section className="px-4">
        <ZenedeGlass
          variant="panel"
          className="relative overflow-hidden rounded-[32px] border-white/[0.1] bg-white/[0.05] p-5"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,oklch(0.52_0.16_40/0.34),transparent_42%)]" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-amber-200/90">
              <Heart className="size-3.5 fill-amber-300 text-amber-300" aria-hidden />
              Saved
            </span>
            <h1 className="mt-3 text-[34px] font-semibold leading-none tracking-tight text-white">
              Favorites
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-white/50">
              Your hand-picked channels, sorted and filtered for quick launches.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/[0.08] bg-black/18 p-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/38">
                  Saved
                </p>
                <p className="mt-1 text-[30px] font-semibold tabular-nums text-white">
                  {enriched.length.toLocaleString()}
                </p>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-black/18 p-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/38">
                  Groups
                </p>
                <p className="mt-1 text-[30px] font-semibold tabular-nums text-white">
                  {groupOptions.length.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </ZenedeGlass>
      </section>

      {enriched.length > 0 ? (
        <>
          <section className="sticky top-[5.35rem] z-40 mt-5 px-3" aria-label="Favorite filters">
            <ZenedeGlass
              variant="panelCompact"
              className="rounded-[26px] border-white/[0.1] bg-black/58 p-3"
            >
              <label className="relative block">
                <span className="sr-only">Search favorites</span>
                <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-white/38" />
                <input
                  ref={searchInputRef}
                  type="search"
                  placeholder="Search favorites"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onSearchKeyDown}
                  className="h-12 w-full rounded-[20px] border border-white/[0.11] bg-black/35 pl-11 pr-11 text-[16px] text-white outline-none placeholder:text-white/34 focus-visible:ring-2 focus-visible:ring-white/35"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-2xl text-white/55"
                    aria-label="Clear search"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                ) : null}
              </label>

              <div className="tv-row-scroll mt-3 flex gap-2 overflow-x-auto pb-0.5">
                {(
                  [
                    ["recent", "Recent"],
                    ["name", "A-Z"],
                    ["group", "Group"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSort(id)}
                    className={cn(
                      "min-h-10 shrink-0 rounded-2xl px-4 text-[13px] font-semibold",
                      sort === id
                        ? "bg-white text-zinc-950"
                        : "border border-white/[0.1] bg-white/[0.06] text-white/70",
                    )}
                  >
                    {label}
                  </button>
                ))}
                {groupOptions.map(([group, count]) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() =>
                      setGroupFilter((current) => (current === group ? null : group))
                    }
                    className={cn(
                      "min-h-10 shrink-0 rounded-2xl px-4 text-[13px] font-semibold",
                      groupFilter === group
                        ? "bg-white text-zinc-950"
                        : "border border-white/[0.1] bg-white/[0.06] text-white/70",
                    )}
                  >
                    {group} <span className="opacity-55">{count}</span>
                  </button>
                ))}
              </div>
            </ZenedeGlass>
          </section>

          <section className="mt-5 px-4" aria-live="polite">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-[20px] font-semibold text-white">
                  {filtered.length.toLocaleString()} channels
                </h2>
                <p className="mt-1 text-[13px] text-white/42">
                  {activeFilters ? "Filtered favorites" : "Saved channels"}
                </p>
              </div>
              {activeFilters ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setGroupFilter(null);
                  }}
                  className="min-h-10 rounded-2xl border border-white/[0.1] bg-white/[0.06] px-4 text-[13px] font-semibold text-white/72"
                >
                  Reset
                </button>
              ) : null}
            </div>

            <div className="grid gap-3">
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

            {visible.length === 0 ? (
              <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.04] p-5 text-[14px] leading-relaxed text-white/48">
                No favorites match those filters.
              </div>
            ) : null}

            {hasMore ? (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_STEP)}
                className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-white text-[15px] font-semibold text-zinc-950"
              >
                Load more
              </button>
            ) : null}
          </section>
        </>
      ) : (
        <section className="mt-5 px-4">
          <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.04] p-5">
            <h2 className="text-[20px] font-semibold text-white">
              No favorites yet
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-white/48">
              Tap the star on channels in Home, Library, or Watch. They will
              appear here for fast touch access.
            </p>
            <Link
              href="/library"
              className="mt-5 flex min-h-[52px] items-center justify-center rounded-2xl bg-white text-[15px] font-semibold text-zinc-950"
            >
              Open Library
            </Link>
          </div>
        </section>
      )}

      {navError && <NavErrorBanner message={navError} onDismiss={clearNavError} />}
    </main>
  );
}
