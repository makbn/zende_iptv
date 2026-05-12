"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CircleStop,
  Download,
  Loader2,
  Radio,
  Search,
  Trash2,
  Video,
} from "lucide-react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { createClientLogger } from "@/core/logging/client";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { parseChannelLabel } from "@/lib/channel/channel-label";
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
  channelGroup: string | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  sizeBytes: string | null;
};

type OverviewPayload = {
  ffmpegAvailable: boolean;
  schedules: ApiSchedule[];
  active: ApiActive[];
  library: ApiLibraryItem[];
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
  if (!n) return "Pending";
  const value = BigInt(n);
  if (value < BigInt(1024)) return `${value} B`;
  const kb = Number(value) / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
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

  const filteredChannels = useMemo(() => {
    const q = channelQuery.trim().toLowerCase();
    const list = q
      ? channels.filter((channel) => {
          const label = parseChannelLabel(channel.name).displayName.toLowerCase();
          const group = (channel.groupTitle ?? "").toLowerCase();
          return label.includes(q) || group.includes(q);
        })
      : channels;
    return list.slice(0, 18);
  }, [channelQuery, channels]);

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
        alert(typeof body?.error === "string" ? body.error : "Could not create schedule.");
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
        alert(typeof body?.error === "string" ? body.error : "Could not start recording.");
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
      if (!res.ok) alert("Stop failed.");
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
      if (!res.ok) alert("Cancel failed.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const downloadRecording = async (item: ApiLibraryItem) => {
    const res = await zendeFetch(`/api/recordings/${item.id}/download`);
    if (!res.ok) {
      alert("Download failed.");
      return;
    }
    const blob = await res.blob();
    const safe = `${item.channelName.replace(/[^\w\s-]/g, "").trim().slice(0, 64) || "recording"}.mp4`;
    downloadBlob(safe, blob);
  };

  if (!catalogLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--tv-page-bg)] px-4 text-white/45">
        <p className="text-[15px] font-medium">Loading…</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--tv-page-bg)] pb-28 pt-[6.25rem] text-foreground">
      <section className="px-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">
          Zenede
        </p>
        <h1 className="mt-2 text-[34px] font-semibold leading-none tracking-tight text-white">
          Recordings
        </h1>
        <p className="mt-3 max-w-[32ch] text-[15px] leading-relaxed text-white/50">
          Schedule captures, monitor live encodes, and download finished MP4 files.
        </p>
      </section>

      <div className="mt-6 space-y-6 px-4">
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

        <ZenedeGlass
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
              className="h-12 w-full rounded-2xl border border-white/[0.1] bg-black/35 pl-11 pr-3 text-[16px] text-white outline-none placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-white/25"
            />
          </label>

          <div className="tv-row-scroll mt-3 flex gap-2 overflow-x-auto pb-1">
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
                  tab === id ? "bg-white text-zinc-950" : "text-white/55",
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
                className="flex min-h-[52px] items-center justify-center rounded-2xl bg-white text-[15px] font-semibold text-zinc-950 disabled:opacity-45"
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
        </ZenedeGlass>

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

        {overview?.library.length ? (
          <section aria-labelledby="mobile-recording-library">
            <h2 id="mobile-recording-library" className="text-[20px] font-semibold text-white">
              Finished
            </h2>
            <div className="mt-3 grid gap-3">
              {overview.library.slice(0, 20).map((item) => (
                <div key={item.id} className="rounded-[24px] border border-white/[0.08] bg-white/[0.04] p-4">
                  <p className="truncate text-[16px] font-semibold text-white">
                    {item.channelName}
                  </p>
                  <p className="mt-1 text-[13px] text-white/45">
                    {item.status} · {formatBytes(item.sizeBytes)}
                  </p>
                  <button
                    type="button"
                    onClick={() => void downloadRecording(item)}
                    className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[14px] font-semibold text-zinc-950"
                  >
                    <Download className="size-4" aria-hidden />
                    Download
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
