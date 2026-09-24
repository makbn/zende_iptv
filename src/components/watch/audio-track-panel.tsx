"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

export type AudioTrackOption = {
  index: number;
  label: string;
  language?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  tracks: AudioTrackOption[];
  activeIndex: number;
  tvMode?: boolean;
  onSelect: (index: number) => void;
};

export function AudioTrackPanel({
  open,
  onClose,
  title,
  tracks,
  activeIndex,
  tvMode = false,
  onSelect,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !tvMode) return;
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>("[data-audio-primary]")
        ?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, tvMode, tracks.length, activeIndex]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      className={cn(
        "fixed inset-0 z-[140] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6",
        tvMode && "items-center p-8",
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Audio track"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.keyCode === 10009) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        className={cn(
          "flex max-h-[min(84vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c1220] shadow-2xl",
          tvMode && "max-h-[90vh] max-w-3xl rounded-3xl",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          data-tv-layout={tvMode ? "horizontal" : undefined}
          className={cn(
            "flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4",
            tvMode && "gap-6 px-8 py-5",
          )}
        >
          <div className="min-w-0">
            <p
              className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45",
                tvMode && "text-sm",
              )}
            >
              Audio
            </p>
            <h2
              className={cn(
                "mt-0.5 truncate text-[17px] font-semibold tracking-tight text-white",
                tvMode && "mt-1 text-2xl",
              )}
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-white/70 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40",
              tvMode && "size-14",
            )}
            aria-label="Close"
          >
            <X className={cn("size-5", tvMode && "size-7")} aria-hidden />
          </button>
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-4 py-4",
            tvMode && "px-6 py-5",
          )}
        >
          {tracks.length === 0 ? (
            <p
              className={cn(
                "py-8 text-center text-[14px] text-white/45",
                tvMode && "text-xl",
              )}
            >
              No audio tracks available.
            </p>
          ) : (
            <ul
              data-tv-layout={tvMode ? "vertical" : undefined}
              className="flex flex-col gap-2"
            >
              {tracks.map((track, i) => {
                const selected = activeIndex === track.index;
                return (
                  <li key={`${track.index}-${track.label}`}>
                    <button
                      type="button"
                      data-audio-primary={i === 0 ? "" : undefined}
                      onClick={() => {
                        onSelect(track.index);
                        onClose();
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left outline-none transition-colors",
                        "bg-white/[0.06] hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white/30",
                        selected && "bg-white/[0.12] ring-1 ring-white/30",
                        tvMode && "min-h-16 px-5 py-4",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <span
                            className={cn(
                              "shrink-0 text-[14px] font-semibold text-white",
                              tvMode && "text-xl",
                            )}
                          >
                            {track.label}
                          </span>
                          {track.language ? (
                            <span className="truncate text-[11px] uppercase text-white/40">
                              {track.language}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span className="flex size-5 shrink-0 items-center justify-center">
                        {selected ? (
                          <Check className="size-4 text-emerald-400" aria-hidden />
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
