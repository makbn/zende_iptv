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

import { Card } from "@appica/ui-react/card";
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

export function FullGuideBrowser({ seedChannels, mobile = false, onPlayChannel }: Props) {
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

  const preferredIds = useMemo(
    () => seedChannels.map((channel) => channel.tvgId?.trim()).filter((id): id is string => Boolean(id)),
    [seedChannels],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
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
            preferredIds,
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
        setResults([]);
        setTotal(0);
        setSelectedUrl(null);
        setError(cause instanceof Error ? cause.message : "Could not load the programme guide.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [debouncedQuery, mobile, preferredIds]);

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
          body: JSON.stringify({ detailId: tvgId, query: debouncedQuery, limit: 1 }),
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
  }, [debouncedQuery, detailOpen, selectedSummary?.channel.tvgId]);

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
    <section aria-label="Full TV guide" className="flex flex-col flex-1 min-h-0 space-y-5">
      <Card frame="solid" className="shrink-0" contentProps={{ className: "p-3 sm:p-4" }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground-intense"
              aria-hidden
            />
            <span className="sr-only">Search channels and programme guide</span>
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search channels or programmes — TSN, tennis, US Open…"
              className="h-12 w-full rounded-full border border-border bg-background pl-11 pr-11 text-[14px] text-foreground-intense outline-none placeholder:text-foreground-intense focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {query ? (
              <Button variant="ghost"
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-foreground-intense hover:bg-background-muted hover:text-foreground-intense"
                aria-label="Clear guide search"
              >
                <X className="size-4" aria-hidden />
              </Button>
            ) : null}
          </label>
          <div className="flex shrink-0 items-center gap-2 px-2 text-[12px] text-foreground-intense" aria-live="polite">
            {searchPending ? <ZendeSpinner size="small" label="Searching guide" /> : <Radio className="size-4 text-primary-strong" aria-hidden />}
            {searchPending
              ? normalizedInput
                ? `Searching “${normalizedInput}”…`
                : "Preparing provider guide…"
              : debouncedQuery
                ? `${total.toLocaleString()} matching ${total === 1 ? "channel" : "channels"}`
                : `${results.length.toLocaleString()} channels with schedules`}
          </div>
        </div>
      </Card>

      {error ? (
        <Card frame="solid" className="p-5 text-[14px]">
          {error}
        </Card>
      ) : null}

      {searchPending ? (
        <Card
          frame="glass"
          className="relative overflow-hidden px-5 py-7 text-center sm:px-8 sm:py-9"
        >
          <div className="pointer-events-none absolute inset-0 bg-background-subtle" />
          <div className="relative mx-auto flex max-w-[620px] flex-col items-center">
            <ZendeLoadingState
              size="large"
              label={normalizedInput ? `Searching for “${normalizedInput}”` : "Building your live guide"}
              description="Checking channel names, programme titles, and descriptions. The first provider lookup after a restart can take a few seconds."
            />
            <div className="mt-5 h-1.5 w-full max-w-[360px] overflow-hidden rounded-full bg-background-muted">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
            </div>
          </div>
        </Card>
      ) : null}

      {!error && !loading && results.length === 0 ? (
        <Card frame="glass" className="p-7 text-center">
          <Search className="mx-auto size-8 text-foreground-intense" aria-hidden />
          <p className="mt-3 text-[18px] font-semibold text-foreground-intense">No matching guide entries</p>
          <p className="mt-1 text-[13px] text-foreground-intense">
            Try a channel name, sport, event, movie, or a word from the programme description.
          </p>
        </Card>
      ) : null}

      {results.length > 0 ? (
        <Card
          frame="solid"
          className={cn(
            "flex min-h-[34rem] flex-1 flex-col overflow-hidden transition-opacity",
            mobile && "rounded-lg",
            searchPending && "opacity-45",
          )}
        >
          <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-foreground-intense">
                Channels
              </p>
              <p className="mt-1 text-[12px] text-foreground-muted">
                Now and next for every result. Open a row for the live preview and complete schedule.
              </p>
            </div>
            <span className="w-fit rounded-full border border-border bg-background-muted px-3 py-1.5 text-[11px] font-medium text-foreground-muted">
              {results.length.toLocaleString()} shown
            </span>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-2 sm:p-3">
            {results.map((result) => {
              const summaries = summaryProgrammes(result, now);
              const currentSummaryIndex = summaries.findIndex(
                (programme) => programme.startMs <= now && programme.stopMs > now,
              );
              return (
                <Button
                  variant="ghost"
                  key={`${result.channel.tvgId ?? result.channel.url}:${result.channel.url}`}
                  type="button"
                  onClick={() => selectChannel(result.channel.url)}
                  className={cn(
                    "group h-auto min-h-[7.25rem] w-full justify-start rounded-lg border border-border bg-background-muted p-4 text-left",
                    "transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-border-strong hover:bg-background-subtle hover:shadow-sm",
                    "focus-visible:ring-2 focus-visible:ring-primary",
                  )}
                  aria-label={`Open full guide for ${result.channel.name}`}
                >
                  <div className="grid w-full min-w-0 gap-3 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_2.5rem] lg:items-stretch">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
                        {result.channel.tvgLogo ? (
                          <img
                            src={secureImageUrl(result.channel.tvgLogo, undefined, "logo")}
                            alt=""
                            className="max-h-10 max-w-10 object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <Radio className="size-5 text-foreground-muted" aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[15px] font-semibold text-foreground-intense">
                            {result.channel.name}
                          </p>
                          {result.matchCount > 0 ? (
                            <span className="rounded-full border border-primary bg-primary px-2 py-0.5 text-[9px] font-semibold text-primary-strong">
                              {result.matchCount} {result.matchCount === 1 ? "match" : "matches"}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-[10px] uppercase tracking-[0.1em] text-foreground-muted">
                          {result.channel.groupTitle || result.channel.tvgId || "Live TV"}
                        </p>
                        <p className="mt-2 text-[11px] font-medium text-primary-strong">
                          Open preview &amp; complete guide
                        </p>
                      </div>
                    </div>

                    {summaries.length > 0 ? summaries.map((programme, index) => {
                      const isCurrent = programme.startMs <= now && programme.stopMs > now;
                      return (
                        <div
                          key={programme.id}
                          className={cn(
                            "min-w-0 rounded-lg border px-3 py-2.5",
                            programme.matched
                              ? "border-primary bg-primary"
                              : isCurrent
                                ? "border-border-strong bg-background-subtle"
                                : "border-border bg-background",
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-foreground-muted">
                              {programme.matched
                                ? "Search match"
                                : isCurrent
                                  ? "Live now"
                                  : index === 0 || index === currentSummaryIndex + 1
                                    ? "Up next"
                                    : "Later"}
                            </span>
                            <span className="text-[10px] tabular-nums text-foreground-muted">
                              {formatTime(programme.startMs)}–{formatTime(programme.stopMs)}
                            </span>
                          </div>
                          <p className={cn("mt-1 truncate text-[13px] font-semibold text-foreground-intense", programme.matched && "text-primary-strong")}>
                            {programme.title}
                          </p>
                          <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-foreground-muted">
                            {programme.description || `${formatDuration(programme.startMs, programme.stopMs)} programme`}
                          </p>
                        </div>
                      );
                    }) : (
                      <div className="rounded-lg border border-border bg-background px-3 py-3 lg:col-span-2">
                        <p className="text-[11px] font-medium text-foreground-muted">
                          No compact schedule is available. Open the channel for its full guide and live preview.
                        </p>
                      </div>
                    )}

                    <div className="hidden items-center justify-center lg:flex">
                      <ChevronRight className="size-5 text-foreground-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground-intense" aria-hidden />
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        </Card>
      ) : null}
    </section>
    {detailOpen && selectedSummary && typeof document !== "undefined" ? createPortal((
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-background"
        role="dialog"
        aria-modal="true"
        aria-label={`Full guide for ${selectedSummary.channel.name}`}
      >
        <header className="sticky top-0 z-20 border-b border-border bg-background px-4 py-3 backdrop-blur-2xl sm:px-6">
          <div className={cn(BROWSE_CONTAINER_CLASS, "flex items-center justify-between gap-4")}>
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
                {selectedSummary.channel.tvgLogo ? (
                  <img src={secureImageUrl(selectedSummary.channel.tvgLogo, undefined, "logo")} alt="" className="max-h-9 max-w-9 object-contain" />
                ) : (
                  <Radio className="size-4 text-foreground-intense" aria-hidden />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-strong">Full channel guide</p>
                <h2 className="truncate text-[17px] font-semibold tracking-[-0.03em] sm:text-[20px]">
                  {selectedSummary.channel.name}
                </h2>
                <p className="truncate text-[11px] text-foreground-intense">
                  {selectedSummary.channel.groupTitle || "Live TV"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                onClick={() => onPlayChannel(selectedSummary.channel)}
                variant="primary"
                size="sm"
                className="hidden sm:inline-flex"
              >
                <Play className="size-3.5 fill-current" aria-hidden />
                Play channel
              </Button>
              <Button variant="ghost"
                type="button"
                onClick={() => setDetailOpen(false)}
                className="rounded-full border border-border bg-background-muted p-2.5 text-foreground-intense hover:bg-background-muted hover:text-foreground-intense"
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground-intense">Live preview</p>
                <p className="mt-1 text-[11px] text-foreground-intense">Loads independently from the programme guide.</p>
              </div>
              <Button
                type="button"
                onClick={() => onPlayChannel(selectedSummary.channel)}
                variant="primary"
                size="sm"
                className="sm:hidden"
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
                  <CalendarDays className="size-4 text-primary-strong" aria-hidden />
                  <h3 className="text-[17px] font-semibold">Complete EPG</h3>
                </div>
                <p className="mt-1 text-[11px] text-foreground-intense">
                  {detailLoading
                    ? "Loading asynchronously…"
                    : detailResult
                      ? `${detailResult.programmes.length.toLocaleString()} available listings`
                      : "Programme information"}
                </p>
              </div>
              {detailResult && debouncedQuery && detailResult.matchCount > 0 ? (
                <span className="rounded-full border border-primary bg-primary px-3 py-1.5 text-[10px] font-semibold text-primary-strong">
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
                            ? "border-primary bg-primary"
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
                              {programme.matched ? <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-primary-strong">Search match</span> : null}
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
