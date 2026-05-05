"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function GlassSearchModal({ open, onClose }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setQ("");
      inputRef.current?.focus();
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function submit() {
    const s = q.trim();
    onClose();
    if (s) router.push(`/library?q=${encodeURIComponent(s)}#grid`);
    else router.push("/library#grid");
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[min(18vh,140px)] sm:px-6"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Dismiss"
        className={cn(
          "absolute inset-0 bg-black/55 backdrop-blur-md",
          "motion-safe:animate-[glass-backdrop-in_0.28s_ease-out_both]",
        )}
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-[560px] outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
      >
        <div className="motion-safe:animate-[glass-modal-pop_0.42s_cubic-bezier(0.16,1,0.3,1)_both]">
          <ZenedeGlass variant="panel" className="overflow-hidden shadow-[0_40px_120px_-48px_rgba(0,0,0,0.95)]">
            <div className="border-b border-white/[0.07] px-5 pb-3 pt-5">
              <p id={labelId} className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/45">
                Search
              </p>
              <p className="mt-1 text-[15px] text-white/55">
                Find a channel in your Library catalog.
              </p>
            </div>
            <form
              className="p-5"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Type a channel name…"
                className={cn(
                  "mb-4 h-12 w-full rounded-xl border border-white/[0.12] bg-black/25 px-4",
                  "text-[17px] text-white placeholder:text-white/35",
                  "outline-none ring-offset-[var(--tv-page-bg)] focus-visible:ring-2 focus-visible:ring-white",
                )}
                autoComplete="off"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="rounded-full bg-white px-5 py-2 text-[15px] font-semibold text-black transition-colors hover:bg-white/90"
                >
                  Show results
                </button>
                <Link
                  href="/library#grid"
                  onClick={onClose}
                  className="rounded-full border border-white/[0.18] px-5 py-2 text-[15px] font-medium text-white/85 transition-colors hover:bg-white/[0.06]"
                >
                  Browse all
                </Link>
              </div>
            </form>
          </ZenedeGlass>
        </div>
      </div>
    </div>
  );
}
