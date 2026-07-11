"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CircleStop,
  Download,
  Loader2,
  Play,
  Radio,
  Search,
  Trash2,
  Video,
  X,
} from "lucide-react";

import { ZendeGlass } from "@/components/glass/zende-glass";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
import {
  TvRecordingRecentIssues,
  type RecordingIssueItem,
} from "@/components/tv/tv-recording-recent-issues";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { createClientLogger } from "@/core/logging/client";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { useChannelSearch } from "@/features/iptv/use-channel-search";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { RECORDING_ENCODER_GONE_CODE } from "@/lib/recordings/recording-api-codes";
import { useRemoteNavigation } from "@/lib/navigation/use-remote-navigation";
import { cn } from "@/lib/utils";

const log = createClientLogger("shell.MobileRecordingsPage");
const source = BUILTIN_PLAYLIST_SOURCES[0]!;

type ApiSchedule = {
  id: string;
  channelName: string;
  channelGroup: string | null;
  startsAt: string;
  endsAt: string;
};

type ApiActive = {
  id: string;
  channelName: string;
  channelGroup: string | null;
  startedAt: string | null;
  plannedEndsAt: string;
};

type ApiLibraryItem = {
  id: string;
  channelName: string;
  channelLogo: string | null;
  channelGroup: string | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  plannedSeconds: number | null;
  sizeBytes: string | null;
  scheduleId: string | null;
  error: string | null;
};

type OverviewPayload = {
  ffmpegAvailable: boolean;
  schedules: ApiSchedule[];
  active: ApiActive[];
  library: ApiLibraryItem[];
  recentFailures: RecordingIssueItem[];
};

function toDatetimeLocalValue(d: Date): string {
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatRange(startIso: string, endIso: string): string {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(startIso))} to ${formatter.format(new Date(endIso))}`;
}

function formatBytes(n: string | null): string {
  if (!n) return "—";
  const value = BigInt(n);
  if (value < BigInt(1024)) return `${value} B`;
  const kb = Number(value) / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function mobileLibraryFailSummary(error: string | null): string {
  if (!error?.trim()) return "Recording failed — no server message was stored.";
  const line = error.split(/\r?\n/).find((l) => l.trim())?.trim() ?? error.trim();
  return line.length > 140 ? `${line.slice(0, 137)}…` : line;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function MobileRecordingsPage() {
  const { onNavigateClick } = useRemoteNavigation();
  const [channelQuery, setChannelQuery] = useState("");
  const { catalogLoaded } = useCatalogBootstrap(source);
  const { channels: searchChannels } = useChannelSearch(channelQuery, 24);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stuckStopDialog, setStuckStopDialog] = useState<{
    id: string;
    channelName: string;
    message: string;
  } | null>(null);
  const [stuckStopError, setStuckStopError] = useState<string | null>(null);
  const [libraryDeleteTarget, setLibraryDeleteTarget] =
    useState<ApiLibraryItem | null>(null);
  const [libraryDeleteError, setLibraryDeleteError] = useState<string | null>(
    null,
  );
  const [selected, setSelected] = useState<M3uChannel | null>(null);
  const [tab, setTab] = useState<"schedule" | "now">("schedule");
  const [startLocal, setStartLocal] = useState(() =>
    toDatetimeLocalValue(new Date()),
  );
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [nowDuration, setNowDuration] = useState(30);

  const load = useCallback(async () => {
    try {
      const res = await zendeFetch("/api/recordings/overview");
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setLoadError(body?.error ?? `Request failed (${res.status})`);
        return;
      }
      setOverview((await res.json()) as OverviewPayload);
      setLoadError(null);
    } catch (error) {
      log.error("overview_failed", { err: String(error) });
      setLoadError("Could not load recordings.");
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      startTransition(() => {
        void load();
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!stuckStopDialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setStuckStopDialog(null);
        setStuckStopError(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stuckStopDialog]);

  useEffect(() => {
    if (!libraryDeleteTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLibraryDeleteTarget(null);
        setLibraryDeleteError(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [libraryDeleteTarget]);

  const filteredChannels = searchChannels;

  const submitSchedule = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const startsAt = new Date(startLocal).toISOString();
      const res = await zendeFetch("/api/recordings/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelUrl: selected.url,
          channelName: parseChannelLabel(selected.name).displayName,
          channelLogo: selected.tvgLogo ?? null,
          channelGroup: selected.groupTitle ?? null,
          startsAt,
          durationMinutes,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: unknown };
        setActionError(typeof body?.error === "string" ? body.error : "Could not create schedule.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const submitNow = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await zendeFetch("/api/recordings/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelUrl: selected.url,
          channelName: parseChannelLabel(selected.name).displayName,
          channelLogo: selected.tvgLogo ?? null,
          channelGroup: selected.groupTitle ?? null,
          durationMinutes: nowDuration,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: unknown };
        setActionError(typeof body?.error === "string" ? body.error : "Could not start recording.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const stopRecording = async (id: string) => {
    setBusy(true);
    try {
      const meta = overview?.active.find((a) => a.id === id);
      const res = await zendeFetch(`/api/recordings/${id}/stop`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: unknown;
          code?: unknown;
        };
        const msg =
          typeof body?.error === "string" ? body.error : "Stop failed.";
        if (body?.code === RECORDING_ENCODER_GONE_CODE) {
          setStuckStopError(null);
          setStuckStopDialog({
            id,
            channelName: meta?.channelName ?? "Recording",
            message: msg,
          });
          return;
        }
        setActionError(msg);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const forceRemoveStuckRecording = async () => {
    if (!stuckStopDialog) return;
    setStuckStopError(null);
    setBusy(true);
    try {
      const res = await zendeFetch(
        `/api/recordings/${encodeURIComponent(stuckStopDialog.id)}?force=1`,
        { method: "DELETE" },
      );
      const body = (await res.json().catch(() => null)) as { error?: unknown };
      if (!res.ok) {
        setStuckStopError(
          typeof body?.error === "string" ? body.error : "Remove failed.",
        );
        return;
      }
      setStuckStopDialog(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const cancelSchedule = async (id: string) => {
    if (!confirm("Cancel this scheduled recording?")) return;
    setBusy(true);
    try {
      const res = await zendeFetch(`/api/recordings/schedules/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) setActionError("Cancel failed.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const downloadRecording = async (item: ApiLibraryItem) => {
    if (item.status === "FAILED") return;
    const res = await zendeFetch(`/api/recordings/${item.id}/download`);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: unknown };
      setActionError(
        typeof body?.error === "string" ? body.error : "Download failed.",
      );
      return;
    }
    const blob = await res.blob();
    const safe = `${item.channelName.replace(/[^\w\s-]/g, "").trim().slice(0, 64) || "recording"}.mp4`;
    downloadBlob(safe, blob);
  };

  const confirmDeleteLibraryRecording = async () => {
    if (!libraryDeleteTarget) return;
    setLibraryDeleteError(null);
    setBusy(true);
    try {
      const res = await zendeFetch(
        `/api/recordings/${encodeURIComponent(libraryDeleteTarget.id)}`,
        { method: "DELETE" },
      );
      const body = (await res.json().catch(() => null)) as { error?: unknown };
      if (!res.ok) {
        setLibraryDeleteError(
          typeof body?.error === "string" ? body.error : "Delete failed.",
        );
        return;
      }
      setLibraryDeleteTarget(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!catalogLoaded) {
    return (
      <div className="zen-page-bg flex min-h-screen items-center justify-center px-4 text-white/45">
        <p className="text-[15px] font-medium">Loading…</p>
      </div>
    );
  }

  return (
    <>
    <main className="zen-page-bg min-h-screen pb-28 pt-[5.35rem] text-foreground">
      <section className="px-4">
        <div
          className={cn(
            "rounded-[24px] border border-white/[0.11] bg-white/[0.055] px-4 py-3 ring-1 ring-white/[0.05]",
            "backdrop-blur-xl motion-safe:animate-zen-shell-in motion-reduce:animate-none motion-reduce:opacity-100",
          )}
        >
          <p className="zen-kicker text-[10px]">
            Zende
          </p>
          <h1 className="mt-1 text-[1.45rem] font-semibold leading-none tracking-[-0.055em] text-white sm:text-[1.55rem]">
            Recordings
          </h1>
          <p className="mt-1.5 max-w-[36ch] text-[11.5px] leading-snug text-white/42">
            Schedule, monitor encodes, play or download MP4s — controls below.
          </p>
        </div>
      </section>

      <div className="mt-3 space-y-5 px-4">
        {overview && !overview.ffmpegAvailable ? (
          <div className="flex gap-3 rounded-[24px] border border-amber-400/25 bg-amber-500/[0.09] p-4 text-[14px] leading-relaxed text-amber-100/90">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" aria-hidden />
            <p>ffmpeg is not available on the host, so recordings cannot start.</p>
          </div>
        ) : null}

        {loadError ? (
          <div className="rounded-[24px] border border-red-400/20 bg-red-500/10 p-4 text-[14px] text-red-100/90">
            {loadError}
          </div>
        ) : null}

        {!overview && !loadError ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[15px] text-white/45">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            Loading library…
          </div>
        ) : null}

        <ZendeGlass
          variant="panel"
          className="rounded-[30px] border-white/[0.1] bg-white/[0.05] p-4"
        >
          <h2 className="text-[20px] font-semibold text-white">Pick a channel</h2>
          <label className="relative mt-3 block">
            <span className="sr-only">Find channel</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/35" />
            <input
              value={channelQuery}
              onChange={(event) => setChannelQuery(event.target.value)}
              placeholder="Search channel or group"
              className="h-12 w-full rounded-[20px] border border-white/[0.11] bg-black/35 pl-11 pr-3 text-[16px] text-white outline-none placeholder:text-white/34 focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]/60"
            />
          </label>

          <div className="tv-row-scroll zen-stagger-row mt-3 flex gap-2 overflow-x-auto pb-1">
            {filteredChannels.map((channel) => {
              const label = parseChannelLabel(channel.name).displayName;
              const active = selected?.url === channel.url;
              return (
                <button
                  key={channel.url}
                  type="button"
                  onClick={() => setSelected(channel)}
                  className={cn(
                    "min-h-[74px] w-[220px] shrink-0 rounded-2xl border px-3 py-2 text-left",
                    active
                      ? "border-white/30 bg-white/[0.14]"
                      : "border-white/[0.08] bg-white/[0.05]",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/[0.07]">
                      {channel.tvgLogo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={channel.tvgLogo} alt="" className="max-h-8 max-w-9 object-contain" loading="lazy" />
                      ) : (
                        <Video className="size-4 text-white/40" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-white">
                        {label}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-white/42">
                        {channel.groupTitle ?? "Uncategorized"}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/[0.08] bg-black/20 p-1">
            {(
              [
                ["schedule", "Schedule", CalendarClock],
                ["now", "Now", Radio],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-xl text-[14px] font-semibold",
                  tab === id ? "bg-[var(--zen-frost)] text-[var(--zen-void)]" : "text-white/55",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>

          {selected ? (
            <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/25 p-3">
              <p className="truncate text-[15px] font-semibold text-white">
                {parseChannelLabel(selected.name).displayName}
              </p>
              <p className="mt-1 truncate text-[13px] text-white/42">
                {selected.groupTitle ?? "Uncategorized"}
              </p>
            </div>
          ) : null}

          {tab === "schedule" ? (
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5 text-[13px] font-medium text-white/50">
                Start
                <input
                  type="datetime-local"
                  value={startLocal}
                  onChange={(event) => setStartLocal(event.target.value)}
                  className="h-12 rounded-2xl border border-white/[0.1] bg-black/35 px-3 text-[16px] text-white outline-none"
                />
              </label>
              <label className="grid gap-1.5 text-[13px] font-medium text-white/50">
                Duration minutes
                <input
                  type="number"
                  min={1}
                  max={480}
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(Number(event.target.value) || 1)}
                  className="h-12 rounded-2xl border border-white/[0.1] bg-black/35 px-3 text-[16px] text-white outline-none"
                />
              </label>
              <button
                type="button"
                disabled={busy || !selected || (overview !== null && !overview.ffmpegAvailable)}
                onClick={() => void submitSchedule()}
                className="flex min-h-[52px] items-center justify-center rounded-full bg-[var(--zen-frost)] text-[15px] font-semibold text-[var(--zen-void)] disabled:opacity-45"
              >
                {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : "Add schedule"}
              </button>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5 text-[13px] font-medium text-white/50">
                Duration minutes
                <input
                  type="number"
                  min={1}
                  max={480}
                  value={nowDuration}
                  onChange={(event) => setNowDuration(Number(event.target.value) || 1)}
                  className="h-12 rounded-2xl border border-white/[0.1] bg-black/35 px-3 text-[16px] text-white outline-none"
                />
              </label>
              <button
                type="button"
                disabled={busy || !selected || (overview !== null && !overview.ffmpegAvailable)}
                onClick={() => void submitNow()}
                className="flex min-h-[52px] items-center justify-center rounded-2xl bg-rose-500 text-[15px] font-semibold text-white disabled:opacity-45"
              >
                {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : "Start recording"}
              </button>
            </div>
          )}
        </ZendeGlass>

        {overview?.active.length ? (
          <section aria-labelledby="mobile-active-recordings">
            <h2 id="mobile-active-recordings" className="text-[20px] font-semibold text-white">
              Recording now
            </h2>
            <div className="mt-3 grid gap-3">
              {overview.active.map((recording) => (
                <div key={recording.id} className="rounded-[24px] border border-rose-400/20 bg-rose-500/[0.07] p-4">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-rose-200/85">
                    Live
                  </p>
                  <p className="mt-2 truncate text-[16px] font-semibold text-white">
                    {recording.channelName}
                  </p>
                  <p className="mt-1 text-[13px] text-white/45">
                    Until {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(recording.plannedEndsAt))}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void stopRecording(recording.id)}
                    className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[14px] font-semibold text-zinc-950 disabled:opacity-45"
                  >
                    <CircleStop className="size-4" aria-hidden />
                    Stop and save
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {overview?.schedules.length ? (
          <section aria-labelledby="mobile-upcoming-recordings">
            <h2 id="mobile-upcoming-recordings" className="text-[20px] font-semibold text-white">
              Upcoming
            </h2>
            <div className="mt-3 grid gap-3">
              {overview.schedules.map((schedule) => (
                <div key={schedule.id} className="rounded-[24px] border border-white/[0.08] bg-white/[0.04] p-4">
                  <p className="truncate text-[16px] font-semibold text-white">
                    {schedule.channelName}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-white/45">
                    {formatRange(schedule.startsAt, schedule.endsAt)}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancelSchedule(schedule.id)}
                    className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.12] bg-white/[0.06] text-[14px] font-semibold text-white/80 disabled:opacity-45"
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {overview ? (
          <section aria-labelledby="mobile-recording-library">
            <h2 id="mobile-recording-library" className="text-[20px] font-semibold text-white">
              Finished recordings
            </h2>
            {overview.library.length === 0 ? (
              <p className="mt-3 text-[15px] leading-relaxed text-white/45">
                Finished recordings and failed captures appear here. Failed rows
                show the server error and cannot be played or downloaded.
              </p>
            ) : (
              <div className="mt-3 grid gap-3 zen-stagger-row">
                {overview.library.map((item) => {
                  const isFailed = item.status === "FAILED";
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-[24px] border bg-white/[0.04] p-4",
                        isFailed ? "border-red-400/25 bg-red-500/[0.04]" : "border-white/[0.08]",
                      )}
                    >
                      <div className="flex gap-3">
                        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/[0.06] ring-1 ring-white/[0.08]">
                          {item.channelLogo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.channelLogo}
                              alt=""
                              className="size-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <Video className="size-5 text-white/35" aria-hidden />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[16px] font-semibold text-white">
                            {item.channelName}
                          </p>
                          <p className="mt-1 text-[13px] text-white/45">
                            {item.endedAt
                              ? new Intl.DateTimeFormat(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                }).format(new Date(item.endedAt))
                              : "—"}{" "}
                            · {formatBytes(item.sizeBytes)} ·{" "}
                            <span
                              className={cn(
                                isFailed ? "text-red-200/90" : "text-white/55",
                              )}
                            >
                              {isFailed
                                ? "Failed"
                                : item.status === "STOPPED_EARLY"
                                  ? "Stopped early"
                                  : "Complete"}
                            </span>
                          </p>
                          {isFailed ? (
                            <p
                              className="mt-2 line-clamp-4 text-[12px] leading-snug text-red-200/75"
                              title={item.error ?? undefined}
                            >
                              {mobileLibraryFailSummary(item.error)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-col gap-2">
                        {isFailed ? (
                          <div
                            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 text-[14px] font-semibold text-red-100/85"
                            role="status"
                          >
                            <AlertTriangle className="size-4 shrink-0" aria-hidden />
                            Encode failed
                          </div>
                        ) : (
                          <Link
                            href={`/watch?recording=${encodeURIComponent(item.id)}`}
                            onClick={onNavigateClick(
                              `/watch?recording=${encodeURIComponent(item.id)}`,
                            )}
                            className={cn(
                              "flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 text-[14px] font-semibold text-emerald-100",
                              "outline-none transition-colors hover:bg-emerald-500/25",
                            )}
                          >
                            <Play className="size-4" aria-hidden />
                            Play
                          </Link>
                        )}
                        <button
                          type="button"
                          disabled={busy || isFailed}
                          onClick={() => void downloadRecording(item)}
                          className={cn(
                            "flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.12] bg-white/[0.08] text-[14px] font-semibold text-white outline-none transition-colors",
                            "hover:bg-white/[0.12] disabled:opacity-45",
                          )}
                        >
                          <Download className="size-4" aria-hidden />
                          Download MP4
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setLibraryDeleteError(null);
                            setLibraryDeleteTarget(item);
                          }}
                          className={cn(
                            "flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-red-400/25 bg-red-500/10 text-[14px] font-semibold text-red-100 outline-none transition-colors",
                            "hover:bg-red-500/15 disabled:opacity-45",
                          )}
                        >
                          <Trash2 className="size-4" aria-hidden />
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {overview && overview.recentFailures.length > 0 ? (
          <TvRecordingRecentIssues issues={overview.recentFailures} onRefresh={load} />
        ) : null}
      </div>

      {libraryDeleteTarget ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center px-4 pb-8 pt-10 sm:items-center"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Dismiss"
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => {
              setLibraryDeleteTarget(null);
              setLibraryDeleteError(null);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-lib-del-title"
            className="relative z-10 w-full max-w-md rounded-[24px] border border-white/[0.12] bg-zinc-950/95 p-5 shadow-2xl ring-1 ring-white/[0.06]"
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="mobile-lib-del-title"
                className="text-[17px] font-semibold text-white"
              >
                Remove recording?
              </h2>
              <button
                type="button"
                className="rounded-lg p-2 text-white/40 hover:bg-white/[0.08]"
                aria-label="Close"
                onClick={() => {
                  setLibraryDeleteTarget(null);
                  setLibraryDeleteError(null);
                }}
              >
                <X className="size-5" />
              </button>
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-white/55">
              This deletes{" "}
              <span className="font-medium text-white/85">
                {libraryDeleteTarget.channelName}
              </span>{" "}
              from the server permanently, including the MP4 file. This cannot be undone.
            </p>
            {libraryDeleteError ? (
              <p className="mt-3 text-[14px] text-red-300">{libraryDeleteError}</p>
            ) : null}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={busy}
                className="min-h-11 rounded-2xl border border-white/[0.12] bg-white/[0.06] text-[14px] font-medium text-white/75 disabled:opacity-45"
                onClick={() => {
                  setLibraryDeleteTarget(null);
                  setLibraryDeleteError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmDeleteLibraryRecording()}
                className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-red-400/30 bg-red-500/20 text-[14px] font-semibold text-red-100 disabled:opacity-45"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="size-4" aria-hidden />
                )}
                Remove from server
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {stuckStopDialog ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center px-4 pb-8 pt-10 sm:items-center"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Dismiss"
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => {
              setStuckStopDialog(null);
              setStuckStopError(null);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-stuck-stop-title"
            className="relative z-10 w-full max-w-md rounded-[24px] border border-amber-400/25 bg-zinc-950/95 p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <AlertTriangle
                  className="mt-0.5 size-5 shrink-0 text-amber-300"
                  aria-hidden
                />
                <h2
                  id="mobile-stuck-stop-title"
                  className="text-[17px] font-semibold leading-snug text-white"
                >
                  Stop unavailable
                </h2>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-white/40 hover:bg-white/[0.08]"
                aria-label="Close"
                onClick={() => {
                  setStuckStopDialog(null);
                  setStuckStopError(null);
                }}
              >
                <X className="size-5" />
              </button>
            </div>
            <p className="mt-2 text-[15px] font-medium text-white/90">
              {stuckStopDialog.channelName}
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-white/55">
              {stuckStopDialog.message}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-white/45">
              Remove this listing and any partial file if the encoder is already gone.
            </p>
            {stuckStopError ? (
              <p className="mt-2 text-[13px] text-red-300">{stuckStopError}</p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={busy}
                className="min-h-11 rounded-2xl border border-white/[0.12] bg-white/[0.06] text-[14px] font-semibold text-white/80 disabled:opacity-45"
                onClick={() => {
                  setStuckStopDialog(null);
                  setStuckStopError(null);
                }}
              >
                Close
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void forceRemoveStuckRecording()}
                className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-amber-400/35 bg-amber-500/25 text-[14px] font-semibold text-amber-50 disabled:opacity-45"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="size-4" aria-hidden />
                )}
                Force remove
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
    {actionError ? (
      <NavErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
    ) : null}
    </>
  );
}
