"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, startTransition } from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import {
  TvRecordingRecentIssues,
  type RecordingIssueItem,
} from "@/components/tv/tv-recording-recent-issues";
import {
  TV_BROWSE_STICKY_TOP_CLASS,
  TV_BROWSE_TOP_PAD_CLASS,
} from "@/components/tv/tv-top-bar";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { createClientLogger } from "@/core/logging/client";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CalendarClock,
  CircleStop,
  Download,
  Loader2,
  Pencil,
  Play,
  Plus,
  Radio,
  Search,
  Trash2,
  Video,
  X,
} from "lucide-react";

const log = createClientLogger("shell.TvRecordingsPage");
const source = BUILTIN_PLAYLIST_SOURCES[0]!;

type ApiSchedule = {
  id: string;
  channelUrl: string;
  channelName: string;
  channelLogo: string | null;
  channelGroup: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  createdAt: string;
};

type ApiActive = {
  id: string;
  channelUrl: string;
  channelName: string;
  channelLogo: string | null;
  channelGroup: string | null;
  startedAt: string | null;
  plannedSeconds: number | null;
  plannedEndsAt: string;
  scheduleId: string | null;
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
};

type OverviewPayload = {
  ffmpegAvailable: boolean;
  schedules: ApiSchedule[];
  active: ApiActive[];
  library: ApiLibraryItem[];
  recentFailures: RecordingIssueItem[];
};

function formatBytes(n: string | null): string {
  if (!n) return "—";
  const v = BigInt(n);
  if (v < BigInt(1024)) return `${v} B`;
  const kb = Number(v) / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const dtf = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dtf.format(s)} → ${dtf.format(e)}`;
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

export function TvRecordingsPage() {
  const { channels, catalogLoaded } = useCatalogBootstrap(source);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [channelQuery, setChannelQuery] = useState("");
  const [selected, setSelected] = useState<M3uChannel | null>(null);

  const [tab, setTab] = useState<"schedule" | "now">("schedule");
  const [startLocal, setStartLocal] = useState(() =>
    toDatetimeLocalValue(new Date()),
  );
  const [endMode, setEndMode] = useState<"end" | "duration">("duration");
  const [endLocal, setEndLocal] = useState(() =>
    toDatetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)),
  );
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [nowDuration, setNowDuration] = useState(30);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editEndMode, setEditEndMode] = useState<"end" | "duration">("end");
  const [editDuration, setEditDuration] = useState(60);

  const [nowMs, setNowMs] = useState<number | null>(null);

  const [startRecordingDialogOpen, setStartRecordingDialogOpen] =
    useState(false);
  const [libraryDeleteTarget, setLibraryDeleteTarget] =
    useState<ApiLibraryItem | null>(null);
  const [libraryDeleteError, setLibraryDeleteError] = useState<string | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const res = await zendeFetch("/api/recordings/overview");
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setLoadError(j?.error ?? `Request failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as OverviewPayload;
      setOverview(data);
      setLoadError(null);
    } catch (e) {
      log.error("overview_failed", { err: String(e) });
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
    const tick = () => {
      setNowMs(Date.now());
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const filteredChannels = useMemo(() => {
    const q = channelQuery.trim().toLowerCase();
    let list = channels;
    if (q) {
      list = list.filter((c) => {
        const label = parseChannelLabel(c.name).displayName.toLowerCase();
        const g = (c.groupTitle ?? "").toLowerCase();
        return label.includes(q) || g.includes(q);
      });
    }
    return list.slice(0, 24);
  }, [channels, channelQuery]);

  const beginEdit = (s: ApiSchedule) => {
    setEditingId(s.id);
    setEditStart(toDatetimeLocalValue(new Date(s.startsAt)));
    setEditEnd(toDatetimeLocalValue(new Date(s.endsAt)));
    setEditEndMode("end");
    const mins = Math.round(
      (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60_000,
    );
    setEditDuration(Math.max(1, mins));
  };

  const submitSchedule = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const startsAt = new Date(startLocal).toISOString();
      const base = {
        channelUrl: selected.url,
        channelName: parseChannelLabel(selected.name).displayName,
        channelLogo: selected.tvgLogo ?? null,
        channelGroup: selected.groupTitle ?? null,
        startsAt,
      };
      const body =
        endMode === "duration"
          ? { ...base, durationMinutes }
          : { ...base, endsAt: new Date(endLocal).toISOString() };
      const res = await zendeFetch("/api/recordings/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: unknown };
        const msg =
          typeof j?.error === "string" ? j.error : "Could not create schedule.";
        alert(msg);
        return;
      }
      setStartLocal(toDatetimeLocalValue(new Date()));
      setStartRecordingDialogOpen(false);
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
        const j = (await res.json().catch(() => null)) as { error?: unknown };
        const msg =
          typeof j?.error === "string" ? j.error : "Could not start recording.";
        alert(msg);
        return;
      }
      setStartRecordingDialogOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setBusy(true);
    try {
      const startsAt = new Date(editStart).toISOString();
      const body: Record<string, unknown> = {
        startsAt,
      };
      if (editEndMode === "duration") {
        const endsAt = new Date(
          new Date(editStart).getTime() + editDuration * 60_000,
        ).toISOString();
        body.endsAt = endsAt;
      } else {
        body.endsAt = new Date(editEnd).toISOString();
      }
      const res = await zendeFetch(`/api/recordings/schedules/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: unknown };
        alert(typeof j?.error === "string" ? j.error : "Update failed.");
        return;
      }
      setEditingId(null);
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
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: unknown };
        alert(typeof j?.error === "string" ? j.error : "Cancel failed.");
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
      const res = await zendeFetch(`/api/recordings/${id}/stop`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: unknown };
        alert(typeof j?.error === "string" ? j.error : "Stop failed.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const downloadRecording = async (item: ApiLibraryItem) => {
    const res = await zendeFetch(`/api/recordings/${item.id}/download`);
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: unknown };
      alert(typeof j?.error === "string" ? j.error : "Download failed.");
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
      const j = (await res.json().catch(() => null)) as { error?: unknown };
      if (!res.ok) {
        setLibraryDeleteError(
          typeof j?.error === "string" ? j.error : "Delete failed.",
        );
        return;
      }
      setLibraryDeleteTarget(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!startRecordingDialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStartRecordingDialogOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startRecordingDialogOpen]);

  if (!catalogLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--tv-page-bg)] pt-20 text-white/45">
        <p className="text-[15px] font-medium">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--tv-page-bg)] text-foreground">
      <main className={cn("pb-28", TV_BROWSE_TOP_PAD_CLASS)}>
        <div className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            aria-hidden
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,oklch(0.42_0.14_264),transparent_55%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_42%_at_12%_55%,oklch(0.34_0.12_18),transparent_52%)]" />
          </div>

          <header className="relative mx-auto max-w-[1920px] px-6 pb-8 pt-10 sm:px-10 sm:pb-10 lg:px-14 lg:pb-12 xl:px-20">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Zenede
            </p>
            <h1 className="mt-2 max-w-[24ch] text-[clamp(1.85rem,4.2vw,2.65rem)] font-semibold tracking-tight text-white">
              Recordings
            </h1>
            <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-white/50">
              Schedule captures, monitor live encodes, and download finished MP4
              files. The server runs{" "}
              <span className="text-white/70">ffmpeg</span> against your catalog
              URLs (same routing as playback).
            </p>
          </header>
        </div>

        <div className="mx-auto max-w-[1920px] space-y-10 px-6 sm:px-10 lg:px-14 xl:px-20">
          {overview && !overview.ffmpegAvailable ? (
            <div
              className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-500/[0.09] px-4 py-3.5 text-[15px] leading-snug text-amber-100/95"
              role="status"
            >
              <AlertTriangle
                className="mt-0.5 size-5 shrink-0 text-amber-300/90"
                aria-hidden
              />
              <div>
                <p className="font-semibold text-amber-50">ffmpeg not detected</p>
                <p className="mt-1 text-[14px] text-amber-100/75">
                  Install ffmpeg on the host and ensure it is on{" "}
                  <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[13px]">
                    PATH
                  </code>{" "}
                  so scheduled and manual recordings can start.
                </p>
              </div>
            </div>
          ) : null}

          {loadError ? (
            <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-[15px] text-red-100/90">
              {loadError}
            </div>
          ) : null}

          <section aria-labelledby="rec-start-heading">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2
                  id="rec-start-heading"
                  className="text-lg font-semibold tracking-tight text-white"
                >
                  New recording
                </h2>
                <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-white/45">
                  Schedule a future capture or start encoding now — pick a channel
                  and times in the recorder.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStartRecordingDialogOpen(true)}
                className="shrink-0 outline-none"
              >
                <ZenedeGlass variant="ctaPill">
                  <span className="flex items-center gap-2 px-5 py-2.5 text-[15px] font-semibold text-zinc-950">
                    <Plus className="size-4" aria-hidden />
                    Start a recording
                  </span>
                </ZenedeGlass>
              </button>
            </div>
          </section>

          {startRecordingDialogOpen ? (
            <div
              className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto px-4 py-8 sm:px-6 sm:py-10"
              role="presentation"
            >
              <button
                type="button"
                aria-label="Close dialog"
                className="fixed inset-0 bg-black/70 backdrop-blur-md motion-safe:animate-[glass-backdrop-in_0.25s_ease-out_both]"
                onClick={() => setStartRecordingDialogOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="rec-start-dialog-title"
                className="relative z-10 my-auto w-full max-w-5xl motion-safe:animate-[glass-modal-pop_0.36s_cubic-bezier(0.16,1,0.3,1)_both]"
              >
                <ZenedeGlass
                  variant="panel"
                  className="flex max-h-[min(92vh,880px)] flex-col overflow-hidden border border-white/[0.12] shadow-[0_40px_120px_-48px_rgba(0,0,0,0.95)]"
                >
                  <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.08] px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                      <p
                        id="rec-start-dialog-title"
                        className="text-[18px] font-semibold text-white"
                      >
                        Start a recording
                      </p>
                      <p className="mt-1 text-[14px] text-white/45">
                        Search your catalog, choose a channel, then schedule or
                        record now.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStartRecordingDialogOpen(false)}
                      className="shrink-0 rounded-lg p-2 text-white/40 outline-none transition-colors hover:bg-white/[0.08] hover:text-white/85"
                      aria-label="Close"
                    >
                      <X className="size-5" />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
                      <ZenedeGlass
                        variant="panel"
                        className="overflow-hidden rounded-[1.35rem] border border-white/[0.1] p-5 shadow-[0_24px_64px_-28px_rgba(0,0,0,0.55)]"
                      >
                        <label className="block text-[13px] font-medium uppercase tracking-[0.12em] text-white/40">
                          Find channel
                        </label>
                        <div className="relative mt-2">
                          <Search
                            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35"
                            aria-hidden
                          />
                          <input
                            value={channelQuery}
                            onChange={(e) => setChannelQuery(e.target.value)}
                            placeholder="Type a channel or group name…"
                            className={cn(
                              "h-11 w-full rounded-xl border border-white/[0.1] bg-black/35 pl-10 pr-3 text-[15px] text-white outline-none",
                              "placeholder:text-white/30 focus:border-white/25 focus:ring-2 focus:ring-white/15",
                            )}
                          />
                        </div>
                        <ul
                          className="mt-3 max-h-[min(22rem,40vh)] space-y-1 overflow-y-auto overscroll-contain pr-1"
                          role="listbox"
                          aria-label="Matching channels"
                        >
                          {filteredChannels.map((ch) => {
                            const label = parseChannelLabel(ch.name).displayName;
                            const active = selected?.url === ch.url;
                            return (
                              <li key={ch.url}>
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={active}
                                  onClick={() => setSelected(ch)}
                                  className={cn(
                                    "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-colors",
                                    active
                                      ? "bg-white/[0.12] ring-1 ring-white/[0.14]"
                                      : "hover:bg-white/[0.06]",
                                  )}
                                >
                                  <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-white/[0.06] ring-1 ring-white/[0.08]">
                                    {ch.tvgLogo ? (
                                      <Image
                                        src={ch.tvgLogo}
                                        alt=""
                                        fill
                                        className="object-cover"
                                        sizes="40px"
                                        unoptimized
                                      />
                                    ) : (
                                      <span className="flex size-full items-center justify-center text-white/35">
                                        <Video className="size-4" aria-hidden />
                                      </span>
                                    )}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[15px] font-medium text-white/95">
                                      {label}
                                    </span>
                                    {ch.groupTitle ? (
                                      <span className="mt-0.5 block truncate text-[13px] text-white/40">
                                        {ch.groupTitle}
                                      </span>
                                    ) : null}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </ZenedeGlass>

                      <ZenedeGlass
                        variant="panel"
                        className="rounded-[1.35rem] border border-white/[0.1] p-5 shadow-[0_24px_64px_-28px_rgba(0,0,0,0.55)]"
                      >
                        <div
                          className="flex flex-wrap gap-2 border-b border-white/[0.08] pb-4"
                          role="tablist"
                          aria-label="Recording mode"
                        >
                          {(
                            [
                              ["schedule", "Schedule", CalendarClock],
                              ["now", "Record now", Radio],
                            ] as const
                          ).map(([id, label, Icon]) => (
                            <button
                              key={id}
                              type="button"
                              role="tab"
                              aria-selected={tab === id}
                              onClick={() => setTab(id)}
                              className={cn(
                                "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] font-medium outline-none transition-colors",
                                tab === id
                                  ? "bg-white/[0.12] text-white ring-1 ring-white/[0.14]"
                                  : "text-white/45 hover:bg-white/[0.05] hover:text-white/75",
                              )}
                            >
                              <Icon className="size-4 opacity-80" aria-hidden />
                              {label}
                            </button>
                          ))}
                        </div>

                        {selected ? (
                          <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5">
                            <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-white/[0.06] ring-1 ring-white/[0.08]">
                              {selected.tvgLogo ? (
                                <Image
                                  src={selected.tvgLogo}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  sizes="44px"
                                  unoptimized
                                />
                              ) : (
                                <span className="flex size-full items-center justify-center text-white/35">
                                  <Video className="size-5" aria-hidden />
                                </span>
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] font-semibold text-white">
                                {parseChannelLabel(selected.name).displayName}
                              </p>
                              <p className="truncate text-[13px] text-white/40">
                                {selected.groupTitle ?? "Uncategorized"}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-6 text-center text-[15px] text-white/40">
                            Select a channel from the list.
                          </p>
                        )}

                        {tab === "schedule" && selected ? (
                          <div className="mt-5 space-y-4">
                            <div>
                              <label className="text-[13px] font-medium text-white/50">
                                Start
                              </label>
                              <input
                                type="datetime-local"
                                value={startLocal}
                                onChange={(e) => setStartLocal(e.target.value)}
                                className={cn(
                                  "mt-1.5 h-11 w-full max-w-md rounded-xl border border-white/[0.1] bg-black/35 px-3 text-[15px] text-white outline-none",
                                  "focus:border-white/25 focus:ring-2 focus:ring-white/15",
                                )}
                              />
                            </div>
                            <fieldset className="space-y-2">
                              <legend className="text-[13px] font-medium text-white/50">
                                End
                              </legend>
                              <div className="flex flex-wrap gap-3">
                                <label className="inline-flex cursor-pointer items-center gap-2 text-[14px] text-white/75">
                                  <input
                                    type="radio"
                                    name="endModeDialog"
                                    checked={endMode === "duration"}
                                    onChange={() => setEndMode("duration")}
                                    className="accent-white"
                                  />
                                  Duration (minutes)
                                </label>
                                <label className="inline-flex cursor-pointer items-center gap-2 text-[14px] text-white/75">
                                  <input
                                    type="radio"
                                    name="endModeDialog"
                                    checked={endMode === "end"}
                                    onChange={() => setEndMode("end")}
                                    className="accent-white"
                                  />
                                  End time
                                </label>
                              </div>
                              {endMode === "duration" ? (
                                <input
                                  type="number"
                                  min={1}
                                  max={480}
                                  value={durationMinutes}
                                  onChange={(e) =>
                                    setDurationMinutes(Number(e.target.value) || 1)
                                  }
                                  className={cn(
                                    "h-11 w-32 rounded-xl border border-white/[0.1] bg-black/35 px-3 text-[15px] text-white outline-none",
                                    "focus:border-white/25 focus:ring-2 focus:ring-white/15",
                                  )}
                                />
                              ) : (
                                <input
                                  type="datetime-local"
                                  value={endLocal}
                                  onChange={(e) => setEndLocal(e.target.value)}
                                  className={cn(
                                    "mt-1 h-11 w-full max-w-md rounded-xl border border-white/[0.1] bg-black/35 px-3 text-[15px] text-white outline-none",
                                    "focus:border-white/25 focus:ring-2 focus:ring-white/15",
                                  )}
                                />
                              )}
                            </fieldset>
                            <button
                              type="button"
                              disabled={
                                busy ||
                                (overview !== null && !overview.ffmpegAvailable)
                              }
                              onClick={() => void submitSchedule()}
                              className={cn(
                                "inline-flex h-11 items-center justify-center rounded-xl px-5 text-[15px] font-semibold outline-none transition-colors",
                                "bg-white text-black hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-45",
                                "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                              )}
                            >
                              {busy ? (
                                <Loader2 className="size-5 animate-spin" aria-hidden />
                              ) : (
                                "Add to schedule"
                              )}
                            </button>
                          </div>
                        ) : null}

                        {tab === "now" && selected ? (
                          <div className="mt-5 space-y-4">
                            <div>
                              <label className="text-[13px] font-medium text-white/50">
                                Duration (minutes)
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={480}
                                value={nowDuration}
                                onChange={(e) =>
                                  setNowDuration(Number(e.target.value) || 1)
                                }
                                className={cn(
                                  "mt-1.5 h-11 w-32 rounded-xl border border-white/[0.1] bg-black/35 px-3 text-[15px] text-white outline-none",
                                  "focus:border-white/25 focus:ring-2 focus:ring-white/15",
                                )}
                              />
                            </div>
                            <button
                              type="button"
                              disabled={
                                busy ||
                                (overview !== null && !overview.ffmpegAvailable)
                              }
                              onClick={() => void submitNow()}
                              className={cn(
                                "inline-flex h-11 items-center justify-center rounded-xl px-5 text-[15px] font-semibold outline-none transition-colors",
                                "bg-rose-500 text-white hover:bg-rose-500/90 disabled:cursor-not-allowed disabled:opacity-45",
                                "focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                              )}
                            >
                              {busy ? (
                                <Loader2 className="size-5 animate-spin" aria-hidden />
                              ) : (
                                "Start recording now"
                              )}
                            </button>
                          </div>
                        ) : null}
                      </ZenedeGlass>
                    </div>
                  </div>

                  <div className="shrink-0 border-t border-white/[0.08] bg-black/20 px-5 py-3 sm:px-6">
                    <button
                      type="button"
                      onClick={() => setStartRecordingDialogOpen(false)}
                      className="rounded-xl border border-white/[0.12] bg-white/[0.06] px-5 py-2.5 text-[14px] font-medium text-white/75 outline-none hover:bg-white/[0.1] hover:text-white"
                    >
                      Close
                    </button>
                  </div>
                </ZenedeGlass>
              </div>
            </div>
          ) : null}

          {overview && overview.active.length > 0 ? (
            <section aria-labelledby="rec-active-heading">
              <h2
                id="rec-active-heading"
                className="text-lg font-semibold tracking-tight text-white"
              >
                Recording now
              </h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {overview.active.map((r) => {
                  const start = r.startedAt
                    ? new Date(r.startedAt).getTime()
                    : 0;
                  const end = new Date(r.plannedEndsAt).getTime();
                  const now = nowMs ?? start;
                  const t =
                    start > 0
                      ? Math.min(
                          1,
                          Math.max(
                            0,
                            (now - start) / Math.max(1, end - start),
                          ),
                        )
                      : 0;
                  return (
                    <li key={r.id}>
                      <ZenedeGlass
                        variant="panel"
                        className="relative overflow-hidden rounded-[1.25rem] border border-rose-400/20 bg-rose-500/[0.06] p-4"
                      >
                        <div
                          className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-white/[0.06]"
                          aria-hidden
                        >
                          <div
                            className="h-full bg-rose-400/80 transition-[width] duration-700 ease-out"
                            style={{ width: `${Math.round(t * 100)}%` }}
                          />
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-rose-200/85">
                              <span className="relative flex size-2">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400/50 opacity-60" />
                                <span className="relative inline-flex size-2 rounded-full bg-rose-400" />
                              </span>
                              Live
                            </p>
                            <p className="mt-2 truncate text-[16px] font-semibold text-white">
                              {r.channelName}
                            </p>
                            <p className="mt-1 text-[13px] text-white/45">
                              Until{" "}
                              {new Intl.DateTimeFormat(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              }).format(new Date(r.plannedEndsAt))}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void stopRecording(r.id)}
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.12] bg-black/40 px-3 py-2 text-[13px] font-semibold text-white outline-none",
                              "hover:bg-black/55 disabled:opacity-45",
                            )}
                          >
                            <CircleStop className="size-4" aria-hidden />
                            Stop &amp; save
                          </button>
                        </div>
                      </ZenedeGlass>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {overview && overview.schedules.length > 0 ? (
            <section aria-labelledby="rec-upcoming-heading">
              <h2
                id="rec-upcoming-heading"
                className="text-lg font-semibold tracking-tight text-white"
              >
                Upcoming
              </h2>
              <ul className="mt-4 space-y-3">
                {overview.schedules.map((s) => (
                  <li key={s.id}>
                    <ZenedeGlass
                      variant="panel"
                      className="rounded-[1.15rem] border border-white/[0.08] p-4 sm:p-5"
                    >
                      {editingId === s.id ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <p className="text-[13px] font-medium text-white/45">
                              Start
                            </p>
                            <input
                              type="datetime-local"
                              value={editStart}
                              onChange={(e) => setEditStart(e.target.value)}
                              className={cn(
                                "mt-1 h-10 w-full rounded-lg border border-white/[0.1] bg-black/35 px-2.5 text-[14px] text-white outline-none",
                                "focus:border-white/25",
                              )}
                            />
                          </div>
                          <div>
                            <p className="text-[13px] font-medium text-white/45">
                              End
                            </p>
                            <div className="mt-1 flex flex-wrap gap-2">
                              <label className="inline-flex items-center gap-1.5 text-[13px] text-white/65">
                                <input
                                  type="radio"
                                  checked={editEndMode === "end"}
                                  onChange={() => setEditEndMode("end")}
                                  className="accent-white"
                                />
                                Time
                              </label>
                              <label className="inline-flex items-center gap-1.5 text-[13px] text-white/65">
                                <input
                                  type="radio"
                                  checked={editEndMode === "duration"}
                                  onChange={() => setEditEndMode("duration")}
                                  className="accent-white"
                                />
                                Minutes from start
                              </label>
                            </div>
                            {editEndMode === "end" ? (
                              <input
                                type="datetime-local"
                                value={editEnd}
                                onChange={(e) => setEditEnd(e.target.value)}
                                className={cn(
                                  "mt-2 h-10 w-full rounded-lg border border-white/[0.1] bg-black/35 px-2.5 text-[14px] text-white outline-none",
                                  "focus:border-white/25",
                                )}
                              />
                            ) : (
                              <input
                                type="number"
                                min={1}
                                max={480}
                                value={editDuration}
                                onChange={(e) =>
                                  setEditDuration(Number(e.target.value) || 1)
                                }
                                className={cn(
                                  "mt-2 h-10 w-28 rounded-lg border border-white/[0.1] bg-black/35 px-2.5 text-[14px] text-white outline-none",
                                  "focus:border-white/25",
                                )}
                              />
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 md:col-span-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void saveEdit()}
                              className="rounded-lg bg-white px-4 py-2 text-[14px] font-semibold text-black hover:bg-white/90 disabled:opacity-45"
                            >
                              Save changes
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setEditingId(null)}
                              className="rounded-lg border border-white/[0.12] px-4 py-2 text-[14px] font-medium text-white/80 hover:bg-white/[0.06] disabled:opacity-45"
                            >
                              Discard
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/[0.08]">
                              <CalendarClock
                                className="size-5 text-white/55"
                                aria-hidden
                              />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[16px] font-semibold text-white">
                                {s.channelName}
                              </p>
                              <p className="mt-0.5 text-[14px] text-white/45">
                                {formatRange(s.startsAt, s.endsAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => beginEdit(s)}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-[13px] font-semibold text-white/90 outline-none hover:bg-white/[0.09] disabled:opacity-45",
                              )}
                            >
                              <Pencil className="size-3.5" aria-hidden />
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void cancelSchedule(s.id)}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-[13px] font-semibold text-red-100 outline-none hover:bg-red-500/15 disabled:opacity-45",
                              )}
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </ZenedeGlass>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="rec-library-heading">
            <h2
              id="rec-library-heading"
              className="text-lg font-semibold tracking-tight text-white"
            >
              Finished recordings
            </h2>
            {!overview ? (
              <p className="mt-4 flex items-center gap-2 text-[15px] text-white/45">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading library…
              </p>
            ) : overview.library.length === 0 ? (
              <p className="mt-4 text-[15px] text-white/45">
                Completed captures appear here with a download action.
              </p>
            ) : (
              <ul className="mt-4 grid gap-4 lg:grid-cols-2">
                {overview.library.map((item) => (
                  <li key={item.id}>
                    <ZenedeGlass
                      variant="panel"
                      className="flex flex-col gap-4 rounded-[1.15rem] border border-white/[0.08] p-4 sm:flex-row sm:items-stretch sm:justify-between sm:gap-6 sm:p-5"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-white/[0.06] ring-1 ring-white/[0.08]">
                          {item.channelLogo ? (
                            <Image
                              src={item.channelLogo}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="56px"
                              unoptimized
                            />
                          ) : (
                            <span className="flex size-full items-center justify-center text-white/35">
                              <Video className="size-6" aria-hidden />
                            </span>
                          )}
                        </span>
                        <div className="min-w-0">
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
                            <span className="text-white/55">
                              {item.status === "STOPPED_EARLY"
                                ? "Stopped early"
                                : "Complete"}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 sm:min-w-[11rem]">
                        <Link
                          href={`/watch?recording=${encodeURIComponent(item.id)}`}
                          className={cn(
                            "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-semibold outline-none",
                            "border border-emerald-400/30 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25",
                          )}
                        >
                          <Play className="size-4" aria-hidden />
                          Play
                        </Link>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void downloadRecording(item)}
                          className={cn(
                            "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-semibold outline-none",
                            "border border-white/[0.12] bg-white/[0.08] text-white hover:bg-white/[0.12] disabled:opacity-45",
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
                            "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-semibold outline-none",
                            "border border-red-400/25 bg-red-500/10 text-red-100 hover:bg-red-500/15 disabled:opacity-45",
                          )}
                        >
                          <Trash2 className="size-4" aria-hidden />
                          Remove
                        </button>
                      </div>
                    </ZenedeGlass>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {overview && overview.recentFailures.length > 0 ? (
            <TvRecordingRecentIssues
              issues={overview.recentFailures}
              onRefresh={load}
            />
          ) : null}
        </div>

        <div
          className={cn(
            "pointer-events-none fixed inset-x-0 z-40 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent",
            TV_BROWSE_STICKY_TOP_CLASS,
          )}
          aria-hidden
        />

        {libraryDeleteTarget ? (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-10 sm:px-6"
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
              aria-labelledby="lib-del-title"
              className="relative z-10 w-full max-w-md rounded-2xl border border-white/[0.12] bg-zinc-950/95 p-6 shadow-2xl ring-1 ring-white/[0.06]"
            >
              <div className="flex items-start justify-between gap-3">
                <h2
                  id="lib-del-title"
                  className="text-[18px] font-semibold text-white"
                >
                  Remove recording?
                </h2>
                <button
                  type="button"
                  className="rounded-lg p-2 text-white/40 hover:bg-white/[0.08] hover:text-white/80"
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
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl border border-white/[0.12] bg-white/[0.06] px-5 py-2.5 text-[14px] font-medium text-white/75 hover:bg-white/[0.1] disabled:opacity-45"
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
                  className="inline-flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/20 px-5 py-2.5 text-[14px] font-semibold text-red-100 hover:bg-red-500/30 disabled:opacity-45"
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
      </main>
    </div>
  );
}
