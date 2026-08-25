"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { ZendeGlass } from "@/components/glass/zende-glass";
import { Button } from "@/components/ui/button";
import { ZendeSpinner } from "@/components/loading/zende-spinner";

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
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    cancelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="zende-confirm-layer"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="zende-confirm-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <ZendeGlass variant="panelCompact" className="rounded-2xl border-white/10">
          <div className="px-5 py-5">
            <h2
              id={titleId}
              className="text-[18px] font-semibold text-white"
            >
              {title}
            </h2>
            <p
              id={descriptionId}
              className="mt-2 text-[15px] leading-relaxed text-white/55"
            >
              {description}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                ref={cancelRef}
                type="button"
                disabled={busy}
                onClick={onCancel}
              >
                {cancelLabel}
              </Button>
              <Button
                type="button"
                variant={destructive ? "danger" : "success"}
                disabled={busy}
                onClick={onConfirm}
              >
                {busy ? <><ZendeSpinner size="tiny" label="Working" /> Working…</> : confirmLabel}
              </Button>
            </div>
          </div>
        </ZendeGlass>
      </div>
    </div>,
    document.body,
  );
}
