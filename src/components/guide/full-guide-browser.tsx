"use client";

import { Input } from "@appica/ui-react/input";

import {
  CalendarDays,
  Clock3,
  Play,
  Radio,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [previewChannel, setPreviewChannel] = useState<M3uChannel | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const preferredIds = useMemo(
    () => seedChannels.map((channel) => channel.tvgId?.trim()).filter((id): id is string => Boolean(id)),
    [seedChannels],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

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
    setDetailResult(null);
    setDetailError(null);
    setDetailLoading(Boolean(detailOpen && tvgId));
    if (!detailOpen || !tvgId) return () => controller.abort();

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

  const selected =
    detailResult?.channel.url === selectedSummary?.channel.url
      ? detailResult
      : selectedSummary;

  const selectChannel = (channelUrl: string) => {
    setSelectedUrl(channelUrl);
    setDetailResult(null);
    setDetailError(null);
    setDetailLoading(true);
    setDetailOpen(true);
    setPreviewChannel(null);
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

  const now = Date.now();
  const normalizedInput = query.trim();
  const searchPending = loading || normalizedInput !== debouncedQuery;
  const selectedCurrent = selected?.programmes.find(
    (programme) => programme.startMs <= now && programme.stopMs > now,
  );

  return (
    <>
    <section aria-label="Full TV guide" className="space-y-5">
      <Card frame="solid" contentProps={{ className: "p-3 sm:p-4" }}>
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

      {results.length > 0 && selected ? (
        <div className={cn("grid gap-5 transition-opacity lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start", searchPending && "opacity-45")}>
          <Card
            frame="solid"
            className={cn("overflow-hidden", mobile && "rounded-lg")}
          >
            <div className="border-b border-border px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-foreground-intense">
                Channels
              </p>
              <p className="mt-1 text-[12px] text-foreground-intense">
                Select a row to see its complete schedule.
              </p>
            </div>
            <div className="max-h-[38rem] space-y-1 overflow-y-auto p-2">
              {results.map((result) => {
                const isSelected = result.channel.url === selected.channel.url;
                const summaries = summaryProgrammes(result, now);
                return (
                  <Button variant="ghost"
                    key={`${result.channel.tvgId ?? result.channel.url}:${result.channel.url}`}
                    type="button"
                    onClick={() => selectChannel(result.channel.url)}
                    className={cn(
                      "h-auto w-full justify-start rounded-lg border px-3 py-2.5 text-left transition-colors",
                      isSelected
                        ? "border-border-strong bg-background-subtle"
                        : "border-transparent bg-background-muted hover:border-border hover:bg-background-muted",
                    )}
                    aria-pressed={isSelected}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
                        {result.channel.tvgLogo ? (
                          <img src={secureImageUrl(result.channel.tvgLogo, undefined, "logo")} alt="" className="max-h-8 max-w-8 object-contain" loading="lazy" />
                        ) : (
                          <Radio className="size-4 text-foreground-intense" aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-foreground-intense">{result.channel.name}</p>
                        <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.1em] text-foreground-intense">
                          {result.channel.groupTitle || result.channel.tvgId || "Live TV"}
                        </p>
                      </div>
                      {result.matchCount > 0 ? (
                        <span className="rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-strong">
                          {result.matchCount} {result.matchCount === 1 ? "match" : "matches"}
                        </span>
                      ) : null}
                    </div>
                    {summaries.length > 0 ? (
                      <div className="mt-2 space-y-1 border-t border-border pt-2">
                        {summaries.map((programme) => (
                          <div key={programme.id} className="flex min-w-0 gap-2 text-[11px]">
                            <span className="shrink-0 tabular-nums text-foreground-intense">{formatTime(programme.startMs)}</span>
                            <span className={cn("truncate text-foreground-intense", programme.matched && "font-semibold text-primary-strong")}>{programme.title}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </Button>
                );
              })}
            </div>
          </Card>

          <div ref={detailRef} className="min-w-0 flex-1 scroll-mt-24">
          <Card frame="glass" className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
                  {selected.channel.tvgLogo ? (
                    <img src={secureImageUrl(selected.channel.tvgLogo, undefined, "logo")} alt="" className="max-h-10 max-w-10 object-contain" />
                  ) : (
                    <Radio className="size-5 text-foreground-intense" aria-hidden />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[19px] font-semibold tracking-[-0.035em] text-foreground-intense">{selected.channel.name}</p>
                  <p className="mt-0.5 truncate text-[12px] text-foreground-intense">{selected.channel.groupTitle || "Live TV"}</p>
                </div>
              </div>
              <Button
                type="button"
                onClick={() => onPlayChannel(selected.channel)}
                variant="primary"
                size="sm"
                className="shrink-0"
              >
                <Play className="size-4 fill-current" aria-hidden />
                Play channel
              </Button>
            </div>

            <div className="flex flex-col gap-3 border-b border-border bg-background-muted px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                  <Play className="ml-0.5 size-4 fill-current text-foreground-intense" aria-hidden />
                </div>
                <div className="min-w-0">
                <p className="text-[14px] font-semibold text-foreground-intense">Live preview</p>
                {selectedCurrent ? (
                  <p className="mt-1 truncate text-[12px] text-foreground-muted">
                    On now: <span className="font-semibold text-foreground-intense">{selectedCurrent.title}</span>
                  </p>
                ) : <p className="mt-1 text-[12px] text-foreground-muted">Preview without leaving the guide.</p>}
                </div>
              </div>
              <Button
                type="button"
                onClick={() => setPreviewChannel(selected.channel)}
                size="sm"
                variant="secondary"
                className="shrink-0"
              >
                Preview
              </Button>
            </div>

            <div className="border-t border-border px-4 py-4 sm:px-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-primary-strong" aria-hidden />
                    <h2 className="text-[16px] font-semibold text-foreground-intense">Full programme guide</h2>
                  </div>
                  <p className="mt-1 text-[11px] text-foreground-intense">
                    {detailLoading
                      ? "Loading the complete schedule…"
                      : `${selected.programmes.length.toLocaleString()} upcoming and recent listings`}
                  </p>
                </div>
                {debouncedQuery && selected.matchCount > 0 ? (
                  <span className="rounded-full border border-primary bg-primary px-3 py-1.5 text-[10px] font-semibold text-primary-strong">
                    {selected.matchCount} programme {selected.matchCount === 1 ? "match" : "matches"}
                  </span>
                ) : null}
              </div>

              {detailError ? (
                <p className="mb-3 rounded-xl border border-warning bg-warning-subtle px-3 py-2 text-[11px] text-warning-strong">
                  {detailError}
                </p>
              ) : null}
              {detailLoading ? (
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-3 text-[12px] text-foreground-intense">
                  <ZendeSpinner size="tiny" label="Loading full EPG" />
                  Loading full EPG for {selected.channel.name}…
                </div>
              ) : null}

              <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                {selected.programmes.map((programme, index) => {
                  const isCurrent = programme.startMs <= now && programme.stopMs > now;
                  const showDate = index === 0 || dayKey(programme.startMs) !== dayKey(selected.programmes[index - 1]!.startMs);
                  return (
                    <div key={programme.id}>
                      {showDate ? (
                        <p className="sticky top-0 z-10 mb-2 mt-4 bg-background py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground-intense first:mt-0">
                          {dateFormatter.format(new Date(programme.startMs))}
                        </p>
                      ) : null}
                      <article
                        className={cn(
                          "rounded-lg border px-3 py-3",
                          programme.matched
                            ? "border-primary bg-primary"
                            : isCurrent
                              ? "border-border bg-background-muted"
                              : "border-border bg-background",
                        )}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                          <div className="flex shrink-0 items-center gap-2 text-[11px] tabular-nums text-foreground-intense sm:w-[118px] sm:flex-col sm:items-start sm:gap-0.5">
                            <span>{formatTime(programme.startMs)}–{formatTime(programme.stopMs)}</span>
                            <span className="flex items-center gap-1 text-[10px] text-foreground-intense">
                              <Clock3 className="size-3" aria-hidden />
                              {formatDuration(programme.startMs, programme.stopMs)}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-[13px] font-semibold text-foreground-intense">{programme.title}</h3>
                              {isCurrent ? (
                                <span className="rounded-full bg-error-subtle px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-error-strong">Live now</span>
                              ) : null}
                              {programme.matched ? (
                                <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-primary-strong">Search match</span>
                              ) : null}
                            </div>
                            {programme.description ? (
                              <p className="mt-1.5 text-[11px] leading-relaxed text-foreground-intense">{programme.description}</p>
                            ) : (
                              <p className="mt-1 text-[11px] text-foreground-intense">No programme description supplied.</p>
                            )}
                          </div>
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
          </div>
        </div>
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
    <LivePreviewDialog channel={previewChannel} onClose={() => setPreviewChannel(null)} />
    </>
  );
}
