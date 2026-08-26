"use client";

import { Button } from "@appica/ui-react/button";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Card } from "@appica/ui-react/card";
import { ZendeSpinner } from "@/components/loading/zende-spinner";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { secureImageUrl } from "@/lib/media/secure-image-url";
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

const EPG_SESSION_KEY = "zende.fav-epg.v2";

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
        "motion-safe:animate-fav-epg-card shrink-0 rounded-2xl border border-border bg-background-muted p-4 ring-1 ring-border",
        "motion-reduce:animate-none motion-reduce:opacity-100",
      )}
      style={{
        width: CAROUSEL_CARD_W,
        animationDelay: `${i * 55}ms`,
      }}
    >
      <div className="flex gap-3">
        <div className="size-11 shrink-0 animate-pulse rounded-xl bg-background-muted" />
        <div className="min-w-0 flex-1 space-y-2 pt-0.5">
          <div className="h-3.5 w-3/4 animate-pulse rounded-md bg-background-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded-md bg-background-muted" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="h-[4.5rem] animate-pulse rounded-xl bg-primary-subtle" />
        <div className="h-[4.5rem] animate-pulse rounded-xl bg-background-muted" />
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
      <Card
        frame="glass"
        className={cn(
          "w-full overflow-hidden shadow-lg",
          "ring-1 ring-border",
          "transition-[box-shadow] duration-500 ease-out",
        )}
      >
        <div className="border-b border-border px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost"
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className={cn(
                "group flex min-w-0 flex-1 items-start gap-3 rounded-2xl text-left outline-none",
                "transition-colors duration-200 hover:bg-background-muted focus-visible:ring-2 focus-visible:ring-border sm:items-center",
              )}
              aria-expanded={expanded}
              aria-controls="favorites-epg-carousel"
            >
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-subtle to-background-muted ring-1 ring-border sm:mt-0">
                <Radio className="size-5 text-primary-strong" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    id="favorites-epg-heading"
                    className="text-[17px] font-semibold tracking-tight text-foreground-intense sm:text-[18px]"
                  >
                    What&apos;s on
                  </h2>
                  <ChevronDown
                    className={cn(
                      "size-5 shrink-0 text-foreground-intense transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      expanded && "rotate-180",
                    )}
                    aria-hidden
                  />
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-foreground-intense sm:text-[14px]">
                  {hasGuideIds ? (
                    <>
                      <span className="tabular-nums text-foreground-intense">
                        {withGuideId.length}
                      </span>
                      {" of "}
                      <span className="tabular-nums text-foreground-intense">
                        {rows.length}
                      </span>
                      {" channels have guide data — scroll sideways for now & next."}
                    </>
                  ) : (
                    <>
                      No <span className="text-foreground-intense">tvg-id</span> on these
                      channels yet — programme titles won&apos;t appear until the
                      playlist includes guide IDs.
                    </>
                  )}
                </p>
              </div>
            </Button>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {fetchedAt ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] tabular-nums text-foreground-intense sm:text-[12px]">
                  <CalendarClock className="size-3.5 opacity-70" aria-hidden />
                  {formatClock(fetchedAt)}
                </span>
              ) : null}
              <Button variant="ghost"
                type="button"
                onClick={() => void fetchPrograms("force")}
                disabled={loading || idPayload.length === 0}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border border-border bg-background-muted",
                  "px-3.5 py-2 text-[12px] font-semibold text-foreground-intense outline-none transition-all duration-200",
                  "hover:bg-background-muted disabled:opacity-40",
                  "focus-visible:ring-2 focus-visible:ring-border",
                  "active:scale-[0.98]",
                )}
              >
                {loading ? (
                  <ZendeSpinner size="tiny" label="Refreshing programme guide" />
                ) : (
                  <RefreshCw className="size-3.5 sm:size-4" aria-hidden />
                )}
                Refresh
              </Button>
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
                <p className="mx-4 rounded-2xl border border-dashed border-border bg-background px-5 py-8 text-center text-[14px] leading-relaxed text-foreground-intense sm:mx-6 sm:text-[15px]">
                  When providers add <span className="text-foreground-intense">tvg-id</span>{" "}
                  metadata, a compact schedule strip appears here — no extra setup.
                </p>
              ) : (
                <>
                  {error ? (
                    <p className="mx-4 mb-4 rounded-xl border border-error bg-error-subtle px-4 py-3 text-[13px] text-error-strong sm:mx-6 sm:text-[14px]">
                      {error}
                    </p>
                  ) : null}

                  <div
                    className={cn(
                      "relative",
                      "before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:z-10 before:w-8 before:bg-gradient-to-r before:from-background before:to-transparent",
                      "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:z-10 after:w-10 after:bg-gradient-to-l after:from-background after:to-transparent",
                    )}
                  >
                    <ul
                      className={cn(
                        "flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden px-4 pb-2 pt-1 sm:gap-4 sm:px-6 sm:pb-3",
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
                                <Button variant="ghost"
                                  type="button"
                                  onClick={() => onSelectChannel(ch)}
                                  className={cn(
                                    "motion-safe:animate-fav-epg-card motion-reduce:animate-none motion-reduce:opacity-100",
                                    "group flex h-full w-[min(calc(100vw-3rem),292px)] flex-col rounded-2xl border text-left outline-none",
                                    "border-border bg-gradient-to-b from-background-muted to-background ring-1 ring-border",
                                    "transition-[transform,box-shadow,border-color,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                    "hover:border-primary hover:from-background-muted hover:shadow-lg",
                                    "focus-visible:ring-2 focus-visible:ring-border",
                                    "motion-safe:group-hover:-translate-y-0.5",
                                  )}
                                >
                                  <div className="flex items-center gap-3 border-b border-border p-3.5 sm:p-4">
                                    <div
                                      className={cn(
                                        "relative size-11 shrink-0 overflow-hidden rounded-xl sm:size-12",
                                        "bg-background ring-1 ring-border",
                                        "transition-transform duration-300 group-hover:scale-[1.03]",
                                      )}
                                    >
                                      {ch.tvgLogo ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img
                                          src={secureImageUrl(ch.tvgLogo, undefined, "logo")}
                                          alt=""
                                          className="size-full object-contain p-1.5"
                                          loading="lazy"
                                        />
                                      ) : (
                                        <div className="flex size-full items-center justify-center bg-gradient-to-br from-background-muted to-background text-[11px] font-bold text-foreground-intense">
                                          {(parsed.displayName ?? "?")
                                            .slice(0, 2)
                                            .toUpperCase()}
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-[15px] font-semibold leading-tight text-foreground-intense">
                                        {parsed.displayName ||
                                          ch.name ||
                                          "Channel"}
                                      </p>
                                      <p className="mt-0.5 truncate text-[12px] text-foreground-intense">
                                        {ch.groupTitle ?? "Live"}
                                      </p>
                                    </div>
                                    <ChevronRight
                                      className="size-4 shrink-0 text-foreground-intense transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-primary-strong"
                                      aria-hidden
                                    />
                                  </div>

                                  <div className="grid flex-1 grid-cols-1 gap-2 p-3 sm:grid-cols-2 sm:gap-2.5 sm:p-3.5">
                                    {!gid ? (
                                      <p className="col-span-full py-3 text-center text-[12px] text-foreground-intense">
                                        No guide ID
                                      </p>
                                    ) : loading && !hasLoadedOnce ? (
                                      <>
                                        <div className="h-16 animate-pulse rounded-xl bg-primary-subtle" />
                                        <div className="h-16 animate-pulse rounded-xl bg-background-muted" />
                                      </>
                                    ) : (
                                      <>
                                        <div
                                          className={cn(
                                            "rounded-xl border px-3 py-2.5 transition-colors duration-200",
                                            prog?.current
                                              ? "border-primary bg-gradient-to-br from-primary-subtle to-transparent"
                                              : "border-border bg-background",
                                          )}
                                        >
                                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-strong">
                                            Now
                                          </p>
                                          <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-snug text-foreground-intense">
                                            {prog?.current?.title ?? "—"}
                                          </p>
                                          {prog?.current ? (
                                            <p className="mt-1 text-[11px] tabular-nums text-foreground-intense">
                                              {formatWindow(prog.current)}
                                            </p>
                                          ) : (
                                            <p className="mt-1 text-[11px] text-foreground-intense">
                                              No match
                                            </p>
                                          )}
                                        </div>
                                        <div className="rounded-xl border border-border bg-background px-3 py-2.5">
                                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground-intense">
                                            Next
                                          </p>
                                          <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-snug text-foreground-intense">
                                            {prog?.next?.title ?? "—"}
                                          </p>
                                          {prog?.next ? (
                                            <p className="mt-1 text-[11px] tabular-nums text-foreground-intense">
                                              {formatWindow(prog.next)}
                                            </p>
                                          ) : (
                                            <p className="mt-1 text-[11px] text-foreground-intense">
                                              —
                                            </p>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </Button>
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
      </Card>
    </section>
  );
}
