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
import { Heart, Radio, Search, X } from "lucide-react";

import { MobileChannelCard } from "@/components/mobile/mobile-channel-card";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { Card } from "@appica/ui-react/card";
import { Button, buttonVariants } from "@appica/ui-react/button";
import {
  listFavorites,
  subscribeFavorites,
} from "@/lib/favorites/favorites-store";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import { useEnrichedFavoritesState } from "@/features/iptv/use-enriched-favorites";
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
    <main className="bg-background min-h-screen pb-28 pt-[5.35rem] text-foreground">
      <section className="px-4">
        <div
          className={cn(
            "relative overflow-hidden rounded-lg border border-border bg-background-muted px-4 py-3 ring-1 ring-border",
            "backdrop-blur-xl transition-[border-color,box-shadow] duration-300 ease-out",
            "hover:border-border hover:shadow-lg",
            "motion-safe:animate-fav-hero-in motion-reduce:animate-none motion-reduce:opacity-100",
          )}
        >
          <div
            className="pointer-events-none absolute inset-0 bg-background-subtle"
            aria-hidden
          />
          <div className="relative flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning bg-warning-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-warning-strong">
              <Heart className="size-2.5 fill-current text-warning-strong" aria-hidden />
              Saved
            </span>
            <h1 className="min-w-0 text-[1.45rem] font-semibold leading-none tracking-[-0.055em] text-foreground-intense sm:text-[1.55rem]">
              Favorites
            </h1>
            {enriched.length > 0 ? (
              <>
                <span
                  className="hidden h-3 w-px shrink-0 bg-background-muted sm:block"
                  aria-hidden
                />
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-0.5 ring-1 ring-border">
                    <span className="tabular-nums text-[12px] font-semibold text-foreground-intense">
                      {enriched.length.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-medium text-foreground-intense">
                      channels
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-0.5 ring-1 ring-border">
                    <span className="tabular-nums text-[12px] font-semibold text-foreground-intense">
                      {groupOptions.length.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-medium text-foreground-intense">
                      groups
                    </span>
                  </span>
                </div>
              </>
            ) : null}
          </div>
          <p className="relative mt-1.5 text-[11.5px] leading-snug text-foreground-intense">
            Search and sort — your grid starts below.
          </p>
          {enriched.length > 0 ? (
            <Link
              href="/guide"
              onClick={onNavigateClick("/guide")}
              className="relative mt-3 flex min-h-11 items-center justify-center gap-2 rounded-full border border-primary bg-primary px-4 text-[13px] font-semibold text-primary-strong outline-none ring-1 ring-primary/15 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Radio className="size-4" aria-hidden />
              Open TV guide
            </Link>
          ) : null}
        </div>
      </section>

      {favoritesLoading ? (
        <section className="mt-5 px-4" aria-live="polite">
          <div className="rounded-lg border border-border bg-background-muted p-5 text-center text-[14px] text-foreground-muted">
            Loading favorites…
          </div>
        </section>
      ) : enriched.length > 0 ? (
        <>
          <section className="sticky top-[5.35rem] z-40 mt-2 px-3" aria-label="Favorite filters">
            <Card
              frame="solid"
              className="rounded-lg border-border bg-background p-2.5 shadow-lg transition-[box-shadow,transform] duration-300 ease-out"
            >
              <label className="relative block">
                <span className="sr-only">Search favorites</span>
                <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-foreground-intense" />
                <Input
                  ref={searchInputRef}
                  type="search"
                  placeholder="Search favorites"
                  value={query}
                  onValueChange={(value) => setQuery(value)}
                  onKeyDown={onSearchKeyDown}
                  className="h-12 w-full rounded-lg border border-border bg-background pl-11 pr-11 text-[16px] text-foreground-intense outline-none placeholder:text-foreground-intense focus-visible:ring-2 focus-visible:ring-primary/60"
                />
                {query ? (
                  <Button variant="ghost"
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-2xl text-foreground-intense"
                    aria-label="Clear search"
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </label>

              <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5" role="group" aria-label="Sort favorites">
                {(
                  [
                    ["recent", "Recent"],
                    ["name", "A-Z"],
                    ["group", "Group"],
                  ] as const
                ).map(([id, label]) => (
                  <Button variant="ghost"
                    key={id}
                    type="button"
                    aria-pressed={sort === id}
                    onClick={() => setSort(id)}
                    className={cn(
                      "min-h-10 shrink-0 rounded-2xl px-4 text-[13px] font-semibold outline-none transition-[transform,background-color,color,box-shadow] duration-200 ease-out",
                      "active:scale-[0.98]",
                        sort === id
                          ? "bg-primary text-primary-foreground shadow-sm"
                        : "border border-border bg-background-muted text-foreground-intense hover:bg-background-muted hover:text-foreground-intense",
                    )}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {groupOptions.length > 0 ? (
                <Select
                  value={groupFilter ?? ""}
                  onValueChange={(value) =>setGroupFilter(value ? String(value) : null)}
                  aria-label="Category"
                >
<SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="">All categories</SelectItem>
                  {groupOptions.map(([group, count]) => (
                    <SelectItem key={group} value={group}>
                      {group} ({count.toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent></Select>
              ) : null}
            </Card>
          </section>

          <section className="mt-3 px-4" aria-live="polite">
            <div className="mb-2.5 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight text-foreground-intense">
                  {filtered.length.toLocaleString()}{" "}
                  <span className="font-medium text-foreground-intense">in view</span>
                </h2>
                <p className="mt-0.5 text-[11px] text-foreground-intense">
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
                  size="sm"
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
              <div className="rounded-lg border border-border bg-background-muted p-5 text-[14px] leading-relaxed text-foreground-intense">
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
          <div className="rounded-lg border border-border bg-background-muted p-5">
            <h2 className="text-[20px] font-semibold text-foreground-intense">
              No favorites yet
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-foreground-intense">
              Tap the star on channels in Home, Library, or Watch. They will
              appear here for fast touch access.
            </p>
            <Link
              href="/library"
              onClick={onNavigateClick("/library")}
              className={buttonVariants({ variant: "secondary", size: "lg", className: "mt-5 w-full" })}
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
