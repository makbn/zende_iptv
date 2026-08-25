"use client";

import { useCallback, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { clearAllFavorites } from "@/lib/favorites/favorites-store";
import { clearViewingHistory } from "@/lib/watch/viewing-stats";
import { cn } from "@/lib/utils";

export function TvPersonalLibraryCard() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<"favorites" | "history" | null>(null);

  const resetPersonalData = useCallback(async (kind: "favorites" | "history") => {
    setBusy(true);
    setStatus(null);
    try {
      if (kind === "favorites") {
        await clearAllFavorites();
        setStatus("Favorites cleared.");
      } else {
        await clearViewingHistory();
        setStatus("Recently watched cleared.");
      }
      setConfirmKind(null);
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
        <Button
          type="button"
          variant="danger"
          disabled={busy}
          onClick={() => setConfirmKind("favorites")}
        >
          {busy ? "Clearing…" : "Clear favorites"}
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={busy}
          onClick={() => setConfirmKind("history")}
        >
          {busy ? "Clearing…" : "Clear recently watched"}
        </Button>
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
        open={confirmKind !== null}
        title={confirmKind === "favorites" ? "Clear all favorites?" : "Clear recently watched?"}
        description={
          confirmKind === "favorites"
            ? "This removes every saved channel and media item from your account. Your watch history is kept."
            : "This removes your viewing history and resume positions. Your favorites are kept."
        }
        confirmLabel={confirmKind === "favorites" ? "Clear favorites" : "Clear history"}
        destructive
        busy={busy}
        onConfirm={() => {
          if (confirmKind) void resetPersonalData(confirmKind);
        }}
        onCancel={() => {
          if (!busy) setConfirmKind(null);
        }}
      />
    </section>
  );
}
