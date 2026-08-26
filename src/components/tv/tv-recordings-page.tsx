"use client";

import { Input } from "@appica/ui-react/input";
import { Radio as AppicaRadio } from "@appica/ui-react/radio";
import { RadioGroup } from "@appica/ui-react/radio-group";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, startTransition } from "react";

import { Card } from "@appica/ui-react/card";
import { ZendeLoadingState, ZendeSpinner } from "@/components/loading/zende-spinner";
import { Button, buttonVariants } from "@appica/ui-react/button";
import { BROWSE_CONTAINER_CLASS } from "@/components/layout/browse-page-shell";
import {
  AppicaPanel,
  AppicaHero,
  AppicaMetrics,
} from "@/components/layout/appica-page";
import { NavErrorBanner } from "@/components/nav/nav-error-banner";
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
import { useChannelSearch } from "@/features/iptv/use-channel-search";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { secureImageUrl } from "@/lib/media/secure-image-url";
import { RECORDING_ENCODER_GONE_CODE } from "@/lib/recordings/recording-api-codes";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CalendarClock,
  CircleStop,
  Download,
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
  error: string | null;
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

function libraryFailSummary(error: string | null): string {
  if (!error?.trim()) return "Recording failed — no server message was stored.";
  const line = error.split(/\r?\n/).find((l) => l.trim())?.trim() ?? error.trim();
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
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
  const [channelQuery, setChannelQuery] = useState("");
  const { catalogLoaded } = useCatalogBootstrap(source);
  const { channels: searchChannels } = useChannelSearch(channelQuery, 24);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  const [stuckStopDialog, setStuckStopDialog] = useState<{
    id: string;
    channelName: string;
    message: string;
  } | null>(null);
  const [stuckStopError, setStuckStopError] = useState<string | null>(null);

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

  const filteredChannels = searchChannels;

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
        setActionError(msg);
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
        setActionError(msg);
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
        setActionError(typeof j?.error === "string" ? j.error : "Update failed.");
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
        setActionError(typeof j?.error === "string" ? j.error : "Cancel failed.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

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

  const stopRecording = async (id: string) => {
    setBusy(true);
    try {
      const meta = overview?.active.find((a) => a.id === id);
      const res = await zendeFetch(`/api/recordings/${id}/stop`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: unknown;
          code?: unknown;
        };
        const msg =
          typeof j?.error === "string" ? j.error : "Stop failed.";
        if (j?.code === RECORDING_ENCODER_GONE_CODE) {
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
      const j = (await res.json().catch(() => null)) as { error?: unknown };
      if (!res.ok) {
        setStuckStopError(
          typeof j?.error === "string" ? j.error : "Remove failed.",
        );
        return;
      }
      setStuckStopDialog(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const downloadRecording = async (item: ApiLibraryItem) => {
    if (item.status === "FAILED") return;
    const res = await zendeFetch(`/api/recordings/${item.id}/download`);
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: unknown };
      setActionError(typeof j?.error === "string" ? j.error : "Download failed.");
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
      <div className="bg-background flex min-h-screen items-center justify-center pt-20 text-foreground-intense">
        <ZendeLoadingState size="full" label="Loading recordings…" />
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen text-foreground">
      <main className={cn("pb-28", TV_BROWSE_TOP_PAD_CLASS)}>
        <AppicaHero
          className="pb-8 pt-8"
          eyebrow="Recorder"
          title="Recordings"
          description="Schedule, monitor, play, and download recordings."
          aside={
            <AppicaPanel>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Recorder status</p>
              <AppicaMetrics
                className="mt-4"
                metrics={[
                  {
                    label: "Scheduled",
                    value: (overview?.schedules.length ?? 0).toLocaleString(),
                    tone: "signal",
                  },
                  {
                    label: "Active",
                    value: (overview?.active.length ?? 0).toLocaleString(),
                    tone: "ember",
                  },
                  {
                    label: "Library",
                    value: (overview?.library.length ?? 0).toLocaleString(),
                  },
                ]}
              />
              <p className="mt-5 text-[14px] leading-relaxed text-foreground-intense">
                Recording uses your catalog stream URLs.
              </p>
            </AppicaPanel>
          }
        />

        <div className={cn(BROWSE_CONTAINER_CLASS, "space-y-8")}>
          {overview && !overview.ffmpegAvailable ? (
            <div
              className="flex items-start gap-3 rounded-lg border border-warning bg-warning-subtle px-4 py-3.5 text-[15px] leading-snug text-warning-strong shadow-lg backdrop-blur-xl"
              role="status"
            >
              <AlertTriangle
                className="mt-0.5 size-5 shrink-0 text-warning-strong"
                aria-hidden
              />
              <div>
                <p className="font-semibold text-warning-strong">ffmpeg not detected</p>
                <p className="mt-1 text-[14px] text-warning-strong">
                  Install ffmpeg on the host and ensure it is on{" "}
                  <code className="rounded bg-background px-1.5 py-0.5 font-mono text-[13px]">
                    PATH
                  </code>{" "}
                  so scheduled and manual recordings can start.
                </p>
              </div>
            </div>
          ) : null}

          {loadError ? (
            <div className="rounded-lg border border-error bg-error-subtle px-4 py-3 text-[15px] text-error-strong backdrop-blur-xl">
              {loadError}
            </div>
          ) : null}

          <section aria-labelledby="rec-start-heading">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2
                  id="rec-start-heading"
                  className="text-xl font-semibold tracking-tight text-foreground-intense"
                >
                  New recording
                </h2>
                <p className="text-sm text-foreground-muted mt-1 max-w-xl">
                  Schedule a future capture or start encoding now — pick a channel
                  and times in the recorder.
                </p>
              </div>
              <Button variant="ghost"
                type="button"
                onClick={() => setStartRecordingDialogOpen(true)}
                className="shrink-0 outline-none"
              >
                <Card frame="solid">
                  <span className="flex items-center gap-2 px-5 py-2.5 text-[15px] font-semibold text-foreground-inverse">
                    <Plus className="size-4" aria-hidden />
                    Start a recording
                  </span>
                </Card>
              </Button>
            </div>
          </section>

          {startRecordingDialogOpen ? (
            <div
              className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto px-4 py-8 sm:px-6 sm:py-10"
              role="presentation"
            >
              <Button variant="ghost"
                type="button"
                aria-label="Close dialog"
                className="fixed inset-0 bg-background backdrop-blur-md motion-safe:animate-[glass-backdrop-in_0.25s_ease-out_both]"
                onClick={() => setStartRecordingDialogOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="rec-start-dialog-title"
                className="relative z-10 my-auto w-full max-w-5xl motion-safe:animate-[glass-modal-pop_0.36s_cubic-bezier(0.16,1,0.3,1)_both]"
              >
                <Card
                  frame="glass"
                  className="flex max-h-[min(92vh,880px)] flex-col overflow-hidden border border-border shadow-lg"
                >
                  <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                      <p
                        id="rec-start-dialog-title"
                        className="text-[18px] font-semibold text-foreground-intense"
                      >
                        Start a recording
                      </p>
                      <p className="mt-1 text-[14px] text-foreground-intense">
                        Search your catalog, choose a channel, then schedule or
                        record now.
                      </p>
                    </div>
                    <Button variant="ghost"
                      type="button"
                      onClick={() => setStartRecordingDialogOpen(false)}
                      className="shrink-0 rounded-lg p-2 text-foreground-intense outline-none transition-colors hover:bg-background-muted hover:text-foreground-intense"
                      aria-label="Close"
                    >
                      <X className="size-5" />
                    </Button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
                      <Card
                        frame="glass"
                        className="overflow-hidden rounded-lg border border-border p-5 shadow-lg"
                      >
                        <label className="block text-[13px] font-medium uppercase tracking-[0.12em] text-foreground-intense">
                          Find channel
                        </label>
                        <div className="relative mt-2">
                          <Search
                            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-intense"
                            aria-hidden
                          />
                          <Input
                            value={channelQuery}
                            onChange={(e) => setChannelQuery(e.target.value)}
                            placeholder="Type a channel or group name…"
                            className={cn(
                              "h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-[15px] text-foreground-intense outline-none",
                              "placeholder:text-foreground-intense focus:border-border focus:ring-2 focus:ring-border",
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
                                <Button variant="ghost"
                                  type="button"
                                  role="option"
                                  aria-selected={active}
                                  onClick={() => setSelected(ch)}
                                  className={cn(
                                    "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-colors",
                                    active
                                      ? "bg-background-muted ring-1 ring-border"
                                      : "hover:bg-background-muted",
                                  )}
                                >
                                  <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-background-muted ring-1 ring-border">
                                    {ch.tvgLogo ? (
                                      <Image
                                        src={secureImageUrl(ch.tvgLogo, undefined, "logo")!}
                                        alt=""
                                        fill
                                        className="object-cover"
                                        sizes="40px"
                                        unoptimized
                                      />
                                    ) : (
                                      <span className="flex size-full items-center justify-center text-foreground-intense">
                                        <Video className="size-4" aria-hidden />
                                      </span>
                                    )}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[15px] font-medium text-foreground-intense">
                                      {label}
                                    </span>
                                    {ch.groupTitle ? (
                                      <span className="mt-0.5 block truncate text-[13px] text-foreground-intense">
                                        {ch.groupTitle}
                                      </span>
                                    ) : null}
                                  </span>
                                </Button>
                              </li>
                            );
                          })}
                        </ul>
                      </Card>

                      <Card
                        frame="glass"
                        className="rounded-lg border border-border p-5 shadow-lg"
                      >
                        <div
                          className="flex flex-wrap gap-2 border-b border-border pb-4"
                          role="tablist"
                          aria-label="Recording mode"
                        >
                          {(
                            [
                              ["schedule", "Schedule", CalendarClock],
                              ["now", "Record now", Radio],
                            ] as const
                          ).map(([id, label, Icon]) => (
                            <Button variant="ghost"
                              key={id}
                              type="button"
                              role="tab"
                              aria-selected={tab === id}
                              onClick={() => setTab(id)}
                              className={cn(
                                "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] font-medium outline-none transition-colors",
                                tab === id
                                  ? "bg-background-muted text-foreground-intense ring-1 ring-border"
                                  : "text-foreground-intense hover:bg-background-muted hover:text-foreground-intense",
                              )}
                            >
                              <Icon className="size-4 opacity-80" aria-hidden />
                              {label}
                            </Button>
                          ))}
                        </div>

                        {selected ? (
                          <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
                            <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-background-muted ring-1 ring-border">
                              {selected.tvgLogo ? (
                                <Image
                                  src={secureImageUrl(selected.tvgLogo, undefined, "logo")!}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  sizes="44px"
                                  unoptimized
                                />
                              ) : (
                                <span className="flex size-full items-center justify-center text-foreground-intense">
                                  <Video className="size-5" aria-hidden />
                                </span>
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] font-semibold text-foreground-intense">
                                {parseChannelLabel(selected.name).displayName}
                              </p>
                              <p className="truncate text-[13px] text-foreground-intense">
                                {selected.groupTitle ?? "Uncategorized"}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-6 text-center text-[15px] text-foreground-intense">
                            Select a channel from the list.
                          </p>
                        )}

                        {tab === "schedule" && selected ? (
                          <div className="mt-5 space-y-4">
                            <div>
                              <label className="text-[13px] font-medium text-foreground-intense">
                                Start
                              </label>
                              <Input
                                type="datetime-local"
                                value={startLocal}
                                onChange={(e) => setStartLocal(e.target.value)}
                                className={cn(
                                  "mt-1.5 h-11 w-full max-w-md rounded-xl border border-border bg-background px-3 text-[15px] text-foreground-intense outline-none",
                                  "focus:border-border focus:ring-2 focus:ring-border",
                                )}
                              />
                            </div>
                            <fieldset className="space-y-2">
                              <legend className="text-[13px] font-medium text-foreground-intense">
                                End
                              </legend>
                              <RadioGroup value={endMode} onValueChange={(value) => setEndMode(value as "duration" | "end")} orientation="horizontal" className="flex flex-wrap gap-3">
                                <label className="inline-flex cursor-pointer items-center gap-2 text-[14px] text-foreground-intense">
                                  <AppicaRadio value="duration" />
                                  Duration (minutes)
                                </label>
                                <label className="inline-flex cursor-pointer items-center gap-2 text-[14px] text-foreground-intense">
                                  <AppicaRadio value="end" />
                                  End time
                                </label>
                              </RadioGroup>
                              {endMode === "duration" ? (
                                <Input
                                  type="number"
                                  min={1}
                                  max={480}
                                  value={durationMinutes}
                                  onChange={(e) =>
                                    setDurationMinutes(Number(e.target.value) || 1)
                                  }
                                  className={cn(
                                    "h-11 w-32 rounded-xl border border-border bg-background px-3 text-[15px] text-foreground-intense outline-none",
                                    "focus:border-border focus:ring-2 focus:ring-border",
                                  )}
                                />
                              ) : (
                                <Input
                                  type="datetime-local"
                                  value={endLocal}
                                  onChange={(e) => setEndLocal(e.target.value)}
                                  className={cn(
                                    "mt-1 h-11 w-full max-w-md rounded-xl border border-border bg-background px-3 text-[15px] text-foreground-intense outline-none",
                                    "focus:border-border focus:ring-2 focus:ring-border",
                                  )}
                                />
                              )}
                            </fieldset>
                            <Button
                              type="button"
                              disabled={
                                busy ||
                                (overview !== null && !overview.ffmpegAvailable)
                              }
                              onClick={() => void submitSchedule()}
                              variant="primary"
                            >
                              {busy ? (
                                <ZendeSpinner size="small" label="Adding schedule" />
                              ) : (
                                "Add to schedule"
                              )}
                            </Button>
                          </div>
                        ) : null}

                        {tab === "now" && selected ? (
                          <div className="mt-5 space-y-4">
                            <div>
                              <label className="text-[13px] font-medium text-foreground-intense">
                                Duration (minutes)
                              </label>
                              <Input
                                type="number"
                                min={1}
                                max={480}
                                value={nowDuration}
                                onChange={(e) =>
                                  setNowDuration(Number(e.target.value) || 1)
                                }
                                className={cn(
                                  "mt-1.5 h-11 w-32 rounded-xl border border-border bg-background px-3 text-[15px] text-foreground-intense outline-none",
                                  "focus:border-border focus:ring-2 focus:ring-border",
                                )}
                              />
                            </div>
                            <Button
                              type="button"
                              disabled={
                                busy ||
                                (overview !== null && !overview.ffmpegAvailable)
                              }
                              onClick={() => void submitNow()}
                              variant="primary"
                            >
                              {busy ? (
                                <ZendeSpinner size="small" label="Starting recording" />
                              ) : (
                                "Start recording now"
                              )}
                            </Button>
                          </div>
                        ) : null}
                      </Card>
                    </div>
                  </div>

                  <div className="shrink-0 border-t border-border bg-background px-5 py-3 sm:px-6">
                    <Button
                      type="button"
                      onClick={() => setStartRecordingDialogOpen(false)}
                    >
                      Close
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          ) : null}

          {overview && overview.active.length > 0 ? (
            <section aria-labelledby="rec-active-heading">
              <h2
                id="rec-active-heading"
                className="text-lg font-semibold tracking-tight text-foreground-intense"
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
                      <Card
                        frame="glass"
                        className="relative overflow-hidden rounded-lg border border-error bg-error-subtle p-4"
                      >
                        <div
                          className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-background-muted"
                          aria-hidden
                        >
                          <div
                            className="h-full bg-error-subtle transition-[width] duration-700 ease-out"
                            style={{ width: `${Math.round(t * 100)}%` }}
                          />
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-error-strong">
                              <span className="relative flex size-2">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-error-subtle opacity-60" />
                                <span className="relative inline-flex size-2 rounded-full bg-error-subtle" />
                              </span>
                              Live
                            </p>
                            <p className="mt-2 truncate text-[16px] font-semibold text-foreground-intense">
                              {r.channelName}
                            </p>
                            <p className="mt-1 text-[13px] text-foreground-intense">
                              Until{" "}
                              {new Intl.DateTimeFormat(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              }).format(new Date(r.plannedEndsAt))}
                            </p>
                          </div>
                          <Button
                            type="button"
                            disabled={busy}
                            onClick={() => void stopRecording(r.id)}
                            variant="destructive"
                            size="sm"
                            className="shrink-0"
                          >
                            <CircleStop className="size-4" aria-hidden />
                            Stop &amp; save
                          </Button>
                        </div>
                      </Card>
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
                className="text-lg font-semibold tracking-tight text-foreground-intense"
              >
                Upcoming
              </h2>
              <ul className="mt-4 space-y-3">
                {overview.schedules.map((s) => (
                  <li key={s.id}>
                    <Card
                      frame="glass"
                      className="rounded-lg border border-border p-4 sm:p-5"
                    >
                      {editingId === s.id ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <p className="text-[13px] font-medium text-foreground-intense">
                              Start
                            </p>
                            <Input
                              type="datetime-local"
                              value={editStart}
                              onChange={(e) => setEditStart(e.target.value)}
                              className={cn(
                                "mt-1 h-10 w-full rounded-lg border border-border bg-background px-2.5 text-[14px] text-foreground-intense outline-none",
                                "focus:border-border",
                              )}
                            />
                          </div>
                          <div>
                            <p className="text-[13px] font-medium text-foreground-intense">
                              End
                            </p>
                            <RadioGroup value={editEndMode} onValueChange={(value) => setEditEndMode(value as "end" | "duration")} orientation="horizontal" className="mt-1 flex flex-wrap gap-2">
                              <label className="inline-flex items-center gap-1.5 text-[13px] text-foreground-intense">
                                <AppicaRadio value="end" />
                                Time
                              </label>
                              <label className="inline-flex items-center gap-1.5 text-[13px] text-foreground-intense">
                                <AppicaRadio value="duration" />
                                Minutes from start
                              </label>
                            </RadioGroup>
                            {editEndMode === "end" ? (
                              <Input
                                type="datetime-local"
                                value={editEnd}
                                onChange={(e) => setEditEnd(e.target.value)}
                                className={cn(
                                  "mt-2 h-10 w-full rounded-lg border border-border bg-background px-2.5 text-[14px] text-foreground-intense outline-none",
                                  "focus:border-border",
                                )}
                              />
                            ) : (
                              <Input
                                type="number"
                                min={1}
                                max={480}
                                value={editDuration}
                                onChange={(e) =>
                                  setEditDuration(Number(e.target.value) || 1)
                                }
                                className={cn(
                                  "mt-2 h-10 w-28 rounded-lg border border-border bg-background px-2.5 text-[14px] text-foreground-intense outline-none",
                                  "focus:border-border",
                                )}
                              />
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 md:col-span-2">
                            <Button
                              type="button"
                              disabled={busy}
                              onClick={() => void saveEdit()}
                              variant="primary"
                              size="sm"
                            >
                              Save changes
                            </Button>
                            <Button
                              type="button"
                              disabled={busy}
                              onClick={() => setEditingId(null)}
                              size="sm"
                            >
                              Discard
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background-muted ring-1 ring-border">
                              <CalendarClock
                                className="size-5 text-foreground-intense"
                                aria-hidden
                              />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[16px] font-semibold text-foreground-intense">
                                {s.channelName}
                              </p>
                              <p className="mt-0.5 text-[14px] text-foreground-intense">
                                {formatRange(s.startsAt, s.endsAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <Button
                              type="button"
                              disabled={busy}
                              onClick={() => beginEdit(s)}
                              size="sm"
                            >
                              <Pencil className="size-3.5" aria-hidden />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              disabled={busy}
                              onClick={() => void cancelSchedule(s.id)}
                              variant="destructive"
                              size="sm"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="rec-library-heading">
            <h2
              id="rec-library-heading"
              className="text-lg font-semibold tracking-tight text-foreground-intense"
            >
              Finished recordings
            </h2>
            {!overview ? (
              <ZendeLoadingState className="mt-4 items-start text-left" size="small" label="Loading recording library…" />
            ) : overview.library.length === 0 ? (
              <p className="mt-4 text-[15px] text-foreground-intense">
                Finished recordings and failed captures appear here. Failed rows
                show the server error and cannot be played or downloaded.
              </p>
            ) : (
              <ul className="mt-4 grid gap-4 lg:grid-cols-2">
                {overview.library.map((item) => {
                  const isFailed = item.status === "FAILED";
                  return (
                  <li key={item.id}>
                    <Card
                      frame="glass"
                      className={cn(
                        "flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-stretch sm:justify-between sm:gap-6 sm:p-5",
                        isFailed && "border-error bg-error-subtle",
                      )}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-background-muted ring-1 ring-border">
                          {item.channelLogo ? (
                            <Image
                              src={secureImageUrl(item.channelLogo, undefined, "logo")!}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="56px"
                              unoptimized
                            />
                          ) : (
                            <span className="flex size-full items-center justify-center text-foreground-intense">
                              <Video className="size-6" aria-hidden />
                            </span>
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[16px] font-semibold text-foreground-intense">
                            {item.channelName}
                          </p>
                          <p className="mt-1 text-[13px] text-foreground-intense">
                            {item.endedAt
                              ? new Intl.DateTimeFormat(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                }).format(new Date(item.endedAt))
                              : "—"}{" "}
                            · {formatBytes(item.sizeBytes)} ·{" "}
                            <span
                              className={cn(
                                isFailed ? "text-error-strong" : "text-foreground-intense",
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
                              className="mt-2 line-clamp-3 text-[12px] leading-snug text-error-strong"
                              title={item.error ?? undefined}
                            >
                              {libraryFailSummary(item.error)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 sm:min-w-[11rem]">
                        {isFailed ? (
                          <span
                            className={cn(
                              "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-error bg-error-subtle px-4 text-[14px] font-semibold text-error-strong",
                            )}
                            role="status"
                          >
                            <AlertTriangle className="size-4 shrink-0" aria-hidden />
                            Encode failed
                          </span>
                        ) : (
                          <Link
                            href={`/watch?recording=${encodeURIComponent(item.id)}`}
                            className={buttonVariants({ variant: "primary", size: "sm" })}
                          >
                            <Play className="size-4" aria-hidden />
                            Play
                          </Link>
                        )}
                        <Button
                          type="button"
                          disabled={busy || isFailed}
                          onClick={() => void downloadRecording(item)}
                          size="sm"
                        >
                          <Download className="size-4" aria-hidden />
                          Download MP4
                        </Button>
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setLibraryDeleteError(null);
                            setLibraryDeleteTarget(item);
                          }}
                          variant="destructive"
                          size="sm"
                        >
                          <Trash2 className="size-4" aria-hidden />
                          Remove
                        </Button>
                      </div>
                    </Card>
                  </li>
                  );
                })}
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
            "pointer-events-none fixed inset-x-0 z-40 h-px bg-border",
            TV_BROWSE_STICKY_TOP_CLASS,
          )}
          aria-hidden
        />

        {libraryDeleteTarget ? (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-10 sm:px-6"
            role="presentation"
          >
            <Button variant="ghost"
              type="button"
              aria-label="Dismiss"
              className="absolute inset-0 bg-background backdrop-blur-md"
              onClick={() => {
                setLibraryDeleteTarget(null);
                setLibraryDeleteError(null);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="lib-del-title"
              className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl ring-1 ring-border"
            >
              <div className="flex items-start justify-between gap-3">
                <h2
                  id="lib-del-title"
                  className="text-[18px] font-semibold text-foreground-intense"
                >
                  Remove recording?
                </h2>
                <Button variant="ghost"
                  type="button"
                  className="rounded-lg p-2 text-foreground-intense hover:bg-background-muted hover:text-foreground-intense"
                  aria-label="Close"
                  onClick={() => {
                    setLibraryDeleteTarget(null);
                    setLibraryDeleteError(null);
                  }}
                >
                  <X className="size-5" />
                </Button>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-foreground-intense">
                This deletes{" "}
                <span className="font-medium text-foreground-intense">
                  {libraryDeleteTarget.channelName}
                </span>{" "}
                from the server permanently, including the MP4 file. This cannot be undone.
              </p>
              {libraryDeleteError ? (
                <p className="mt-3 text-[14px] text-error-strong">{libraryDeleteError}</p>
              ) : null}
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setLibraryDeleteTarget(null);
                    setLibraryDeleteError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirmDeleteLibraryRecording()}
                  variant="destructive"
                >
                  {busy ? (
                    <ZendeSpinner size="tiny" label="Removing recording" />
                  ) : (
                    <Trash2 className="size-4" aria-hidden />
                  )}
                  Remove from server
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {stuckStopDialog ? (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-10 sm:px-6"
            role="presentation"
          >
            <Button variant="ghost"
              type="button"
              aria-label="Dismiss"
              className="absolute inset-0 bg-background backdrop-blur-md"
              onClick={() => {
                setStuckStopDialog(null);
                setStuckStopError(null);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="stuck-stop-title"
              className="relative z-10 w-full max-w-md rounded-2xl border border-warning bg-background p-6 shadow-2xl ring-1 ring-border"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <AlertTriangle
                    className="mt-0.5 size-6 shrink-0 text-warning-strong"
                    aria-hidden
                  />
                  <h2
                    id="stuck-stop-title"
                    className="text-[18px] font-semibold leading-snug text-foreground-intense"
                  >
                    Stop unavailable
                  </h2>
                </div>
                <Button variant="ghost"
                  type="button"
                  className="rounded-lg p-2 text-foreground-intense hover:bg-background-muted hover:text-foreground-intense"
                  aria-label="Close"
                  onClick={() => {
                    setStuckStopDialog(null);
                    setStuckStopError(null);
                  }}
                >
                  <X className="size-5" />
                </Button>
              </div>
              <p className="mt-3 text-[15px] font-medium text-foreground-intense">
                {stuckStopDialog.channelName}
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-foreground-intense">
                {stuckStopDialog.message}
              </p>
              <p className="mt-3 text-[14px] leading-relaxed text-foreground-intense">
                You can remove this entry from the list and delete any partial file on
                the server. Use this only if the encoder is no longer running (for
                example after an update or restart).
              </p>
              {stuckStopError ? (
                <p className="mt-3 text-[14px] text-error-strong">{stuckStopError}</p>
              ) : null}
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setStuckStopDialog(null);
                    setStuckStopError(null);
                  }}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void forceRemoveStuckRecording()}
                  variant="destructive"
                >
                  {busy ? (
                    <ZendeSpinner size="tiny" label="Removing stuck recording" />
                  ) : (
                    <Trash2 className="size-4" aria-hidden />
                  )}
                  Force remove from list
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
      {actionError ? (
        <NavErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
      ) : null}
    </div>
  );
}
