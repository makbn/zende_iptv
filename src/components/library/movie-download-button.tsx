"use client";

import { Button } from "@appica/ui-react/button";
import { useToastManager } from "@appica/ui-react/toast";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";

import { ZendeSpinner } from "@/components/loading/zende-spinner";
import { useAuth } from "@/features/auth/auth-context";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import type { CreateWatchInput } from "@/lib/navigation/watch-url";
import { cn } from "@/lib/utils";

type Props = {
  channel: CreateWatchInput;
  className?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
};

export function MovieDownloadButton({ channel, className, size = "sm", showLabel = false }: Props) {
  const { user } = useAuth();
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToastManager<{ icon?: React.ReactNode }>();

  useEffect(() => {
    if (user?.role !== "ADMIN") {
      return;
    }
    let live = true;
    void zendeFetch("/api/settings/internal-downloads", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => { if (live) setConfigured(response.ok && body.configured === true); })
      .catch(() => { if (live) setConfigured(false); });
    return () => { live = false; };
  }, [user?.role]);

  if (user?.role !== "ADMIN" || !configured) return null;

  const startDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await zendeFetch("/api/internal-downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: channel.url, title: channel.name }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not start the server download.");
      toast.add({
        title: "Server download started",
        description: body.fileName || channel.name,
        data: { icon: <Download className="size-4" aria-hidden /> },
        timeout: 7000,
      });
    } catch (error) {
      toast.add({
        title: "Download unavailable",
        description: error instanceof Error ? error.message : "Could not start the server download.",
        timeout: 9000,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      data-tv-download
      variant={showLabel ? "secondary" : "ghost"}
      size={size === "lg" ? "lg" : undefined}
      type="button"
      disabled={busy}
      aria-label={`Download ${channel.name} on the server`}
      title="Download on server"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void startDownload();
      }}
      className={cn(
        showLabel ? "rounded-full" : "rounded-xl bg-background p-1.5 text-foreground-intense shadow-lg backdrop-blur-md",
        "outline-none focus-visible:ring-2 focus-visible:ring-border",
        "disabled:opacity-70",
        !showLabel && size === "md" && "p-2",
        className,
      )}
    >
      {busy ? (
        <ZendeSpinner size="tiny" label="Starting server download" />
      ) : (
        <Download className={size === "sm" ? "size-[18px]" : "size-5"} aria-hidden />
      )}
      {showLabel ? (busy ? "Starting…" : "Download") : null}
    </Button>
  );
}
