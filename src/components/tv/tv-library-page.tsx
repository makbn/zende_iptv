"use client";

import Link from "next/link";
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

import { ChannelHealthBadge } from "@/components/health/channel-health-badge";
import { ChannelResolutionBadge } from "@/components/tv/channel-resolution-badge";
import { TvChannelTile } from "@/components/tv/tv-channel-tile";
import {
  TV_BROWSE_STICKY_TOP_CLASS,
  TV_BROWSE_TOP_PAD_CLASS,
} from "@/components/tv/tv-top-bar";
import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { createClientLogger } from "@/core/logging/client";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { useChannelHealthLookup } from "@/features/health/use-channel-health";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { watchHref } from "@/lib/navigation/watch-url";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

const log = createClientLogger("shell.TvLibraryPage");

const source = BUILTIN_PLAYLIST_SOURCES[0]!;

const VIEW_STORAGE = "zenede.libraryView";
const PAGE_STEP = 200;

export function TvLibraryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  /** Lowercase language key from playlist `tvg-language` / `language` when present */
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);
  const [view, setView] = useState<"posters" | "compact">(() => {
    if (typeof window === "undefined") return "posters";
    const v = sessionStorage.getItem(VIEW_STORAGE);
    return v === "compact" ? "compact" : "posters";
  });

  useEffect(() => {
    queueMicrotask(() => {
      setQuery(searchParams.get("q") ?? "");
    });
  }, [searchParams]);

  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_STORAGE, view);
    } catch {
      /* ignore */
    }
  }, [view]);

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
      const p = new URLSearchParams();
      if (trimmed) p.set("q", trimmed);
      const s = p.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    }, 450);
    return () => window.clearTimeout(id);
  }, [query, pathname, router]);

  const { channels } = useCatalogBootstrap(source);
  const { getScoreForChannel } = useChannelHealthLookup(channels);

  const groupOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of channels) {
      const g = c.groupTitle?.trim() || "Other";
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 36);
  }, [channels]);

  const languageOptions = useMemo(() => {
    const byKey = new Map<string, { label: string; count: number }>();
    for (const c of channels) {
      const raw = c.tvgLanguage?.trim();
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
      .slice(0, 32)
      .map(([key, v]) => ({ key, label: v.label, count: v.count }));
  }, [channels]);

  const filtered = useMemo(() => {
    let list = channels;
    if (groupFilter) {
      list = list.filter(
        (c) => (c.groupTitle?.trim() || "Other") === groupFilter,
      );
    }
    if (languageFilter) {
      list = list.filter(
        (c) =>
          (c.tvgLanguage?.trim().toLowerCase() ?? "") === languageFilter,
      );
    }
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      const name = (c.name ?? "").toLowerCase();
      const group = (c.groupTitle ?? "").toLowerCase();
      const lang = (c.tvgLanguage ?? "").toLowerCase();
      return name.includes(q) || group.includes(q) || lang.includes(q);
    });
  }, [channels, query, groupFilter, languageFilter]);

  useEffect(() => {
    startTransition(() => setVisibleCount(PAGE_STEP));
  }, [query, groupFilter, languageFilter, channels.length]);

  const visible = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  const hasMore = filtered.length > visible.length;
  const activeFilters = Boolean(
    query.trim() || groupFilter || languageFilter,
  );

  const openChannel = useCallback(
    (ch: M3uChannel) => {
      log.debug("Library play navigation", { name: ch.name });
      router.push(watchHref(ch));
    },
    [router],
  );

  const onSearchKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setQuery("");
      searchInputRef.current?.blur();
    }
  }, []);

  return (
    <div className="min-h-screen bg-[var(--tv-page-bg)] text-foreground">
      <main className={cn("pb-28", TV_BROWSE_TOP_PAD_CLASS)}>
        {/* Hero */}
        <div className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            aria-hidden
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,oklch(0.42_0.14_264),transparent_55%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_90%_40%,oklch(0.32_0.1_220),transparent_50%)]" />
          </div>
          <header className="relative mx-auto max-w-[1920px] px-6 pb-8 pt-10 sm:px-10 sm:pb-10 lg:px-14 lg:pb-12 xl:px-20">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Library
            </p>
            <h1 className="mt-2 max-w-[22ch] text-[clamp(1.85rem,4.2vw,2.65rem)] font-semibold tracking-tight text-white">
              Browse channels
            </h1>
            <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-white/50">
              Search the full catalog on this device, filter by category or language
              when the playlist includes it, or switch between posters and a compact
              list.
            </p>
          </header>
        </div>

        {/* Sticky toolbar */}
        <div
          className={cn(
            "sticky z-30 border-b border-white/[0.06]",
            TV_BROWSE_STICKY_TOP_CLASS,
            "bg-[color-mix(in_oklab,var(--tv-page-bg)_88%,transparent)] backdrop-blur-xl backdrop-saturate-150",
          )}
        >
          <div className="mx-auto max-w-[1920px] px-6 py-4 sm:px-10 lg:px-14 xl:px-20">
            <ZenedeGlass
              variant="panel"
              className={cn(
                "shadow-[0_20px_60px_-28px_rgba(0,0,0,0.85)]",
                "ring-1 ring-white/[0.06]",
              )}
            >
              <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 sm:py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-5">
                  <label className="relative flex min-h-[52px] flex-1 items-center">
                    <span className="sr-only">Search channels</span>
                    <Search
                      className="pointer-events-none absolute left-4 size-[18px] text-white/35"
                      aria-hidden
                    />
                    <input
                      ref={searchInputRef}
                      id="channel-search"
                      type="text"
                      inputMode="search"
                      enterKeyHint="search"
                      role="searchbox"
                      placeholder="Search name, category, or language…"
                      autoComplete="off"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={onSearchKeyDown}
                      className={cn(
                        "h-[52px] w-full rounded-2xl border border-white/[0.12] bg-black/35 pl-12 pr-11",
                        "text-[17px] text-white placeholder:text-white/35",
                        "outline-none transition-shadow duration-200",
                        "focus-visible:border-white/25 focus-visible:ring-2 focus-visible:ring-white/25",
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

                  <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
                    <div
                      className="flex rounded-2xl border border-white/[0.1] bg-black/25 p-1"
                      role="group"
                      aria-label="Layout"
                    >
                      <button
                        type="button"
                        onClick={() => setView("posters")}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] font-semibold outline-none transition-colors",
                          view === "posters"
                            ? "bg-white text-zinc-950 shadow-sm"
                            : "text-white/55 hover:bg-white/[0.06] hover:text-white",
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
                          "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] font-semibold outline-none transition-colors",
                          view === "compact"
                            ? "bg-white text-zinc-950 shadow-sm"
                            : "text-white/55 hover:bg-white/[0.06] hover:text-white",
                        )}
                        aria-pressed={view === "compact"}
                      >
                        <List className="size-4" aria-hidden />
                        List
                      </button>
                    </div>
                    <div className="hidden h-8 w-px bg-white/[0.1] sm:block" aria-hidden />
                    <p className="flex items-center gap-2 text-[14px] tabular-nums text-white/45">
                      <SlidersHorizontal className="size-4 shrink-0 opacity-70" aria-hidden />
                      <span>
                        <span className="font-medium text-white/70">
                          {filtered.length.toLocaleString()}
                        </span>
                        <span className="text-white/35"> shown</span>
                        {channels.length !== filtered.length ? (
                          <span className="text-white/35">
                            {" "}
                            · {channels.length.toLocaleString()} total
                          </span>
                        ) : null}
                      </span>
                    </p>
                  </div>
                </div>

                {channels.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/35">
                      Categories
                    </p>
                    <div
                      className={cn(
                        "flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]",
                        "[&::-webkit-scrollbar]:hidden",
                      )}
                      role="tablist"
                      aria-label="Filter by category"
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
                          onClick={() =>
                            setGroupFilter((g) => (g === name ? null : name))
                          }
                          className={cn(
                            "flex max-w-[220px] shrink-0 items-center gap-2 rounded-full py-2 pl-4 pr-3 text-left text-[14px] font-medium outline-none transition-colors",
                            groupFilter === name
                              ? "bg-white text-zinc-950"
                              : "border border-white/[0.1] bg-black/30 text-white/80 hover:bg-white/[0.07]",
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

                {channels.length > 0 && languageOptions.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/35">
                      Languages
                    </p>
                    <div
                      className={cn(
                        "flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]",
                        "[&::-webkit-scrollbar]:hidden",
                      )}
                      role="tablist"
                      aria-label="Filter by language"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={languageFilter === null}
                        onClick={() => setLanguageFilter(null)}
                        className={cn(
                          "shrink-0 rounded-full px-4 py-2 text-[14px] font-semibold outline-none transition-colors",
                          languageFilter === null
                            ? "bg-white text-zinc-950"
                            : "border border-white/[0.12] bg-white/[0.05] text-white/75 hover:bg-white/[0.09]",
                        )}
                      >
                        All
                      </button>
                      {languageOptions.map(({ key, label, count }) => (
                        <button
                          key={key}
                          type="button"
                          role="tab"
                          aria-selected={languageFilter === key}
                          onClick={() =>
                            setLanguageFilter((l) => (l === key ? null : key))
                          }
                          className={cn(
                            "flex max-w-[220px] shrink-0 items-center gap-2 rounded-full py-2 pl-4 pr-3 text-left text-[14px] font-medium outline-none transition-colors",
                            languageFilter === key
                              ? "bg-white text-zinc-950"
                              : "border border-white/[0.1] bg-black/30 text-white/80 hover:bg-white/[0.07]",
                          )}
                        >
                          <span className="truncate">{label}</span>
                          <span
                            className={cn(
                              "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums font-semibold",
                              languageFilter === key
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
                    {languageFilter ? (
                      <span className="rounded-full bg-white/[0.08] px-3 py-1 text-[13px] text-white/85">
                        {languageOptions.find((o) => o.key === languageFilter)
                          ?.label ?? languageFilter}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setGroupFilter(null);
                        setLanguageFilter(null);
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

        {/* Results */}
        <div className="mx-auto mt-8 max-w-[1920px] px-6 sm:px-10 lg:mt-10 lg:px-14 xl:px-20">
          {channels.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/[0.12] bg-white/[0.03] px-8 py-16 text-center ring-1 ring-white/[0.04]">
              <p className="text-[18px] font-semibold text-white">
                No channels yet
              </p>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-white/48">
                Run{" "}
                <Link
                  href="/setup"
                  className="font-medium text-white/90 underline-offset-4 hover:underline"
                >
                  Set up
                </Link>{" "}
                once, or open{" "}
                <Link
                  href="/settings"
                  className="font-medium text-white/90 underline-offset-4 hover:underline"
                >
                  Settings
                </Link>{" "}
                → Channel catalog to download channels to this device.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-white/[0.08] bg-white/[0.03] px-8 py-20 text-center">
              <Search className="mb-4 size-10 text-white/25" aria-hidden />
              <p className="text-[18px] font-semibold text-white">
                No matches
              </p>
              <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-white/45">
                Try a shorter search, pick another category or language, or clear
                filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setGroupFilter(null);
                  setLanguageFilter(null);
                }}
                className="mt-6 rounded-full bg-white px-6 py-2.5 text-[15px] font-semibold text-zinc-950 outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-white"
              >
                Reset filters
              </button>
            </div>
          ) : view === "posters" ? (
            <div className="flex flex-col gap-10">
              <div
                className={cn(
                  "grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
                  "justify-items-start",
                )}
              >
                {visible.map((ch, i) => (
                  <TvChannelTile
                    key={`${ch.url}-${i}`}
                    channel={ch}
                    healthScore={getScoreForChannel(ch)}
                    onSelect={openChannel}
                    className="w-full max-w-[320px] justify-self-center sm:justify-self-start"
                  />
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
                  Showing all {filtered.length.toLocaleString()} matches in this
                  view.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-2" aria-label="Channels compact list">
                {visible.map((ch, i) => {
                  const parsed = parseChannelLabel(ch.name ?? "");
                  return (
                    <li key={`${ch.url}-${i}`}>
                      <button
                        type="button"
                        onClick={() => openChannel(ch)}
                        className={cn(
                          "group flex w-full items-center gap-4 rounded-2xl border border-white/[0.08]",
                          "bg-white/[0.04] p-3 text-left ring-1 ring-white/[0.04]",
                          "transition-[transform,background-color,box-shadow] duration-200",
                          "hover:border-white/[0.14] hover:bg-white/[0.07]",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
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
                          className="shrink-0"
                        />
                        <span className="flex shrink-0 items-center gap-1 text-[14px] font-semibold text-white/55 group-hover:text-white">
                          Play
                          <ChevronRight
                            className="size-4 opacity-70 transition-transform group-hover:translate-x-0.5"
                            aria-hidden
                          />
                        </span>
                      </button>
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
                    Load more ({(
                      filtered.length - visible.length
                    ).toLocaleString()}{" "}
                    left)
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-white/[0.06] py-10 text-center">
        <p className="text-[13px] leading-relaxed text-white/35">
          Third-party streams. You are responsible for content you access.
        </p>
      </footer>
    </div>
  );
}
