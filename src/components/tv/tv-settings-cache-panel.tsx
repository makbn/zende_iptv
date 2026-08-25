"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/features/auth/auth-context";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { ZendeSpinner } from "@/components/loading/zende-spinner";

type CacheSnapshot = {
  id: string;
  label: string;
  description: string;
  entries: number;
  bytes: number | null;
  inFlight: number;
  ttlMs: number;
  detail?: string;
};

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "Memory indexed";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatTtl(ttlMs: number): string {
  const minutes = Math.round(ttlMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr`;
  return `${Math.round(hours / 24)} days`;
}

export function TvSettingsCachePanel() {
  const { user } = useAuth();
  const [caches, setCaches] = useState<CacheSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState<string | null>(null);
  const [pendingClear, setPendingClear] = useState<CacheSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (user?.role !== "ADMIN") return;
    setLoading(true);
    try {
      const response = await zendeFetch("/api/admin/caches", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not load cache status.");
      setCaches(Array.isArray(body.caches) ? body.caches : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load cache status.");
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  if (user?.role !== "ADMIN") return null;

  const clearCache = async () => {
    const cache = pendingClear;
    if (!cache) return;
    setClearing(cache.id);
    setMessage(null);
    try {
      const response = await zendeFetch("/api/admin/caches", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cache: cache.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Cache could not be cleared.");
      setCaches(Array.isArray(body.caches) ? body.caches : []);
      setMessage(`${cache.label} cache cleared.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cache could not be cleared.");
    } finally {
      setClearing(null);
      setPendingClear(null);
    }
  };

  return (
    <section className="rounded-[28px] border border-white/[0.1] bg-white/[0.04] p-5 ring-1 ring-white/[0.04] sm:p-6" aria-labelledby="cache-management-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="zen-kicker">Administrator only</p>
          <h2 id="cache-management-heading" className="mt-1 text-[18px] font-semibold text-white">
            Cache management
          </h2>
          <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-white/50">
            Clear one resource pool without disturbing the others. Active viewers continue normally; the next uncached request refills that pool.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={loading || clearing != null}
          onClick={() => void load()}
        >
          {loading ? <><ZendeSpinner size="tiny" label="Refreshing cache status" /> Refreshing…</> : "Refresh status"}
        </Button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {caches.map((cache) => (
          <article key={cache.id} className="rounded-[20px] border border-white/[0.09] bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-white">{cache.label}</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-white/42">{cache.description}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={clearing != null}
                onClick={() => setPendingClear(cache)}
                className="shrink-0"
              >
                {clearing === cache.id ? "Clearing…" : "Clear"}
              </Button>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
              <div><dt className="text-white/35">Entries</dt><dd className="mt-0.5 font-medium text-white/80">{cache.entries.toLocaleString()}</dd></div>
              <div><dt className="text-white/35">Stored</dt><dd className="mt-0.5 font-medium text-white/80">{formatBytes(cache.bytes)}</dd></div>
              <div><dt className="text-white/35">Retention</dt><dd className="mt-0.5 font-medium text-white/80">{formatTtl(cache.ttlMs)}</dd></div>
            </dl>
            {cache.detail || cache.inFlight > 0 ? (
              <p className="mt-3 text-[11px] text-white/34">
                {[cache.detail, cache.inFlight > 0 ? `${cache.inFlight} loading now` : null].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </article>
        ))}
      </div>
      {message ? <p className="mt-4 text-[13px] text-white/60" role="status">{message}</p> : null}
      <ConfirmDialog
        open={Boolean(pendingClear)}
        title={`Clear ${pendingClear?.label ?? "this cache"}?`}
        description="New requests will fetch this data again from its source. Other cache pools will not be affected."
        confirmLabel="Clear cache"
        destructive
        busy={clearing != null}
        onCancel={() => {
          if (!clearing) setPendingClear(null);
        }}
        onConfirm={() => void clearCache()}
      />
    </section>
  );
}
