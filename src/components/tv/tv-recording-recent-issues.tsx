"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Calendar,
  ExternalLink,
  Loader2,
  Radio,
  Trash2,
  X,
} from "lucide-react";

export type RecordingIssueItem = {
  id: string;
  channelName: string;
  channelUrl: string;
  channelLogo: string | null;
  channelGroup: string | null;
  scheduleId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  error: string | null;
};

function errorSummary(error: string | null): string {
  if (!error?.trim()) return "Recording failed — no message was captured.";
  const line = error.split(/\r?\n/).find((l) => l.trim())?.trim() ?? error.trim();
  return line.length > 140 ? `${line.slice(0, 137)}…` : line;
}

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export function TvRecordingRecentIssues({
  issues,
  onRefresh,
}: {
  issues: RecordingIssueItem[];
  onRefresh: () => void | Promise<void>;
}) {
  const [detail, setDetail] = useState<RecordingIssueItem | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetail(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail]);

  const handleClear = useCallback(async () => {
    if (!detail) return;
    setClearing(true);
    setClearError(null);
    try {
      const res = await zendeFetch(
        `/api/recordings/${encodeURIComponent(detail.id)}`,
        { method: "DELETE" },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setClearError(
          typeof body.error === "string" ? body.error : `Request failed (${res.status})`,
        );
        setClearing(false);
        return;
      }
      setDetail(null);
      await onRefresh();
    } catch {
      setClearError("Network error — try again.");
    } finally {
      setClearing(false);
    }
  }, [detail, onRefresh]);

  if (issues.length === 0) return null;

  return (
    <>
      <section aria-labelledby="rec-fail-heading" className="pb-6">
        <h2
          id="rec-fail-heading"
          className="text-lg font-semibold tracking-tight text-white/80"
        >
          Recent issues
        </h2>
        <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-white/40">
          Failed captures stay here until you clear them. Open details for the full log.
        </p>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {issues.map((item) => {
            const when =
              formatWhen(item.endedAt) ??
              formatWhen(item.createdAt) ??
              "—";
            const source = item.scheduleId ? "Scheduled" : "Record now";
            return (
              <li key={item.id}>
                <ZenedeGlass
                  variant="panel"
                  className="flex h-full flex-col gap-4 rounded-[1.1rem] border border-red-500/15 bg-gradient-to-br from-red-950/[0.35] to-black/40 p-4 ring-1 ring-red-500/10"
                >
                  <div className="flex min-w-0 gap-3">
                    <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-white/[0.06] ring-1 ring-white/[0.08]">
                      {item.channelLogo ? (
                        <Image
                          src={item.channelLogo}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="48px"
                          unoptimized
                        />
                      ) : (
                        <span className="flex size-full items-center justify-center text-red-300/50">
                          <Radio className="size-5" aria-hidden />
                        </span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[15px] font-semibold text-white">
                          {item.channelName}
                        </p>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-400/25 bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-200/90">
                          <AlertTriangle className="size-3" aria-hidden />
                          Failed
                        </span>
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-white/45">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="size-3.5 shrink-0 opacity-70" aria-hidden />
                          {when}
                        </span>
                        <span className="text-white/25">·</span>
                        <span>{source}</span>
                        {item.channelGroup ? (
                          <>
                            <span className="text-white/25">·</span>
                            <span className="truncate">{item.channelGroup}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <p className="line-clamp-2 text-[13px] leading-snug text-red-200/75">
                    {errorSummary(item.error)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setClearError(null);
                      setDetail(item);
                    }}
                    className={cn(
                      "mt-auto inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold outline-none transition-colors",
                      "border border-white/[0.14] bg-white/[0.08] text-white hover:bg-white/[0.12]",
                    )}
                  >
                    Details
                  </button>
                </ZenedeGlass>
              </li>
            );
          })}
        </ul>
      </section>

      {detail ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-10 sm:px-6"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-black/70 backdrop-blur-md motion-safe:animate-[glass-backdrop-in_0.25s_ease-out_both]"
            onClick={() => setDetail(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rec-issue-dialog-title"
            className="relative z-10 w-full max-w-lg motion-safe:animate-[glass-modal-pop_0.36s_cubic-bezier(0.16,1,0.3,1)_both]"
          >
            <ZenedeGlass
              variant="panel"
              className="max-h-[min(85vh,640px)] overflow-hidden border border-white/[0.12] shadow-[0_40px_120px_-48px_rgba(0,0,0,0.95)]"
            >
              <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
                <div className="min-w-0">
                  <p
                    id="rec-issue-dialog-title"
                    className="text-[12px] font-semibold uppercase tracking-[0.14em] text-red-300/80"
                  >
                    Recording issue
                  </p>
                  <p className="mt-1 truncate text-[18px] font-semibold text-white">
                    {detail.channelName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="shrink-0 rounded-lg p-2 text-white/40 outline-none transition-colors hover:bg-white/[0.08] hover:text-white/85"
                  aria-label="Close"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="max-h-[calc(min(85vh,640px)-8.5rem)] space-y-4 overflow-y-auto px-5 py-4">
                <dl className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
                  <div className="rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2">
                    <dt className="text-white/40">Status</dt>
                    <dd className="mt-0.5 font-medium text-red-200/90">Failed</dd>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2">
                    <dt className="text-white/40">Source</dt>
                    <dd className="mt-0.5 font-medium text-white/85">
                      {detail.scheduleId ? "Scheduled recording" : "Record now"}
                    </dd>
                  </div>
                  {detail.channelGroup ? (
                    <div className="rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 sm:col-span-2">
                      <dt className="text-white/40">Group</dt>
                      <dd className="mt-0.5 font-medium text-white/85">
                        {detail.channelGroup}
                      </dd>
                    </div>
                  ) : null}
                  <div className="rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2">
                    <dt className="text-white/40">Started</dt>
                    <dd className="mt-0.5 font-medium text-white/85">
                      {formatWhen(detail.startedAt) ?? "—"}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2">
                    <dt className="text-white/40">Ended</dt>
                    <dd className="mt-0.5 font-medium text-white/85">
                      {formatWhen(detail.endedAt) ?? "—"}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 sm:col-span-2">
                    <dt className="text-white/40">Recording id</dt>
                    <dd className="mt-0.5 font-mono text-[12px] text-white/70 break-all">
                      {detail.id}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 sm:col-span-2">
                    <dt className="mb-1 flex items-center gap-1.5 text-white/40">
                      Stream URL
                      <ExternalLink className="size-3 opacity-50" aria-hidden />
                    </dt>
                    <dd className="font-mono text-[11px] leading-relaxed text-white/65 break-all">
                      {detail.channelUrl}
                    </dd>
                  </div>
                </dl>

                <div>
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-white/45">
                    Error log
                  </p>
                  <pre className="max-h-[220px] overflow-auto rounded-xl border border-red-500/20 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-red-100/85 [scrollbar-width:thin]">
                    {detail.error?.trim() || "No error text was stored."}
                  </pre>
                </div>

                {clearError ? (
                  <p className="text-[13px] text-red-300/90">{clearError}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/[0.08] bg-black/20 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.06] px-5 text-[14px] font-medium text-white/75 outline-none transition-colors hover:bg-white/[0.1] hover:text-white"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={clearing}
                  onClick={() => void handleClear()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/20 px-5 text-[14px] font-semibold text-red-100 outline-none transition-colors hover:bg-red-500/30 disabled:opacity-45"
                >
                  {clearing ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="size-4" aria-hidden />
                  )}
                  Clear
                </button>
              </div>
            </ZenedeGlass>
          </div>
        </div>
      ) : null}
    </>
  );
}
