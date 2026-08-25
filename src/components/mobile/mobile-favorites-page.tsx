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
import { Heart, Radio, Search, X } from "lucide-react";

import { MobileChannelCard } from "@/components/mobile/mobile-channel-card";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { ZendeGlass } from "@/components/glass/zende-glass";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  listFavorites,
  subscribeFavorites,
} from "@/lib/favorites/favorites-store";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import { useEnrichedFavorites } from "@/features/iptv/use-enriched-favorites";
import { useRemoteNavigation } from "@/lib/navigation/use-remote-navigation";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import { cn } from "@/lib/utils";

const PAGE_STEP = 50;

type SortMode = "recent" | "name" | "group";

export function MobileFavoritesPage() {
  const { onNavigateClick } = useRemoteNavigation();
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
  const enriched = useEnrichedFavorites();
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
    <main className="zen-page-bg min-h-screen pb-28 pt-[5.35rem] text-foreground">
      <section className="px-4">
        <div
          className={cn(
            "relative overflow-hidden rounded-[24px] border border-white/[0.11] bg-white/[0.055] px-4 py-3 ring-1 ring-white/[0.05]",
            "backdrop-blur-xl transition-[border-color,box-shadow] duration-300 ease-out",
            "hover:border-white/[0.12] hover:shadow-[0_12px_40px_-28px_rgba(0,0,0,0.55)]",
            "motion-safe:animate-fav-hero-in motion-reduce:animate-none motion-reduce:opacity-100",
          )}
        >
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_120%_at_0%_0%,oklch(0.44_0.12_42/0.12),transparent_55%)]"
            aria-hidden
          />
          <div className="relative flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/22 bg-amber-400/[0.09] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-amber-200/88">
              <Heart className="size-2.5 fill-amber-300/90 text-amber-300" aria-hidden />
              Saved
            </span>
            <h1 className="min-w-0 text-[1.45rem] font-semibold leading-none tracking-[-0.055em] text-white sm:text-[1.55rem]">
              Favorites
            </h1>
            {enriched.length > 0 ? (
              <>
                <span
                  className="hidden h-3 w-px shrink-0 bg-white/15 sm:block"
                  aria-hidden
                />
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-black/25 px-2 py-0.5 ring-1 ring-white/[0.03]">
                    <span className="tabular-nums text-[12px] font-semibold text-white">
                      {enriched.length.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-medium text-white/42">
                      channels
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-black/25 px-2 py-0.5 ring-1 ring-white/[0.03]">
                    <span className="tabular-nums text-[12px] font-semibold text-white">
                      {groupOptions.length.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-medium text-white/42">
                      groups
                    </span>
                  </span>
                </div>
              </>
            ) : null}
          </div>
          <p className="relative mt-1.5 text-[11.5px] leading-snug text-white/42">
            Search and sort — your grid starts below.
          </p>
          {enriched.length > 0 ? (
            <Link
              href="/guide"
              onClick={onNavigateClick("/guide")}
              className="relative mt-3 flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--zen-signal)]/25 bg-[var(--zen-signal)]/10 px-4 text-[13px] font-semibold text-cyan-100/90 outline-none ring-1 ring-[var(--zen-signal)]/15 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
            >
              <Radio className="size-4" aria-hidden />
              Open TV guide
            </Link>
          ) : null}
        </div>
      </section>

      {enriched.length > 0 ? (
        <>
          <section className="sticky top-[5.35rem] z-40 mt-2 px-3" aria-label="Favorite filters">
            <ZendeGlass
              variant="panelCompact"
              className="rounded-[24px] border-white/[0.12] bg-black/62 p-2.5 shadow-[0_18px_58px_-28px_rgba(0,0,0,0.9)] transition-[box-shadow,transform] duration-300 ease-out"
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
                  className="h-12 w-full rounded-[20px] border border-white/[0.11] bg-black/35 pl-11 pr-11 text-[16px] text-white outline-none placeholder:text-white/34 focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]/60"
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

              <div className="tv-row-scroll zen-stagger-row mt-3 flex gap-2 overflow-x-auto pb-0.5" role="group" aria-label="Sort favorites">
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
                    aria-pressed={sort === id}
                    onClick={() => setSort(id)}
                    className={cn(
                      "min-h-10 shrink-0 rounded-2xl px-4 text-[13px] font-semibold outline-none transition-[transform,background-color,color,box-shadow] duration-200 ease-out",
                      "active:scale-[0.98]",
                        sort === id
                          ? "bg-[var(--zen-frost)] text-[var(--zen-void)] shadow-sm"
                        : "border border-white/[0.1] bg-white/[0.06] text-white/70 hover:bg-white/[0.1] hover:text-white/85",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {groupOptions.length > 0 ? (
                <select
                  value={groupFilter ?? ""}
                  onChange={(event) => setGroupFilter(event.target.value || null)}
                  className="mt-2 h-11 w-full rounded-[18px] border border-white/[0.11] bg-black/45 px-3 text-[14px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
                  aria-label="Category"
                >
                  <option value="">All categories</option>
                  {groupOptions.map(([group, count]) => (
                    <option key={group} value={group}>
                      {group} ({count.toLocaleString()})
                    </option>
                  ))}
                </select>
              ) : null}
            </ZendeGlass>
          </section>

          <section className="mt-3 px-4" aria-live="polite">
            <div className="mb-2.5 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight text-white">
                  {filtered.length.toLocaleString()}{" "}
                  <span className="font-medium text-white/55">in view</span>
                </h2>
                <p className="mt-0.5 text-[11px] text-white/38">
                  {activeFilters ? "Filtered from your saves" : "All saved"}
                </p>
              </div>
              {activeFilters ? (
                <Button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setGroupFilter(null);
                  }}
                  size="xs"
                >
                  Reset
                </Button>
              ) : null}
            </div>

            <div className="grid gap-2.5">
              {visible.map((channel, index) => (
                <div
                  key={channel.url}
                  className={cn(
                    "motion-safe:animate-fav-page-tile motion-reduce:animate-none motion-reduce:opacity-100",
                  )}
                  style={{
                    animationDelay: `${Math.min(index, 24) * 28}ms`,
                  }}
                >
                  <MobileChannelCard
                    channel={channel}
                    healthScore={getScoreForChannel(channel)}
                    onSelect={openChannel}
                    compact
                  />
                </div>
              ))}
            </div>

            {visible.length === 0 ? (
              <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.04] p-5 text-[14px] leading-relaxed text-white/48">
                No favorites match those filters.
              </div>
            ) : null}

            {hasMore ? (
              <Button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_STEP)}
                size="lg"
                className="mt-4 w-full"
              >
                Load more
              </Button>
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
              onClick={onNavigateClick("/library")}
              className={buttonVariants({ variant: "normal", size: "lg", className: "mt-5 w-full" })}
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
