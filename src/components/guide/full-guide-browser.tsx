"use client";

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

import { ZendeGlass } from "@/components/glass/zende-glass";
import { LivePreviewDialog } from "@/components/library/live-preview-dialog";
import { ZendeLoadingState, ZendeSpinner } from "@/components/loading/zende-spinner";
import { Button } from "@/components/ui/button";
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
    <section aria-label="Full TV guide" className="space-y-4">
      <ZendeGlass variant="panelCompact" className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/38"
              aria-hidden
            />
            <span className="sr-only">Search channels and programme guide</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search channels or programmes — TSN, tennis, US Open…"
              className="h-12 w-full rounded-full border border-white/[0.12] bg-black/30 pl-11 pr-11 text-[14px] text-white outline-none placeholder:text-white/34 focus:border-[var(--zen-signal)]/60 focus:ring-2 focus:ring-[var(--zen-signal)]/20"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-white/45 hover:bg-white/10 hover:text-white"
                aria-label="Clear guide search"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </label>
          <div className="flex shrink-0 items-center gap-2 px-2 text-[12px] text-white/48" aria-live="polite">
            {searchPending ? <ZendeSpinner size="small" label="Searching guide" /> : <Radio className="size-4 text-[var(--zen-signal)]" aria-hidden />}
            {searchPending
              ? normalizedInput
                ? `Searching “${normalizedInput}”…`
                : "Preparing provider guide…"
              : debouncedQuery
                ? `${total.toLocaleString()} matching ${total === 1 ? "channel" : "channels"}`
                : `${results.length.toLocaleString()} channels with schedules`}
          </div>
        </div>
        <p className="mt-2 px-2 text-[11px] leading-relaxed text-white/38">
          One search checks channel names, programme titles, and programme descriptions. Select a channel to inspect it; playback only starts when you use the Play button.
        </p>
      </ZendeGlass>

      {error ? (
        <ZendeGlass variant="danger" className="p-5 text-[14px]">
          {error}
        </ZendeGlass>
      ) : null}

      {searchPending ? (
        <ZendeGlass
          variant="panel"
          className="relative overflow-hidden px-5 py-7 text-center sm:px-8 sm:py-9"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(56,217,255,0.12),transparent_58%)]" />
          <div className="relative mx-auto flex max-w-[620px] flex-col items-center">
            <ZendeLoadingState
              size="large"
              label={normalizedInput ? `Searching for “${normalizedInput}”` : "Building your live guide"}
              description="Checking channel names, programme titles, and descriptions. The first provider lookup after a restart can take a few seconds."
            />
            <div className="mt-5 h-1.5 w-full max-w-[360px] overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-transparent via-[var(--zen-signal)] to-transparent" />
            </div>
          </div>
        </ZendeGlass>
      ) : null}

      {!error && !loading && results.length === 0 ? (
        <ZendeGlass variant="panel" className="p-7 text-center">
          <Search className="mx-auto size-8 text-white/30" aria-hidden />
          <p className="mt-3 text-[18px] font-semibold text-white">No matching guide entries</p>
          <p className="mt-1 text-[13px] text-white/45">
            Try a channel name, sport, event, movie, or a word from the programme description.
          </p>
        </ZendeGlass>
      ) : null}

      {results.length > 0 && selected ? (
        <div className={cn("flex flex-col gap-4 transition-opacity duration-200 lg:flex-row lg:items-start", searchPending && "opacity-45")}>
          <ZendeGlass
            variant="panelCompact"
            className={cn("overflow-hidden lg:w-[36%] lg:min-w-[320px]", mobile && "rounded-[22px]")}
          >
            <div className="border-b border-white/[0.08] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/38">
                Channels
              </p>
              <p className="mt-1 text-[12px] text-white/48">
                Select a row to see its complete schedule.
              </p>
            </div>
            <div className="max-h-[740px] space-y-1 overflow-y-auto p-2">
              {results.map((result) => {
                const isSelected = result.channel.url === selected.channel.url;
                const summaries = summaryProgrammes(result, now);
                return (
                  <button
                    key={`${result.channel.tvgId ?? result.channel.url}:${result.channel.url}`}
                    type="button"
                    onClick={() => selectChannel(result.channel.url)}
                    className={cn(
                      "w-full rounded-[18px] border px-3 py-3 text-left transition-colors",
                      isSelected
                        ? "border-[var(--zen-signal)]/45 bg-[var(--zen-signal)]/[0.1]"
                        : "border-transparent bg-white/[0.025] hover:border-white/[0.1] hover:bg-white/[0.055]",
                    )}
                    aria-pressed={isSelected}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.09] bg-black/35">
                        {result.channel.tvgLogo ? (
                          <img src={secureImageUrl(result.channel.tvgLogo, undefined, "logo")} alt="" className="max-h-8 max-w-8 object-contain" loading="lazy" />
                        ) : (
                          <Radio className="size-4 text-white/32" aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-white/90">{result.channel.name}</p>
                        <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.1em] text-white/34">
                          {result.channel.groupTitle || result.channel.tvgId || "Live TV"}
                        </p>
                      </div>
                      {result.matchCount > 0 ? (
                        <span className="rounded-full bg-[var(--zen-signal)]/15 px-2 py-1 text-[10px] font-semibold text-[var(--zen-signal)]">
                          {result.matchCount} {result.matchCount === 1 ? "match" : "matches"}
                        </span>
                      ) : null}
                    </div>
                    {summaries.length > 0 ? (
                      <div className="mt-2 space-y-1 border-t border-white/[0.06] pt-2">
                        {summaries.map((programme) => (
                          <div key={programme.id} className="flex min-w-0 gap-2 text-[11px]">
                            <span className="shrink-0 tabular-nums text-white/34">{formatTime(programme.startMs)}</span>
                            <span className={cn("truncate text-white/54", programme.matched && "font-semibold text-[var(--zen-signal)]")}>{programme.title}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </ZendeGlass>

          <div ref={detailRef} className="min-w-0 flex-1 scroll-mt-24">
          <ZendeGlass variant="panel" className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-white/[0.09] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[15px] border border-white/[0.1] bg-black/35">
                  {selected.channel.tvgLogo ? (
                    <img src={secureImageUrl(selected.channel.tvgLogo, undefined, "logo")} alt="" className="max-h-10 max-w-10 object-contain" />
                  ) : (
                    <Radio className="size-5 text-white/35" aria-hidden />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[19px] font-semibold tracking-[-0.035em] text-white">{selected.channel.name}</p>
                  <p className="mt-0.5 truncate text-[12px] text-white/42">{selected.channel.groupTitle || "Live TV"}</p>
                </div>
              </div>
              <Button
                type="button"
                onClick={() => onPlayChannel(selected.channel)}
                variant="success"
                size="sm"
                className="shrink-0"
              >
                <Play className="size-4 fill-current" aria-hidden />
                Play channel
              </Button>
            </div>

            <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 border-b border-white/[0.08] bg-black/45 px-6 py-8 text-center sm:min-h-[220px]">
              <div className="flex size-12 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06]">
                <Play className="ml-0.5 size-5 fill-current text-white/75" aria-hidden />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-white/88">Live preview</p>
                <p className="mt-1 text-[11px] text-white/38">
                  Uses the same preview player as Library search.
                </p>
                {selectedCurrent ? (
                  <p className="mt-2 text-[12px] text-white/62">
                    On now: <span className="font-semibold text-white/88">{selectedCurrent.title}</span>
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                onClick={() => setPreviewChannel(selected.channel)}
                size="sm"
              >
                Open live preview
              </Button>
            </div>

            <div className="border-t border-white/[0.08] px-4 py-4 sm:px-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-[var(--zen-signal)]" aria-hidden />
                    <h2 className="text-[16px] font-semibold text-white">Full programme guide</h2>
                  </div>
                  <p className="mt-1 text-[11px] text-white/38">
                    {detailLoading
                      ? "Loading the complete schedule…"
                      : `${selected.programmes.length.toLocaleString()} upcoming and recent listings`}
                  </p>
                </div>
                {debouncedQuery && selected.matchCount > 0 ? (
                  <span className="rounded-full border border-[var(--zen-signal)]/25 bg-[var(--zen-signal)]/[0.08] px-3 py-1.5 text-[10px] font-semibold text-[var(--zen-signal)]">
                    {selected.matchCount} programme {selected.matchCount === 1 ? "match" : "matches"}
                  </span>
                ) : null}
              </div>

              {detailError ? (
                <p className="mb-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-[11px] text-amber-100/75">
                  {detailError}
                </p>
              ) : null}
              {detailLoading ? (
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-3 text-[12px] text-white/45">
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
                        <p className="sticky top-0 z-10 mb-2 mt-4 bg-[rgba(13,17,22,0.94)] py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/38 first:mt-0">
                          {dateFormatter.format(new Date(programme.startMs))}
                        </p>
                      ) : null}
                      <article
                        className={cn(
                          "rounded-[17px] border px-3 py-3",
                          programme.matched
                            ? "border-[var(--zen-signal)]/38 bg-[var(--zen-signal)]/[0.09]"
                            : isCurrent
                              ? "border-white/[0.16] bg-white/[0.075]"
                              : "border-white/[0.07] bg-black/20",
                        )}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                          <div className="flex shrink-0 items-center gap-2 text-[11px] tabular-nums text-white/46 sm:w-[118px] sm:flex-col sm:items-start sm:gap-0.5">
                            <span>{formatTime(programme.startMs)}–{formatTime(programme.stopMs)}</span>
                            <span className="flex items-center gap-1 text-[10px] text-white/30">
                              <Clock3 className="size-3" aria-hidden />
                              {formatDuration(programme.startMs, programme.stopMs)}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-[13px] font-semibold text-white/90">{programme.title}</h3>
                              {isCurrent ? (
                                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-red-200">Live now</span>
                              ) : null}
                              {programme.matched ? (
                                <span className="rounded-full bg-[var(--zen-signal)]/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--zen-signal)]">Search match</span>
                              ) : null}
                            </div>
                            {programme.description ? (
                              <p className="mt-1.5 text-[11px] leading-relaxed text-white/46">{programme.description}</p>
                            ) : (
                              <p className="mt-1 text-[11px] text-white/28">No programme description supplied.</p>
                            )}
                          </div>
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>
            </div>
          </ZendeGlass>
          </div>
        </div>
      ) : null}
    </section>
    {detailOpen && selectedSummary && typeof document !== "undefined" ? createPortal((
      <div
        className="guide-fullscreen-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Full guide for ${selectedSummary.channel.name}`}
      >
        <header className="guide-fullscreen-dialog__header sticky top-0 z-20 border-b border-white/[0.09] bg-[rgba(7,10,14,0.94)] px-4 py-3 backdrop-blur-2xl sm:px-6">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-white/[0.1] bg-black/40">
                {selectedSummary.channel.tvgLogo ? (
                  <img src={secureImageUrl(selectedSummary.channel.tvgLogo, undefined, "logo")} alt="" className="max-h-9 max-w-9 object-contain" />
                ) : (
                  <Radio className="size-4 text-white/35" aria-hidden />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--zen-signal)]">Full channel guide</p>
                <h2 className="truncate text-[17px] font-semibold tracking-[-0.03em] sm:text-[20px]">
                  {selectedSummary.channel.name}
                </h2>
                <p className="truncate text-[11px] text-white/38">
                  {selectedSummary.channel.groupTitle || "Live TV"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                onClick={() => onPlayChannel(selectedSummary.channel)}
                variant="success"
                size="sm"
                className="hidden sm:inline-flex"
              >
                <Play className="size-3.5 fill-current" aria-hidden />
                Play channel
              </Button>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="rounded-full border border-white/[0.12] bg-white/[0.06] p-2.5 text-white/70 hover:bg-white/[0.12] hover:text-white"
                aria-label="Close full channel guide"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
          </div>
        </header>

        <main className="guide-fullscreen-dialog__content mx-auto grid max-w-[1600px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-2 lg:items-start lg:gap-7 lg:py-7">
          <section aria-label="Live preview" className="lg:sticky lg:top-[92px]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/38">Live preview</p>
                <p className="mt-1 text-[11px] text-white/34">Loads independently from the programme guide.</p>
              </div>
              <Button
                type="button"
                onClick={() => onPlayChannel(selectedSummary.channel)}
                variant="success"
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
                  <CalendarDays className="size-4 text-[var(--zen-signal)]" aria-hidden />
                  <h3 className="text-[17px] font-semibold">Complete EPG</h3>
                </div>
                <p className="mt-1 text-[11px] text-white/38">
                  {detailLoading
                    ? "Loading asynchronously…"
                    : detailResult
                      ? `${detailResult.programmes.length.toLocaleString()} available listings`
                      : "Programme information"}
                </p>
              </div>
              {detailResult && debouncedQuery && detailResult.matchCount > 0 ? (
                <span className="rounded-full border border-[var(--zen-signal)]/25 bg-[var(--zen-signal)]/[0.08] px-3 py-1.5 text-[10px] font-semibold text-[var(--zen-signal)]">
                  {detailResult.matchCount} {detailResult.matchCount === 1 ? "match" : "matches"}
                </span>
              ) : null}
            </div>

            {detailLoading ? (
              <div className="space-y-2" aria-label="Loading complete EPG">
                <div className="flex items-center gap-2 rounded-[18px] border border-white/[0.08] bg-white/[0.035] px-4 py-4 text-[12px] text-white/50">
                  <ZendeSpinner size="tiny" label="Loading complete EPG" />
                  Loading the full schedule for {selectedSummary.channel.name}…
                </div>
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="h-[82px] animate-pulse rounded-[18px] bg-white/[0.035]" />
                ))}
              </div>
            ) : detailError ? (
              <p className="rounded-[18px] border border-amber-300/15 bg-amber-300/[0.06] px-4 py-4 text-[12px] text-amber-100/80">
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
                        <p className="sticky top-[76px] z-10 mb-2 mt-5 bg-[rgba(7,10,14,0.94)] py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40 first:mt-0">
                          {dateFormatter.format(new Date(programme.startMs))}
                        </p>
                      ) : null}
                      <article
                        className={cn(
                          "rounded-[18px] border px-4 py-3",
                          programme.matched
                            ? "border-[var(--zen-signal)]/40 bg-[var(--zen-signal)]/[0.09]"
                            : isCurrent
                              ? "border-white/[0.17] bg-white/[0.075]"
                              : "border-white/[0.07] bg-white/[0.025]",
                        )}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                          <div className="shrink-0 text-[11px] tabular-nums text-white/42 sm:w-[125px]">
                            <p>{formatTime(programme.startMs)}–{formatTime(programme.stopMs)}</p>
                            <p className="mt-1 flex items-center gap-1 text-[10px] text-white/28">
                              <Clock3 className="size-3" aria-hidden />
                              {formatDuration(programme.startMs, programme.stopMs)}
                            </p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-[13px] font-semibold text-white/90">{programme.title}</h4>
                              {isCurrent ? <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-red-200">Live now</span> : null}
                              {programme.matched ? <span className="rounded-full bg-[var(--zen-signal)]/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--zen-signal)]">Search match</span> : null}
                            </div>
                            <p className="mt-1.5 text-[11px] leading-relaxed text-white/45">
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
              <p className="rounded-[18px] border border-white/[0.07] bg-white/[0.025] px-4 py-4 text-[12px] text-white/45">
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
