"use client";

import { Input } from "@appica/ui-react/input";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Play, X } from "lucide-react";

import { Card } from "@appica/ui-react/card";
import { ZendeLoadingState, ZendeSpinner } from "@/components/loading/zende-spinner";
import { Button } from "@appica/ui-react/button";
import { cn } from "@/lib/utils";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { createWatchUrl } from "@/lib/navigation/watch-url";
import { secureImageUrl } from "@/lib/media/secure-image-url";
import {
  useLibraryCatalog,
} from "@/features/iptv/use-library-catalog";

const MAX = 6;
const SEARCH_PAGE_SIZE = 80;
type Props = { open: boolean; onClose: () => void };

export function WatchTogetherDialog({ open, onClose }: Props) {
  const router = useRouter();
  const labelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<M3uChannel[]>([]);
  const [launching, setLaunching] = useState(false);
  const [offset, setOffset] = useState(0);
  const { channels, loading, refreshing, hasMore } = useLibraryCatalog({
    enabled: open && debouncedQuery.length > 0,
    contentTab: "live",
    query: debouncedQuery,
    groupFilter: null,
    languageFilter: null,
    offset,
    pageSize: SEARCH_PAGE_SIZE,
  });

  const normalizedQuery = q.trim();
  const searchReady = normalizedQuery.length > 0 && normalizedQuery === debouncedQuery;
  const visibleChannels = useMemo(() => {
    if (!searchReady) return selected;
    const selectedUrls = new Set(selected.map((channel) => channel.url));
    const needle = debouncedQuery.toLocaleLowerCase();
    const results = channels.filter((channel) => {
      if (selectedUrls.has(channel.url)) return false;
      const searchable = `${channel.name} ${channel.groupTitle ?? ""} ${channel.tvgId ?? ""} ${channel.tvgLanguage ?? ""}`
        .toLocaleLowerCase();
      return searchable.includes(needle);
    });
    return [...selected, ...results];
  }, [channels, debouncedQuery, searchReady, selected]);
  const searchPending =
    normalizedQuery.length > 0 &&
    (!searchReady || loading || refreshing);
  const matchingResultCount = Math.max(0, visibleChannels.length - selected.length);

  // Reset local UI state when dialog opens.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setQ("");
      setDebouncedQuery("");
      setSelected([]);
      setOffset(0);
      inputRef.current?.focus();
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!normalizedQuery) {
      queueMicrotask(() => setDebouncedQuery(""));
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedQuery(normalizedQuery);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [normalizedQuery, open]);

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
      <Button variant="ghost"
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-background backdrop-blur-md motion-safe:animate-[glass-backdrop-in_0.28s_ease-out_both]"
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
        <Card
          frame="glass"
          className="flex flex-col overflow-hidden shadow-lg"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-border px-5 pb-3 pt-5">
            <div>
              <p
                id={labelId}
                className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground-intense"
              >
                Watch Together
              </p>
              <p className="mt-0.5 text-[15px] text-foreground-intense">
                Pick up to {MAX} channels — they&apos;ll play side-by-side.
              </p>
            </div>
            <Button variant="ghost"
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-4 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground-intense outline-none hover:bg-background-muted hover:text-foreground-intense"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="border-b border-border px-5 py-3">
            <Input
              ref={inputRef}
              type="search"
              placeholder="Search channels…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
              }}
              className={cn(
                "w-full rounded-xl bg-background-muted px-4 py-2.5 text-[15px] text-foreground-intense placeholder:text-foreground-intense",
                "border border-border outline-none transition-colors",
                "focus:border-border focus:bg-background-muted",
              )}
            />
          </div>

          {/* Channel list */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {visibleChannels.length > 0 ? (
              <ul className="divide-y divide-border">
                {visibleChannels.map((ch) => {
                  const isSelected = selected.some((c) => c.url === ch.url);
                  const atMax = !isSelected && selected.length >= MAX;
                  return (
                    <li key={ch.url}>
                      <Button variant="ghost"
                        type="button"
                        disabled={atMax}
                        onClick={() => toggle(ch)}
                        className={cn(
                          "flex w-full items-center gap-3 px-5 py-3 text-left outline-none transition-colors",
                          "hover:bg-background-muted focus-visible:bg-background-muted",
                          "disabled:cursor-not-allowed disabled:opacity-35",
                          isSelected && "bg-background-muted",
                        )}
                      >
                        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background-muted">
                          {ch.tvgLogo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={secureImageUrl(ch.tvgLogo, undefined, "logo")}
                              alt=""
                              className="h-full w-full object-contain"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                          ) : (
                            <span className="text-[11px] font-bold text-foreground-intense">
                              {ch.name.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium text-foreground-intense">
                            {ch.name}
                          </p>
                          {ch.groupTitle ? (
                            <p className="truncate text-[12px] text-foreground-intense">
                              {ch.groupTitle}
                            </p>
                          ) : null}
                        </div>

                        <div
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                            isSelected
                              ? "border-success bg-success-subtle"
                              : "border-border",
                          )}
                        >
                          {isSelected && (
                            <Check
                              className="h-3 w-3 text-foreground-inverse"
                              strokeWidth={3}
                            />
                          )}
                        </div>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {searchPending ? (
              <ZendeLoadingState className="py-10" size="small" label="Searching live channels…" />
            ) : searchReady && matchingResultCount === 0 ? (
              <p className="px-5 py-10 text-center text-[14px] text-foreground-intense">
                No channels match &quot;{q}&quot;
              </p>
            ) : null}
            {!searchPending && searchReady && matchingResultCount > 0 && hasMore ? (
              <div className="px-5 py-3">
                <Button variant="ghost"
                  type="button"
                  onClick={() => setOffset((n) => n + SEARCH_PAGE_SIZE)}
                  className={cn(
                    "w-full rounded-xl border border-border bg-background-muted px-4 py-2.5 text-[13px] font-semibold text-foreground-intense outline-none",
                    "hover:bg-background-muted focus-visible:ring-2 focus-visible:ring-border",
                    refreshing && "opacity-50",
                  )}
                  disabled={refreshing}
                >
                  {refreshing ? "Loading more…" : "Load more live channels"}
                </Button>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-5 py-4">
            {/* Selected pills */}
            {selected.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {selected.map((ch) => (
                  <span
                    key={ch.url}
                    className="flex items-center gap-1 rounded-full bg-background-muted px-2.5 py-1 text-[12px] font-medium text-foreground-intense"
                  >
                    <span className="max-w-[110px] truncate">{ch.name}</span>
                    <Button variant="ghost"
                      type="button"
                      onClick={() => toggle(ch)}
                      aria-label={`Remove ${ch.name}`}
                      className="ml-0.5 text-foreground-intense outline-none hover:text-foreground-intense"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </span>
                ))}
              </div>
            )}

            <Button
              type="button"
              disabled={selected.length === 0 || launching}
              onClick={() => void handleWatch()}
              variant="primary"
              size="lg"
              className="w-full"
            >
              {launching ? (
                <ZendeSpinner size="tiny" label="Starting watch together" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
              {launching
                ? "Starting…"
                : selected.length === 0
                  ? "Select channels to watch"
                  : `Watch ${selected.length} channel${selected.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
