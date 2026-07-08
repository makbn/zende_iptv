"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Play, X } from "lucide-react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { cn } from "@/lib/utils";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { createWatchUrl } from "@/lib/navigation/watch-url";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import {
  useLibraryCatalog,
} from "@/features/iptv/use-library-catalog";

const MAX = 6;
const source = BUILTIN_PLAYLIST_SOURCES[0]!;

type Props = { open: boolean; onClose: () => void };

export function WatchTogetherDialog({ open, onClose }: Props) {
  const router = useRouter();
  const labelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<M3uChannel[]>([]);
  const [launching, setLaunching] = useState(false);
  const [offset, setOffset] = useState(0);
  const { channels, loading, refreshing, hasMore } = useLibraryCatalog({
    presetId: source.presetId,
    contentTab: "live",
    query: q,
    groupFilter: null,
    languageFilter: null,
    offset,
    pageSize: 500,
  });

  // Reset local UI state when dialog opens.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setQ("");
      setSelected([]);
      setOffset(0);
      inputRef.current?.focus();
    });
  }, [open]);

  useEffect(() => {
    setOffset(0);
  }, [q]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);

  const toggle = useCallback((ch: M3uChannel) => {
    setSelected((prev) => {
      const already = prev.some((c) => c.url === ch.url);
      if (already) return prev.filter((c) => c.url !== ch.url);
      if (prev.length >= MAX) return prev;
      return [...prev, ch];
    });
  }, []);

  const handleWatch = useCallback(async () => {
    if (selected.length === 0 || launching) return;
    setLaunching(true);
    try {
      const watchUrls = await Promise.all(
        selected.map((ch) => createWatchUrl(ch)),
      );
      const ids = watchUrls
        .map((u) =>
          new URL(u, window.location.origin).searchParams.get("id"),
        )
        .filter(Boolean)
        .join(",");
      onClose();
      router.push(`/board?ids=${ids}`);
    } catch {
      setLaunching(false);
    }
  }, [selected, launching, onClose, router]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[min(10vh,80px)] sm:px-6"
      role="presentation"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/60 backdrop-blur-md motion-safe:animate-[glass-backdrop-in_0.28s_ease-out_both]"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className="relative z-10 flex w-full max-w-[580px] flex-col outline-none motion-safe:animate-[glass-modal-pop_0.42s_cubic-bezier(0.16,1,0.3,1)_both]"
        style={{ maxHeight: "calc(100dvh - 64px)" }}
      >
        <ZenedeGlass
          variant="panel"
          className="flex flex-col overflow-hidden shadow-[0_40px_120px_-48px_rgba(0,0,0,0.95)]"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-white/[0.07] px-5 pb-3 pt-5">
            <div>
              <p
                id={labelId}
                className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/45"
              >
                Watch Together
              </p>
              <p className="mt-0.5 text-[15px] text-white/55">
                Pick up to {MAX} channels — they&apos;ll play side-by-side.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-4 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/40 outline-none hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Search */}
          <div className="border-b border-white/[0.07] px-5 py-3">
            <input
              ref={inputRef}
              type="search"
              placeholder="Search channels…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className={cn(
                "w-full rounded-xl bg-white/[0.06] px-4 py-2.5 text-[15px] text-white/90 placeholder:text-white/30",
                "border border-white/[0.08] outline-none transition-colors",
                "focus:border-white/20 focus:bg-white/[0.08]",
              )}
            />
          </div>

          {/* Channel list */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {loading || refreshing ? (
              <div className="flex items-center justify-center py-14">
                <Loader2 className="h-6 w-6 animate-spin text-white/30" />
              </div>
            ) : channels.length === 0 ? (
              <p className="px-5 py-10 text-center text-[14px] text-white/35">
                No channels match &quot;{q}&quot;
              </p>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {channels.slice(0, 500).map((ch) => {
                  const isSelected = selected.some((c) => c.url === ch.url);
                  const atMax = !isSelected && selected.length >= MAX;
                  return (
                    <li key={ch.url}>
                      <button
                        type="button"
                        disabled={atMax}
                        onClick={() => toggle(ch)}
                        className={cn(
                          "flex w-full items-center gap-3 px-5 py-3 text-left outline-none transition-colors",
                          "hover:bg-white/[0.05] focus-visible:bg-white/[0.07]",
                          "disabled:cursor-not-allowed disabled:opacity-35",
                          isSelected && "bg-white/[0.06]",
                        )}
                      >
                        {/* Channel logo */}
                        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.07]">
                          {ch.tvgLogo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={ch.tvgLogo}
                              alt=""
                              className="h-full w-full object-contain"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                          ) : (
                            <span className="text-[11px] font-bold text-white/35">
                              {ch.name.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>

                        {/* Name + group */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium text-white/90">
                            {ch.name}
                          </p>
                          {ch.groupTitle ? (
                            <p className="truncate text-[12px] text-white/35">
                              {ch.groupTitle}
                            </p>
                          ) : null}
                        </div>

                        {/* Checkmark */}
                        <div
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                            isSelected
                              ? "border-emerald-400 bg-emerald-400"
                              : "border-white/25",
                          )}
                        >
                          {isSelected && (
                            <Check
                              className="h-3 w-3 text-black"
                              strokeWidth={3}
                            />
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {!loading && channels.length > 0 && hasMore ? (
              <div className="px-5 py-3">
                <button
                  type="button"
                  onClick={() => setOffset((n) => n + 500)}
                  className={cn(
                    "w-full rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 py-2.5 text-[13px] font-semibold text-white/85 outline-none",
                    "hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white",
                    refreshing && "opacity-50",
                  )}
                  disabled={refreshing}
                >
                  {refreshing ? "Loading more…" : "Load more live channels"}
                </button>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="border-t border-white/[0.07] px-5 py-4">
            {/* Selected pills */}
            {selected.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {selected.map((ch) => (
                  <span
                    key={ch.url}
                    className="flex items-center gap-1 rounded-full bg-white/[0.08] px-2.5 py-1 text-[12px] font-medium text-white/80"
                  >
                    <span className="max-w-[110px] truncate">{ch.name}</span>
                    <button
                      type="button"
                      onClick={() => toggle(ch)}
                      aria-label={`Remove ${ch.name}`}
                      className="ml-0.5 text-white/40 outline-none hover:text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={selected.length === 0 || launching}
              onClick={() => void handleWatch()}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-full px-6 py-3",
                "text-[15px] font-semibold outline-none transition-colors",
                "bg-white text-black hover:bg-white/90",
                "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              {launching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
              {launching
                ? "Starting…"
                : selected.length === 0
                  ? "Select channels to watch"
                  : `Watch ${selected.length} channel${selected.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </ZenedeGlass>
      </div>
    </div>
  );
}
