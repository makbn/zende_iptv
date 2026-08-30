"use client";

import { Button } from "@appica/ui-react/button";
import { useToastManager } from "@appica/ui-react/toast";
import { Download } from "lucide-react";
import { useState } from "react";

import { ZendeSpinner } from "@/components/loading/zende-spinner";
import type { CreateWatchInput } from "@/lib/navigation/watch-url";
import { createDownloadUrl } from "@/lib/navigation/watch-url";
import { cn } from "@/lib/utils";

type Props = {
  channel: CreateWatchInput;
  className?: string;
  size?: "sm" | "md";
};

export function MovieDownloadButton({ channel, className, size = "sm" }: Props) {
  const [busy, setBusy] = useState(false);
  const toast = useToastManager<{ icon?: React.ReactNode }>();

  const startDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const href = await createDownloadUrl(channel);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      toast.add({
        title: "Movie download started",
        description: channel.name,
        data: { icon: <Download className="size-4" aria-hidden /> },
        timeout: 7000,
      });
    } catch (error) {
      toast.add({
        title: "Download unavailable",
        description: error instanceof Error ? error.message : "Could not start the movie download.",
        timeout: 9000,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      data-tv-download
      variant="ghost"
      type="button"
      disabled={busy}
      aria-label={`Download ${channel.name}`}
      title="Download movie"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void startDownload();
      }}
      className={cn(
        "rounded-xl bg-background p-1.5 text-foreground-intense shadow-lg backdrop-blur-md",
        "outline-none transition-[transform,background-color] duration-200 hover:scale-105 hover:bg-background-muted active:scale-95",
        "focus-visible:ring-2 focus-visible:ring-border focus-visible:ring-offset-2 focus-visible:ring-offset-black/90",
        "disabled:opacity-70",
        size === "md" && "p-2",
        className,
      )}
    >
      {busy ? (
        <ZendeSpinner size="tiny" label="Preparing movie download" />
      ) : (
        <Download className={size === "md" ? "size-[22px]" : "size-[18px]"} aria-hidden />
      )}
    </Button>
  );
}
