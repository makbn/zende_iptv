"use client";

import { useCallback, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ZendeGlass } from "@/components/glass/zende-glass";
import { clearAllFavorites } from "@/lib/favorites/favorites-store";
import { clearViewingHistory } from "@/lib/watch/viewing-stats";
import { cn } from "@/lib/utils";

export function TvPersonalLibraryCard() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const resetPersonalData = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    try {
      await Promise.all([clearViewingHistory(), clearAllFavorites()]);
      setStatus("Recently watched and favorites cleared.");
      setConfirmOpen(false);
    } catch {
      setStatus("Could not clear everything — try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section
      className={cn(
        "rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 ring-1 ring-white/[0.04]",
      )}
      aria-labelledby="personal-library-heading"
    >
      <h2
        id="personal-library-heading"
        className="text-[18px] font-semibold text-white"
      >
        Recently watched & favorites
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-white/50">
        Home rows and Favorites are built from your watch history and saved
        channels. Reset them here without touching your catalog or manual
        channels.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmOpen(true)}
          className="outline-none disabled:opacity-50"
        >
          <ZendeGlass variant="heroSecondary" className="inline-block">
            <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-white">
              {busy ? "Clearing…" : "Clear recently watched & favorites"}
            </span>
          </ZendeGlass>
        </button>
      </div>

      {status ? (
        <p
          className={cn(
            "mt-4 text-[15px] leading-relaxed",
            status.includes("cleared")
              ? "text-emerald-400/95"
              : "text-amber-300/95",
          )}
        >
          {status}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="Clear recently watched and favorites?"
        description="This removes your watch history and saved channels on this account. It cannot be undone."
        confirmLabel="Clear all"
        destructive
        busy={busy}
        onConfirm={() => void resetPersonalData()}
        onCancel={() => {
          if (!busy) setConfirmOpen(false);
        }}
      />
    </section>
  );
}
