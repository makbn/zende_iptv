"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Search, X } from "lucide-react";

import { MobileChannelCard } from "@/components/mobile/mobile-channel-card";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { useWatchNavigation } from "@/lib/navigation/use-watch-navigation";
import { cn } from "@/lib/utils";

const source = BUILTIN_PLAYLIST_SOURCES[0]!;
const PAGE_STEP = 60;

export function MobileLibraryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { openChannel, navError, clearNavError } = useWatchNavigation();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);

  useEffect(() => {
    queueMicrotask(() => setQuery(searchParams.get("q") ?? ""));
  }, [searchParams]);

  const skipInitialUrlSync = useRef(true);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (skipInitialUrlSync.current) {
        skipInitialUrlSync.current = false;
        return;
      }
      const trimmed = query.trim();
      const current =
        new URLSearchParams(window.location.search).get("q") ?? "";
      if (trimmed === current) return;
      const next = new URLSearchParams();
      if (trimmed) next.set("q", trimmed);
      const value = next.toString();
      router.replace(value ? `${pathname}?${value}` : pathname, {
        scroll: false,
      });
    }, 350);
    return () => window.clearTimeout(id);
  }, [query, pathname, router]);

  const { channels } = useCatalogBootstrap(source);
  const { getScoreForChannel } = useChannelHealthLookup(channels);

  const groupOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const channel of channels) {
      const group = channel.groupTitle?.trim() || "Other";
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 18);
  }, [channels]);

  const languageOptions = useMemo(() => {
    const byKey = new Map<string, { label: string; count: number }>();
    for (const channel of channels) {
      const raw = channel.tvgLanguage?.trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      const prev = byKey.get(key);
      if (prev) prev.count += 1;
      else byKey.set(key, { label: raw, count: 1 });
    }
    return [...byKey.entries()]
      .sort(
        (a, b) =>
          b[1].count - a[1].count ||
          a[1].label.localeCompare(b[1].label, undefined, {
            sensitivity: "base",
          }),
      )
      .slice(0, 12)
      .map(([key, value]) => ({ key, ...value }));
  }, [channels]);

  const filtered = useMemo(() => {
    let list = channels;
    if (groupFilter) {
      list = list.filter(
        (channel) => (channel.groupTitle?.trim() || "Other") === groupFilter,
      );
    }
    if (languageFilter) {
      list = list.filter(
        (channel) =>
          (channel.tvgLanguage?.trim().toLowerCase() ?? "") === languageFilter,
      );
    }
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((channel) => {
      const name = (channel.name ?? "").toLowerCase();
      const group = (channel.groupTitle ?? "").toLowerCase();
      const language = (channel.tvgLanguage ?? "").toLowerCase();
      return name.includes(needle) || group.includes(needle) || language.includes(needle);
    });
  }, [channels, groupFilter, languageFilter, query]);

  useEffect(() => {
    startTransition(() => setVisibleCount(PAGE_STEP));
  }, [query, groupFilter, languageFilter, channels.length]);

  const visible = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );
  const hasMore = filtered.length > visible.length;
  const activeFilters = Boolean(query.trim() || groupFilter || languageFilter);

  const onSearchKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setQuery("");
      searchInputRef.current?.blur();
    }
  }, []);

  return (
    <main className="min-h-screen bg-[var(--tv-page-bg)] pb-28 pt-[6.25rem] text-foreground">
      <section className="px-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">
          Library
        </p>
        <h1 className="mt-2 text-[34px] font-semibold leading-none tracking-tight text-white">
          Browse channels
        </h1>
        <p className="mt-3 max-w-[32ch] text-[15px] leading-relaxed text-white/50">
          Search, filter, and launch streams with controls sized for thumbs.
        </p>
      </section>

      <section className="sticky top-[5.35rem] z-40 mt-6 px-3" aria-label="Library filters">
        <ZenedeGlass
          variant="panelCompact"
          className="rounded-[26px] border-white/[0.1] bg-black/58 p-3 shadow-[0_18px_52px_-24px_rgba(0,0,0,0.9)]"
        >
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
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKeyDown}
              className="h-12 w-full rounded-[20px] border border-white/[0.11] bg-black/35 pl-11 pr-11 text-[16px] text-white outline-none placeholder:text-white/34 focus-visible:ring-2 focus-visible:ring-white/35"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
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
                "min-h-10 shrink-0 rounded-2xl px-4 text-[13px] font-semibold outline-none",
                !groupFilter && !languageFilter
                  ? "bg-white text-zinc-950"
                  : "border border-white/[0.1] bg-white/[0.06] text-white/70",
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
                  "min-h-10 shrink-0 rounded-2xl px-4 text-[13px] font-semibold outline-none",
                  groupFilter === group
                    ? "bg-white text-zinc-950"
                    : "border border-white/[0.1] bg-white/[0.06] text-white/70",
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
                  "min-h-10 shrink-0 rounded-2xl px-4 text-[13px] font-semibold outline-none",
                  languageFilter === language.key
                    ? "bg-white text-zinc-950"
                    : "border border-white/[0.1] bg-white/[0.06] text-white/70",
                )}
              >
                {language.label} <span className="opacity-55">{language.count}</span>
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
              {activeFilters ? "Filtered results" : "Full catalog"}
            </p>
          </div>
          {activeFilters ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setGroupFilter(null);
                setLanguageFilter(null);
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
            No channels match those filters.
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

      {navError && <NavErrorBanner message={navError} onDismiss={clearNavError} />}
    </main>
  );
}
