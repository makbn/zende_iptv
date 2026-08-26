"use client";

import { useCallback, useState } from "react";

import { AppicaConfirmDialog } from "@/components/appica/confirm-dialog";
import { Button } from "@appica/ui-react/button";
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
        "rounded-2xl border border-border bg-background-muted p-6 ring-1 ring-border",
      )}
      aria-labelledby="personal-library-heading"
    >
      <h2
        id="personal-library-heading"
        className="text-[18px] font-semibold text-foreground-intense"
      >
        Recently watched & favorites
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-foreground-intense">
        Home rows and Favorites are built from your watch history and saved
        channels. Reset them here without touching your catalog or manual
        channels.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="destructive"
          disabled={busy}
          onClick={() => setConfirmKind("favorites")}
        >
          {busy ? "Clearing…" : "Clear favorites"}
        </Button>
        <Button
          type="button"
          variant="destructive"
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
              ? "text-success-strong"
              : "text-warning-strong",
          )}
        >
          {status}
        </p>
      ) : null}

      <AppicaConfirmDialog
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
