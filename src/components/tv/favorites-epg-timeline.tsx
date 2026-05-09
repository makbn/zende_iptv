"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Radio,
  RefreshCw,
} from "lucide-react";

type Slot = {
  title: string;
  startMs: number;
  stopMs: number;
};

type ChannelPrograms = {
  current: Slot | null;
  next: Slot | null;
};

function formatClock(ms: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return "";
  }
}

function formatWindow(slot: Slot): string {
  return `${formatClock(slot.startMs)} – ${formatClock(slot.stopMs)}`;
}

const CAROUSEL_CARD_W = "min(calc(100vw - 3rem), 292px)";

const EPG_SESSION_KEY = "zenede.fav-epg.v1";

type EpgSessionPayload = {
  idsKey: string;
  programs: Record<string, ChannelPrograms>;
  fetchedAt: number;
};

function readEpgSession(idsKey: string): EpgSessionPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(EPG_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EpgSessionPayload;
    if (parsed.idsKey !== idsKey || !parsed.programs) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeEpgSession(payload: EpgSessionPayload): void {
  try {
    sessionStorage.setItem(EPG_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

function EpgCardSkeleton({ i }: { i: number }) {
  return (
    <div
      className={cn(
        "motion-safe:animate-fav-epg-card shrink-0 rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4 ring-1 ring-white/[0.04]",
        "motion-reduce:animate-none motion-reduce:opacity-100",
      )}
      style={{
        width: CAROUSEL_CARD_W,
        animationDelay: `${i * 55}ms`,
      }}
    >
      <div className="flex gap-3">
        <div className="size-11 shrink-0 animate-pulse rounded-xl bg-white/[0.08]" />
        <div className="min-w-0 flex-1 space-y-2 pt-0.5">
          <div className="h-3.5 w-3/4 animate-pulse rounded-md bg-white/[0.08]" />
          <div className="h-3 w-1/2 animate-pulse rounded-md bg-white/[0.06]" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="h-[4.5rem] animate-pulse rounded-xl bg-violet-500/10" />
        <div className="h-[4.5rem] animate-pulse rounded-xl bg-white/[0.06]" />
      </div>
    </div>
  );
}

export function FavoritesEpgTimeline({
  channels,
  onSelectChannel,
  className,
}: {
  channels: M3uChannel[];
  onSelectChannel: (ch: M3uChannel) => void;
  className?: string;
}) {
  const [programs, setPrograms] = useState<Record<string, ChannelPrograms>>(
    {},
  );
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const rows = useMemo(() => {
    const list = channels.slice();
    list.sort((a, b) => {
      const na = parseChannelLabel(a.name ?? "").displayName ?? "";
      const nb = parseChannelLabel(b.name ?? "").displayName ?? "";
      return na.localeCompare(nb, undefined, { sensitivity: "base" });
    });
    return list;
  }, [channels]);

  const idPayload = useMemo(() => {
    const ids = [
      ...new Set(
        rows.map((c) => c.tvgId?.trim()).filter(Boolean) as string[],
      ),
    ];
    ids.sort();
    return ids;
  }, [rows]);

  const withGuideId = useMemo(
    () => rows.filter((c) => Boolean(c.tvgId?.trim())),
    [rows],
  );

  const fetchPrograms = useCallback(
    async (mode: "full" | "background" | "force" = "full") => {
      if (idPayload.length === 0) {
        setPrograms({});
        setFetchedAt(null);
        setError(null);
        setHasLoadedOnce(false);
        return;
      }

      const idsKey = idPayload.join("\0");

      if (mode === "full") {
        const cached = readEpgSession(idsKey);
        if (cached) {
          setPrograms(cached.programs);
          setFetchedAt(cached.fetchedAt);
          setHasLoadedOnce(true);
          setError(null);
          void fetchPrograms("background");
          return;
        }
      }

      if (mode === "full" || mode === "force") {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await zendeFetch("/api/epg/programs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: idPayload }),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          programs?: Record<string, ChannelPrograms>;
          fetchedAt?: number;
        };
        const programs = data.programs ?? {};
        const at =
          typeof data.fetchedAt === "number" ? data.fetchedAt : Date.now();
        setPrograms(programs);
        setFetchedAt(at);
        setHasLoadedOnce(true);
        writeEpgSession({ idsKey, programs, fetchedAt: at });
      } catch (e) {
        if (mode === "full" || mode === "force") {
          setError(e instanceof Error ? e.message : "Could not load guide");
          setPrograms({});
          setFetchedAt(null);
          setHasLoadedOnce(true);
        }
      } finally {
        setLoading(false);
      }
    },
    [idPayload],
  );

  useEffect(() => {
    void fetchPrograms("full");
  }, [fetchPrograms]);

  useEffect(() => {
    const id = window.setInterval(
      () => void fetchPrograms("background"),
      10 * 60 * 1000,
    );
    return () => window.clearInterval(id);
  }, [fetchPrograms]);

  const hasGuideIds = rows.some((c) => Boolean(c.tvgId?.trim()));

  if (rows.length === 0) return null;

  return (
    <section
      className={cn(
        "motion-safe:animate-fav-epg-strip motion-reduce:animate-none",
        className,
      )}
      aria-labelledby="favorites-epg-heading"
    >
      <ZenedeGlass
        variant="panel"
        className={cn(
          "w-full overflow-hidden shadow-[0_24px_70px_-34px_rgba(0,0,0,0.88)]",
          "ring-1 ring-white/[0.07]",
          "transition-[box-shadow] duration-500 ease-out",
        )}
      >
        <div className="border-b border-white/[0.06] px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className={cn(
                "group flex min-w-0 flex-1 items-start gap-3 rounded-2xl text-left outline-none",
                "transition-colors duration-200 hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-white sm:items-center",
              )}
              aria-expanded={expanded}
              aria-controls="favorites-epg-carousel"
            >
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-fuchsia-500/15 ring-1 ring-white/[0.12] sm:mt-0">
                <Radio className="size-5 text-violet-200/95" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    id="favorites-epg-heading"
                    className="text-[17px] font-semibold tracking-tight text-white sm:text-[18px]"
                  >
                    What&apos;s on
                  </h2>
                  <ChevronDown
                    className={cn(
                      "size-5 shrink-0 text-white/40 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      expanded && "rotate-180",
                    )}
                    aria-hidden
                  />
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-white/45 sm:text-[14px]">
                  {hasGuideIds ? (
                    <>
                      <span className="tabular-nums text-white/55">
                        {withGuideId.length}
                      </span>
                      {" of "}
                      <span className="tabular-nums text-white/55">
                        {rows.length}
                      </span>
                      {" favorites have guide data — scroll sideways for now & next."}
                    </>
                  ) : (
                    <>
                      No <span className="text-white/60">tvg-id</span> on these
                      channels yet — programme titles won&apos;t appear until the
                      playlist includes guide IDs.
                    </>
                  )}
                </p>
              </div>
            </button>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {fetchedAt ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/25 px-3 py-1.5 text-[11px] tabular-nums text-white/40 sm:text-[12px]">
                  <CalendarClock className="size-3.5 opacity-70" aria-hidden />
                  {formatClock(fetchedAt)}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void fetchPrograms("force")}
                disabled={loading || idPayload.length === 0}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.06]",
                  "px-3.5 py-2 text-[12px] font-semibold text-white/85 outline-none transition-all duration-200",
                  "hover:bg-white/[0.1] disabled:opacity-40",
                  "focus-visible:ring-2 focus-visible:ring-white",
                  "active:scale-[0.98]",
                )}
              >
                <RefreshCw
                  className={cn("size-3.5 sm:size-4", loading && "animate-spin")}
                  aria-hidden
                />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div
          id="favorites-epg-carousel"
          className={cn(
            "grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="px-0 pb-5 pt-1 sm:px-2 sm:pb-6 sm:pt-2">
              {!hasGuideIds ? (
                <p className="mx-4 rounded-2xl border border-dashed border-white/[0.12] bg-black/20 px-5 py-8 text-center text-[14px] leading-relaxed text-white/48 sm:mx-6 sm:text-[15px]">
                  When providers add <span className="text-white/70">tvg-id</span>{" "}
                  metadata, a compact schedule strip appears here — no extra setup.
                </p>
              ) : (
                <>
                  {error ? (
                    <p className="mx-4 mb-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-100/90 sm:mx-6 sm:text-[14px]">
                      {error}
                    </p>
                  ) : null}

                  <div
                    className={cn(
                      "relative",
                      "before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:z-10 before:w-8 before:bg-gradient-to-r before:from-[var(--tv-page-bg)] before:to-transparent",
                      "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:z-10 after:w-10 after:bg-gradient-to-l after:from-[var(--tv-page-bg)] after:to-transparent",
                    )}
                  >
                    <ul
                      className={cn(
                        "tv-row-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden px-4 pb-2 pt-1 sm:gap-4 sm:px-6 sm:pb-3",
                        "scroll-px-4 sm:scroll-px-6",
                        "[scroll-padding-inline:1rem]",
                      )}
                      role="list"
                      aria-label="Now and next by channel"
                    >
                      {loading && !hasLoadedOnce
                        ? Array.from({ length: 7 }, (_, i) => (
                            <li key={`sk-${i}`} className="snap-start" role="presentation">
                              <EpgCardSkeleton i={i} />
                            </li>
                          ))
                        : rows.map((ch, idx) => {
                            const parsed = parseChannelLabel(ch.name ?? "");
                            const gid = ch.tvgId?.trim();
                            const prog = gid ? programs[gid] : undefined;
                            const hasData =
                              prog &&
                              (prog.current !== null || prog.next !== null);

                            return (
                              <li
                                key={`${ch.url}-${idx}`}
                                className="snap-start"
                                style={{
                                  animationDelay: `${Math.min(idx, 20) * 45}ms`,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => onSelectChannel(ch)}
                                  className={cn(
                                    "motion-safe:animate-fav-epg-card motion-reduce:animate-none motion-reduce:opacity-100",
                                    "group flex h-full w-[min(calc(100vw-3rem),292px)] flex-col rounded-2xl border text-left outline-none",
                                    "border-white/[0.09] bg-gradient-to-b from-white/[0.07] to-black/30 ring-1 ring-white/[0.05]",
                                    "transition-[transform,box-shadow,border-color,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                    "hover:border-violet-400/30 hover:from-white/[0.09] hover:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.75)]",
                                    "focus-visible:ring-2 focus-visible:ring-violet-400/80",
                                    "motion-safe:group-hover:-translate-y-0.5",
                                  )}
                                >
                                  <div className="flex items-center gap-3 border-b border-white/[0.06] p-3.5 sm:p-4">
                                    <div
                                      className={cn(
                                        "relative size-11 shrink-0 overflow-hidden rounded-xl sm:size-12",
                                        "bg-zinc-800 ring-1 ring-white/[0.08]",
                                        "transition-transform duration-300 group-hover:scale-[1.03]",
                                      )}
                                    >
                                      {ch.tvgLogo ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img
                                          src={ch.tvgLogo}
                                          alt=""
                                          className="size-full object-contain p-1.5"
                                          loading="lazy"
                                        />
                                      ) : (
                                        <div className="flex size-full items-center justify-center bg-gradient-to-br from-white/12 to-black/35 text-[11px] font-bold text-white/45">
                                          {(parsed.displayName ?? "?")
                                            .slice(0, 2)
                                            .toUpperCase()}
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-[15px] font-semibold leading-tight text-white">
                                        {parsed.displayName ||
                                          ch.name ||
                                          "Channel"}
                                      </p>
                                      <p className="mt-0.5 truncate text-[12px] text-white/40">
                                        {ch.groupTitle ?? "Live"}
                                      </p>
                                    </div>
                                    <ChevronRight
                                      className="size-4 shrink-0 text-white/30 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-violet-300/90"
                                      aria-hidden
                                    />
                                  </div>

                                  <div className="grid flex-1 grid-cols-1 gap-2 p-3 sm:grid-cols-2 sm:gap-2.5 sm:p-3.5">
                                    {!gid ? (
                                      <p className="col-span-full py-3 text-center text-[12px] text-white/38">
                                        No guide ID
                                      </p>
                                    ) : loading && !hasLoadedOnce ? (
                                      <>
                                        <div className="h-16 animate-pulse rounded-xl bg-violet-500/10" />
                                        <div className="h-16 animate-pulse rounded-xl bg-white/[0.06]" />
                                      </>
                                    ) : (
                                      <>
                                        <div
                                          className={cn(
                                            "rounded-xl border px-3 py-2.5 transition-colors duration-200",
                                            prog?.current
                                              ? "border-violet-400/28 bg-gradient-to-br from-violet-500/18 to-transparent"
                                              : "border-white/[0.07] bg-black/25",
                                          )}
                                        >
                                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200/75">
                                            Now
                                          </p>
                                          <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-snug text-white">
                                            {prog?.current?.title ?? "—"}
                                          </p>
                                          {prog?.current ? (
                                            <p className="mt-1 text-[11px] tabular-nums text-white/42">
                                              {formatWindow(prog.current)}
                                            </p>
                                          ) : (
                                            <p className="mt-1 text-[11px] text-white/32">
                                              No match
                                            </p>
                                          )}
                                        </div>
                                        <div className="rounded-xl border border-white/[0.07] bg-black/22 px-3 py-2.5">
                                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                                            Next
                                          </p>
                                          <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-snug text-white/82">
                                            {prog?.next?.title ?? "—"}
                                          </p>
                                          {prog?.next ? (
                                            <p className="mt-1 text-[11px] tabular-nums text-white/38">
                                              {formatWindow(prog.next)}
                                            </p>
                                          ) : (
                                            <p className="mt-1 text-[11px] text-white/28">
                                              —
                                            </p>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </button>
                              </li>
                            );
                          })}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </ZenedeGlass>
    </section>
  );
}
