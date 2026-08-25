"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Search, Sparkles } from "lucide-react";

import { ZendeGlass } from "@/components/glass/zende-glass";
import { Button, buttonVariants } from "@/components/ui/button";
import { useRemoteControl } from "@/features/remote/remote-control-context";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function GlassSearchModal({ open, onClose }: Props) {
  const router = useRouter();
  const remote = useRemoteControl();
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
    const href = s ? `/library?q=${encodeURIComponent(s)}#grid` : "/library#grid";
    onClose();
    if (remote?.activeSession) {
      void remote.sendNavigate(href);
      return;
    }
    router.push(href);
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[min(12vh,104px)] sm:px-6"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Dismiss"
        className={cn(
          "absolute inset-0 bg-black/64 backdrop-blur-xl",
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
          <ZendeGlass variant="panel" className="overflow-hidden rounded-[34px] shadow-[0_50px_160px_-52px_rgba(0,0,0,0.98)]">
            <div className="relative overflow-hidden border-b border-white/[0.08] px-5 pb-5 pt-5 sm:px-6">
              <div
                className="absolute -right-12 -top-20 h-52 w-52 rounded-full bg-[var(--zen-signal)]/16 blur-3xl"
                aria-hidden
              />
              <div
                className="absolute -bottom-24 left-1/4 h-44 w-44 rounded-full bg-[var(--zen-ember)]/10 blur-3xl"
                aria-hidden
              />
              <p id={labelId} className="zen-kicker">
                Signal search
              </p>
              <p className="mt-2 max-w-[10ch] text-[clamp(2rem,8vw,3.6rem)] font-semibold leading-[0.86] tracking-[-0.08em] text-white">
                Tune the catalog.
              </p>
              <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-white/54">
                Type a channel, country, language, or number. Results open in Library
                with the full filter deck still in reach.
              </p>
            </div>
            <form
              className="p-5 sm:p-6"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <label className="relative block">
                <span className="sr-only">Search channels</span>
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[var(--zen-signal)]/75"
                  aria-hidden
                />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Channel, country, language, number…"
                  inputMode="search"
                  aria-label="Search channels"
                  className={cn(
                    "h-14 w-full rounded-[22px] border border-white/[0.13] bg-black/36 pl-12 pr-4",
                    "text-[18px] font-semibold tracking-[-0.025em] text-white placeholder:text-white/34 shadow-inner shadow-black/20",
                    "outline-none ring-offset-[var(--tv-page-bg)] focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]",
                  )}
                  autoComplete="off"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-semibold text-white/48">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.055] px-3 py-1.5">
                  <Sparkles className="size-3.5 text-[var(--zen-signal)]/75" aria-hidden />
                  Try 101
                </span>
                <span className="rounded-full border border-white/[0.1] bg-white/[0.055] px-3 py-1.5">
                  Sports
                </span>
                <span className="rounded-full border border-white/[0.1] bg-white/[0.055] px-3 py-1.5">
                  English
                </span>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
                <Button
                  type="submit"
                  variant="success"
                  size="lg"
                >
                  Show results
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
                <Link
                  href="/library#grid"
                  onClick={(event) => {
                    if (!remote?.activeSession) {
                      onClose();
                      return;
                    }
                    event.preventDefault();
                    onClose();
                    void remote.sendNavigate("/library#grid");
                  }}
                  className={buttonVariants({ variant: "normal", size: "lg" })}
                >
                  Browse all
                </Link>
              </div>
            </form>
          </ZendeGlass>
        </div>
      </div>
    </div>
  );
}
