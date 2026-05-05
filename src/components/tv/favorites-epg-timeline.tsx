"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
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

  const fetchPrograms = useCallback(async () => {
    if (idPayload.length === 0) {
      setPrograms({});
      setFetchedAt(null);
      setError(null);
      setHasLoadedOnce(false);
      return;
    }
    setLoading(true);
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
      setPrograms(data.programs ?? {});
      setFetchedAt(typeof data.fetchedAt === "number" ? data.fetchedAt : Date.now());
      setHasLoadedOnce(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load guide");
      setPrograms({});
      setFetchedAt(null);
      setHasLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  }, [idPayload]);

  useEffect(() => {
    void fetchPrograms();
  }, [fetchPrograms]);

  useEffect(() => {
    const id = window.setInterval(
      () => void fetchPrograms(),
      10 * 60 * 1000,
    );
    return () => window.clearInterval(id);
  }, [fetchPrograms]);

  const hasGuideIds = rows.some((c) => Boolean(c.tvgId?.trim()));

  if (rows.length === 0) return null;

  return (
    <section
      className={cn("mb-10", className)}
      aria-labelledby="favorites-epg-heading"
    >
      <ZenedeGlass
        variant="panel"
        className={cn(
          "overflow-hidden shadow-[0_24px_70px_-34px_rgba(0,0,0,0.88)]",
          "ring-1 ring-white/[0.07]",
        )}
      >
        <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-fuchsia-500/15 ring-1 ring-white/[0.12]">
                <Radio className="size-5 text-violet-200/95" aria-hidden />
              </span>
              <div>
                <h2
                  id="favorites-epg-heading"
                  className="text-[18px] font-semibold tracking-tight text-white"
                >
                  What&apos;s on
                </h2>
                <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-white/45">
                  For each favorite that has a{" "}
                  <span className="text-white/55">tvg-id</span> in the playlist, we
                  look up the current and following show from the XMLTV guides
                  configured for this app.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {fetchedAt ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/25 px-3 py-1.5 text-[12px] tabular-nums text-white/40">
                  <CalendarClock className="size-3.5 opacity-70" aria-hidden />
                  Updated {formatClock(fetchedAt)}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void fetchPrograms()}
                disabled={loading || idPayload.length === 0}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.06]",
                  "px-4 py-2 text-[13px] font-semibold text-white/85 outline-none transition-colors",
                  "hover:bg-white/[0.1] disabled:opacity-40",
                  "focus-visible:ring-2 focus-visible:ring-white",
                )}
              >
                <RefreshCw
                  className={cn("size-4", loading && "animate-spin")}
                  aria-hidden
                />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 py-5 sm:px-6 sm:py-6">
          {!hasGuideIds ? (
            <p className="rounded-2xl border border-dashed border-white/[0.12] bg-black/20 px-5 py-8 text-center text-[15px] leading-relaxed text-white/48">
              None of these favorites include a{" "}
              <span className="text-white/70">tvg-id</span> from the playlist.
              When the provider adds guide IDs, a schedule line appears here
              automatically.
            </p>
          ) : (
            <>
              {error ? (
                <p className="mb-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-[14px] text-rose-100/90">
                  {error}
                </p>
              ) : null}

              <div className="relative">
                <div
                  className="pointer-events-none absolute bottom-2 left-[21px] top-2 w-px bg-gradient-to-b from-violet-400/35 via-white/15 to-fuchsia-400/25 sm:left-[25px]"
                  aria-hidden
                />

                <ul className="flex flex-col gap-0">
                  {rows.map((ch, idx) => {
                    const parsed = parseChannelLabel(ch.name ?? "");
                    const gid = ch.tvgId?.trim();
                    const prog = gid ? programs[gid] : undefined;
                    const hasData =
                      prog &&
                      (prog.current !== null || prog.next !== null);

                    return (
                      <li key={`${ch.url}-${idx}`} className="relative">
                        <div className="flex gap-3 py-4 sm:gap-5">
                          <div className="relative z-[1] flex w-11 shrink-0 justify-center sm:w-[52px]">
                            <span
                              className={cn(
                                "mt-1.5 size-3 rounded-full ring-4 ring-[var(--tv-page-bg)] sm:size-3.5",
                                hasData
                                  ? "bg-gradient-to-br from-violet-400 to-fuchsia-400 shadow-[0_0_14px_rgba(167,139,250,0.45)]"
                                  : "bg-white/25",
                              )}
                              aria-hidden
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => onSelectChannel(ch)}
                              className={cn(
                                "group mb-3 flex w-full max-w-full items-center gap-3 rounded-2xl text-left outline-none",
                                "transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-white sm:gap-4",
                              )}
                            >
                              <div
                                className={cn(
                                  "relative size-11 shrink-0 overflow-hidden rounded-xl sm:size-12",
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
                                  <div className="flex size-full items-center justify-center bg-gradient-to-br from-white/12 to-black/35 text-[11px] font-bold text-white/45">
                                    {(parsed.displayName ?? "?")
                                      .slice(0, 2)
                                      .toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[16px] font-semibold text-white group-hover:text-white">
                                  {parsed.displayName ||
                                    ch.name ||
                                    "Channel"}
                                </p>
                                <p className="mt-0.5 truncate text-[13px] text-white/42">
                                  {ch.groupTitle ?? "Live TV"}
                                  {gid ? (
                                    <span className="text-white/28">
                                      {" "}
                                      · {gid}
                                    </span>
                                  ) : null}
                                </p>
                              </div>
                              <ChevronRight
                                className="size-5 shrink-0 text-white/35 transition-transform group-hover:translate-x-0.5 group-hover:text-white/55"
                                aria-hidden
                              />
                            </button>

                            {!gid ? (
                              <p className="text-[13px] leading-relaxed text-white/38">
                                No guide ID on this stream — programme titles
                                aren&apos;t available.
                              </p>
                            ) : loading && !hasLoadedOnce ? (
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div className="h-[72px] animate-pulse rounded-2xl bg-white/[0.06]" />
                                <div className="h-[72px] animate-pulse rounded-2xl bg-white/[0.05]" />
                              </div>
                            ) : (
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div
                                  className={cn(
                                    "rounded-2xl border px-4 py-3 sm:py-3.5",
                                    prog?.current
                                      ? "border-violet-400/25 bg-gradient-to-br from-violet-500/15 to-transparent"
                                      : "border-white/[0.08] bg-black/25",
                                  )}
                                >
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200/75">
                                    Now
                                  </p>
                                  <p className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-white">
                                    {prog?.current?.title ?? "—"}
                                  </p>
                                  {prog?.current ? (
                                    <p className="mt-1 text-[12px] tabular-nums text-white/45">
                                      {formatWindow(prog.current)}
                                    </p>
                                  ) : (
                                    <p className="mt-1 text-[12px] text-white/35">
                                      No match in configured guides
                                    </p>
                                  )}
                                </div>
                                <div
                                  className={cn(
                                    "rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3 sm:py-3.5",
                                  )}
                                >
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
                                    Next
                                  </p>
                                  <p className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-white/85">
                                    {prog?.next?.title ?? "—"}
                                  </p>
                                  {prog?.next ? (
                                    <p className="mt-1 text-[12px] tabular-nums text-white/40">
                                      {formatWindow(prog.next)}
                                    </p>
                                  ) : (
                                    <p className="mt-1 text-[12px] text-white/35">
                                      —
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </div>
      </ZenedeGlass>
    </section>
  );
}
