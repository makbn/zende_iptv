"use client";

import { useEffect, useRef } from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    cancelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <ZenedeGlass variant="panelCompact" className="rounded-2xl border-white/10">
          <div className="px-5 py-5">
            <h2
              id="confirm-dialog-title"
              className="text-[18px] font-semibold text-white"
            >
              {title}
            </h2>
            <p
              id="confirm-dialog-desc"
              className="mt-2 text-[15px] leading-relaxed text-white/55"
            >
              {description}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                disabled={busy}
                onClick={onCancel}
                className="min-h-11 rounded-xl border border-white/12 bg-white/6 px-4 text-[14px] font-semibold text-white outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white disabled:opacity-45"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className={cn(
                  "min-h-11 rounded-xl px-4 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-45",
                  destructive
                    ? "bg-red-500/90 text-white hover:bg-red-500"
                    : "bg-white text-zinc-950 hover:shadow-md",
                )}
              >
                {busy ? "Working…" : confirmLabel}
              </button>
            </div>
          </div>
        </ZenedeGlass>
      </div>
    </div>
  );
}
