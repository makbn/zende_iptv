"use client";

import { Input } from "@appica/ui-react/input";

import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Play,
  Radio,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { BROWSE_CONTAINER_CLASS } from "@/components/layout/browse-page-shell";
import { LivePreviewDialog } from "@/components/library/live-preview-dialog";
import { ZendeLoadingState, ZendeSpinner } from "@/components/loading/zende-spinner";
import { Button } from "@appica/ui-react/button";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { secureImageUrl } from "@/lib/media/secure-image-url";
import { cn } from "@/lib/utils";

type GuideProgramme = {
  id: string;
  title: string;
  description: string;
  startMs: number;
  stopMs: number;
  matched: boolean;
};

type GuideResult = {
  channel: M3uChannel;
  programmes: GuideProgramme[];
  channelMatched: boolean;
  matchCount: number;
};

type GuideResponse = {
  results?: GuideResult[];
  total?: number;
  error?: string;
};

type Props = {
  seedChannels: M3uChannel[];
  seedReady?: boolean;
  mobile?: boolean;
  onPlayChannel: (channel: M3uChannel) => void;
};

const clockFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});

function formatTime(ms: number) {
  return clockFormatter.format(new Date(ms));
}

function formatDuration(startMs: number, stopMs: number) {
  const minutes = Math.max(0, Math.round((stopMs - startMs) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function dayKey(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function summaryProgrammes(result: GuideResult, now: number) {
  const matched = result.programmes.filter((programme) => programme.matched);
  if (matched.length > 0) return matched.slice(0, 2);
  const currentIndex = result.programmes.findIndex(
    (programme) => programme.startMs <= now && programme.stopMs > now,
  );
  if (currentIndex >= 0) return result.programmes.slice(currentIndex, currentIndex + 2);
  return result.programmes.filter((programme) => programme.startMs > now).slice(0, 2);
}

export function FullGuideBrowser({
  seedChannels,
  seedReady = true,
  mobile = false,
  onPlayChannel,
}: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<GuideResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailResult, setDetailResult] = useState<GuideResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const preferred = useMemo(
    () => seedChannels.flatMap((channel) => {
      const providerId = channel.providerId?.trim();
      const tvgId = channel.tvgId?.trim();
      return providerId && tvgId ? [{ providerId, tvgId }] : [];
    }),
    [seedChannels],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 150);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const updateClock = () => setNow(Date.now());
    const initialTimer = window.setTimeout(updateClock, 0);
    const interval = window.setInterval(updateClock, 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (!seedReady) return () => controller.abort();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
    });

    void (async () => {
      try {
        const response = await zendeFetch("/api/epg/guide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: debouncedQuery,
            preferred,
            limit: debouncedQuery ? 60 : mobile ? 36 : 48,
          }),
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as GuideResponse;
        if (!response.ok) throw new Error(payload.error || "Could not load the programme guide.");
        if (controller.signal.aborted) return;
        const nextResults = payload.results ?? [];
        setResults(nextResults);
        setTotal(payload.total ?? nextResults.length);
        setSelectedUrl((current) =>
          current && nextResults.some((result) => result.channel.url === current)
            ? current
            : nextResults[0]?.channel.url ?? null,
        );
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Could not load the programme guide.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [debouncedQuery, mobile, preferred, seedReady]);

  const selectedSummary = useMemo(
    () => results.find((result) => result.channel.url === selectedUrl) ?? results[0] ?? null,
    [results, selectedUrl],
  );

  useEffect(() => {
    const tvgId = selectedSummary?.channel.tvgId?.trim();
    const controller = new AbortController();
    if (!detailOpen || !tvgId) {
      if (detailOpen) {
        queueMicrotask(() => {
          if (!controller.signal.aborted) setDetailLoading(false);
        });
      }
      return () => controller.abort();
    }
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setDetailResult(null);
      setDetailError(null);
      setDetailLoading(true);
    });

    void (async () => {
      try {
        const response = await zendeFetch("/api/epg/guide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            detailId: tvgId,
            detailProviderId: selectedSummary?.channel.providerId,
            query: debouncedQuery,
            limit: 1,
          }),
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as GuideResponse;
        if (!response.ok) throw new Error(payload.error || "Could not load the full schedule.");
        if (!controller.signal.aborted) setDetailResult(payload.results?.[0] ?? null);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setDetailError(cause instanceof Error ? cause.message : "Could not load the full schedule.");
        }
      } finally {
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    })();

    return () => controller.abort();
  }, [debouncedQuery, detailOpen, selectedSummary?.channel.providerId, selectedSummary?.channel.tvgId]);

  const selectChannel = (channelUrl: string) => {
    setSelectedUrl(channelUrl);
    setDetailResult(null);
    setDetailError(null);
    setDetailLoading(true);
    setDetailOpen(true);
  };

  useEffect(() => {
    if (!detailOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [detailOpen]);

  const normalizedInput = query.trim();
  const searchPending = loading || normalizedInput !== debouncedQuery;

  return (
    <>
    <section aria-label="Full TV guide" className="flex min-h-0 flex-1 flex-col gap-5">
      <div
        data-tv-layout="horizontal"
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <label className="stream-search relative block min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 z-[1] size-4 -translate-y-1/2 text-white/45"
            aria-hidden
          />
          <span className="sr-only">Search channels and programme guide</span>
          <Input
            id="guide-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search channels or programmes — TSN, tennis, US Open…"
            data-tv-initial-focus=""
            data-tv-nav-input="spatial"
            data-tv-nav-down="#guide-results"
            className="h-14 w-full rounded-full border border-white/12 bg-[rgb(12_16_28_/_0.72)] pl-11 pr-11 text-[15px] font-medium text-white outline-none placeholder:text-white/40 focus:border-[#ff3f91]/55 focus:ring-2 focus:ring-[#ff3f91]/20"
          />
          {query ? (
            <Button
              variant="ghost"
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-white/55 hover:bg-white/10 hover:text-white"
              aria-label="Clear guide search"
            >
              <X className="size-4" aria-hidden />
            </Button>
          ) : null}
        </label>
        <div
          className="flex shrink-0 items-center gap-2 px-2 text-[13px] text-white/50"
          aria-live="polite"
        >
          {searchPending ? (
            <ZendeSpinner size="small" label="Searching guide" />
          ) : (
            <Radio className="size-4 text-[#ff3f91]" aria-hidden />
          )}
          {searchPending
            ? normalizedInput
              ? `Searching “${normalizedInput}”…`
              : "Preparing provider guide…"
            : debouncedQuery
              ? `${total.toLocaleString()} matching ${total === 1 ? "channel" : "channels"}`
              : `${results.length.toLocaleString()} channels with schedules`}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-[14px] text-red-100">
          {error}
        </div>
      ) : null}

      {searchPending ? (
        <div className="stream-empty !mx-0 !py-12">
          <ZendeLoadingState
            size="large"
            label={normalizedInput ? `Searching for “${normalizedInput}”` : "Building your live guide"}
            description="Matching channels and programmes from your provider guide."
          />
        </div>
      ) : null}

      {!error && !loading && results.length === 0 ? (
        <div className="stream-empty !mx-0">
          <Search className="mx-auto size-10 text-white/40" aria-hidden />
          <h2>No matching guide entries</h2>
          <p>
            Try a channel name, sport, event, movie, or a word from the programme description.
          </p>
        </div>
      ) : null}

      {results.length > 0 ? (
        <div
          className={cn(
            "flex min-h-[34rem] flex-1 flex-col transition-opacity",
            searchPending && "opacity-45",
          )}
        >
          <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
            <h2 className="text-[1.25rem] font-bold tracking-[-0.03em] text-white">
              On now &amp; next
            </h2>
            <span className="text-[12px] font-semibold text-white/40">
              {results.length.toLocaleString()} channels
            </span>
          </div>

          <div
            id="guide-results"
            data-tv-layout="vertical"
            data-tv-nav-up="#guide-search"
            className="flex-1 space-y-2.5 overflow-y-auto pb-4"
          >
            {results.map((result, resultIndex) => {
              const summaries = summaryProgrammes(result, now);
              const currentSummaryIndex = summaries.findIndex(
                (programme) => programme.startMs <= now && programme.stopMs > now,
              );
              return (
                <button
                  key={`${result.channel.tvgId ?? result.channel.url}:${result.channel.url}`}
                  type="button"
                  data-tv-index={resultIndex}
                  data-tv-card=""
                  onClick={() => selectChannel(result.channel.url)}
                  className="guide-channel-row group min-h-[5.5rem] outline-none focus-visible:ring-2 focus-visible:ring-[#ff3f91]/60"
                  aria-label={`Open full guide for ${result.channel.name}`}
                >
                  <div className="grid w-full min-w-0 gap-3 lg:grid-cols-[minmax(13rem,0.75fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_2rem] lg:items-stretch">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#141925] ring-1 ring-white/10">
                        {result.channel.tvgLogo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={secureImageUrl(result.channel.tvgLogo, undefined, "logo")}
                            alt=""
                            className="max-h-11 max-w-11 object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <Radio className="size-5 text-white/40" aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[16px] font-semibold text-white">
                            {result.channel.name}
                          </p>
                          {result.matchCount > 0 ? (
                            <span className="rounded-full bg-[#ff3f91] px-2 py-0.5 text-[10px] font-bold text-white">
                              {result.matchCount} {result.matchCount === 1 ? "match" : "matches"}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
                          {result.channel.groupTitle || result.channel.tvgId || "Live TV"}
                        </p>
                      </div>
                    </div>

                    {summaries.length > 0 ? (
                      summaries.map((programme, index) => {
                        const isCurrent = programme.startMs <= now && programme.stopMs > now;
                        return (
                          <div
                            key={programme.id}
                            className={cn(
                              "guide-programme-chip",
                              programme.matched && "ring-1 ring-[#ff3f91]/40 bg-[#ff3f91]/12",
                              isCurrent && !programme.matched && "bg-white/10",
                            )}
                          >
                            <span>
                              {programme.matched
                                ? "Match"
                                : isCurrent
                                  ? "Live now"
                                  : index === 0 || index === currentSummaryIndex + 1
                                    ? "Up next"
                                    : "Later"}{" "}
                              · {formatTime(programme.startMs)}–{formatTime(programme.stopMs)}
                            </span>
                            <strong>{programme.title}</strong>
                            <span className="!normal-case !tracking-normal !font-medium line-clamp-1 opacity-80">
                              {programme.description ||
                                `${formatDuration(programme.startMs, programme.stopMs)} programme`}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="guide-programme-chip lg:col-span-2">
                        <span>Schedule</span>
                        <strong>Open for full guide &amp; live preview</strong>
                      </div>
                    )}

                    <div className="hidden items-center justify-center lg:flex">
                      <ChevronRight
                        className="size-5 text-white/35 transition-transform group-hover:translate-x-0.5 group-hover:text-white"
                        aria-hidden
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
    {detailOpen && selectedSummary && typeof document !== "undefined" ? createPortal((
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-[#020914] text-white"
        role="dialog"
        aria-modal="true"
        aria-label={`Full guide for ${selectedSummary.channel.name}`}
      >
        <header className="sticky top-0 z-20 border-b border-white/8 bg-[#020914]/92 px-4 py-4 backdrop-blur-2xl sm:px-6">
          <div className={cn(BROWSE_CONTAINER_CLASS, "flex items-center justify-between gap-4")}>
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#141925] ring-1 ring-white/10">
                {selectedSummary.channel.tvgLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={secureImageUrl(selectedSummary.channel.tvgLogo, undefined, "logo")} alt="" className="max-h-10 max-w-10 object-contain" />
                ) : (
                  <Radio className="size-4 text-white/50" aria-hidden />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#ff77b0]">Full channel guide</p>
                <h2 className="truncate text-[18px] font-bold tracking-[-0.03em] text-white sm:text-[22px]">
                  {selectedSummary.channel.name}
                </h2>
                <p className="truncate text-[12px] text-white/45">
                  {selectedSummary.channel.groupTitle || "Live TV"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                onClick={() => onPlayChannel(selectedSummary.channel)}
                size="sm"
                className="stream-cta hidden !min-h-11 sm:inline-flex"
              >
                <Play className="size-3.5 fill-current" aria-hidden />
                Play channel
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => setDetailOpen(false)}
                className="rounded-full border border-white/12 bg-white/8 p-2.5 text-white hover:bg-white/14"
                aria-label="Close full channel guide"
              >
                <X className="size-5" aria-hidden />
              </Button>
            </div>
          </div>
        </header>

        <main className={cn(BROWSE_CONTAINER_CLASS, "grid gap-5 py-5 lg:grid-cols-2 lg:items-start lg:gap-7 lg:py-7")}>
          <section aria-label="Live preview" className="lg:sticky lg:top-[92px]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Live preview</p>
                <p className="mt-1 text-[12px] text-white/40">Loads independently from the programme guide.</p>
              </div>
              <Button
                type="button"
                onClick={() => onPlayChannel(selectedSummary.channel)}
                size="sm"
                className="stream-cta !min-h-10 sm:hidden"
              >
                <Play className="size-3.5 fill-current" aria-hidden />
                Play
              </Button>
            </div>
            <LivePreviewDialog
              presentation="embedded"
              channel={selectedSummary.channel}
              onClose={() => setDetailOpen(false)}
            />
          </section>

          <section aria-label="Complete programme schedule" className="min-w-0">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-[#ff3f91]" aria-hidden />
                  <h3 className="text-[18px] font-bold tracking-[-0.03em] text-white">Complete EPG</h3>
                </div>
                <p className="mt-1 text-[12px] text-white/40">
                  {detailLoading
                    ? "Loading asynchronously…"
                    : detailResult
                      ? `${detailResult.programmes.length.toLocaleString()} available listings`
                      : "Programme information"}
                </p>
              </div>
              {detailResult && debouncedQuery && detailResult.matchCount > 0 ? (
                <span className="rounded-full bg-[#ff3f91] px-3 py-1.5 text-[11px] font-bold text-white">
                  {detailResult.matchCount} {detailResult.matchCount === 1 ? "match" : "matches"}
                </span>
              ) : null}
            </div>

            {detailLoading ? (
              <div className="space-y-2" aria-label="Loading complete EPG">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background-muted px-4 py-4 text-[12px] text-foreground-intense">
                  <ZendeSpinner size="tiny" label="Loading complete EPG" />
                  Loading the full schedule for {selectedSummary.channel.name}…
                </div>
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="h-[82px] animate-pulse rounded-lg bg-background-muted" />
                ))}
              </div>
            ) : detailError ? (
              <p className="rounded-lg border border-warning bg-warning-subtle px-4 py-4 text-[12px] text-warning-strong">
                {detailError}
              </p>
            ) : detailResult?.programmes.length ? (
              <div className="space-y-2 pb-10">
                {detailResult.programmes.map((programme, index) => {
                  const isCurrent = programme.startMs <= now && programme.stopMs > now;
                  const showDate = index === 0 || dayKey(programme.startMs) !== dayKey(detailResult.programmes[index - 1]!.startMs);
                  return (
                    <div key={programme.id}>
                      {showDate ? (
                        <p className="sticky top-[76px] z-10 mb-2 mt-5 bg-background py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground-intense first:mt-0">
                          {dateFormatter.format(new Date(programme.startMs))}
                        </p>
                      ) : null}
                      <article
                        className={cn(
                          "rounded-lg border px-4 py-3",
                          programme.matched
                            ? "border-border-strong bg-primary-subtle ring-1 ring-primary/15"
                            : isCurrent
                              ? "border-border bg-background-muted"
                              : "border-border bg-background-muted",
                        )}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                          <div className="shrink-0 text-[11px] tabular-nums text-foreground-intense sm:w-[125px]">
                            <p>{formatTime(programme.startMs)}–{formatTime(programme.stopMs)}</p>
                            <p className="mt-1 flex items-center gap-1 text-[10px] text-foreground-intense">
                              <Clock3 className="size-3" aria-hidden />
                              {formatDuration(programme.startMs, programme.stopMs)}
                            </p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-[13px] font-semibold text-foreground-intense">{programme.title}</h4>
                              {isCurrent ? <span className="rounded-full bg-error-subtle px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-error-strong">Live now</span> : null}
                              {programme.matched ? <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-primary-foreground">Search match</span> : null}
                            </div>
                            <p className="mt-1.5 text-[11px] leading-relaxed text-foreground-intense">
                              {programme.description || "No programme description supplied."}
                            </p>
                          </div>
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-border bg-background-muted px-4 py-4 text-[12px] text-foreground-intense">
                No complete programme schedule is available for this channel.
              </p>
            )}
          </section>
        </main>
      </div>
    ), document.body) : null}
    </>
  );
}
