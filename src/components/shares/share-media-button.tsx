"use client";

import { Button } from "@appica/ui-react/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@appica/ui-react/dialog";
import { Input } from "@appica/ui-react/input";
import { Check, Clock3, Copy, ExternalLink, Share2 } from "lucide-react";
import { useMemo, useState, useSyncExternalStore, type MouseEvent } from "react";

import { ZendeSpinner } from "@/components/loading/zende-spinner";
import { useAuth } from "@/features/auth/auth-context";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import type { MediaShareTarget } from "@/lib/shares/media-share-types";
import { isTvEnvironment } from "@/lib/tv/tv-environment";
import { cn } from "@/lib/utils";

type ExpiryPreset = "hour" | "day" | "week" | "month" | "custom";

type Props = {
  target: MediaShareTarget;
  className?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
};

const PRESETS: Array<{ value: Exclude<ExpiryPreset, "custom">; label: string; ms: number }> = [
  { value: "hour", label: "1 hour", ms: 60 * 60 * 1000 },
  { value: "day", label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { value: "week", label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "month", label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

function localDateTimeValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function subscribeToBrowserEnvironment(): () => void {
  return () => {};
}

export function ShareMediaButton({ target, className, size = "sm", showLabel = false }: Props) {
  const { ready, user } = useAuth();
  const webEligible = useSyncExternalStore(
    subscribeToBrowserEnvironment,
    () => !isTvEnvironment(),
    () => false,
  );
  const [open, setOpen] = useState(false);
  const [baseNow, setBaseNow] = useState(() => Date.now());
  const [preset, setPreset] = useState<ExpiryPreset>("day");
  const [customExpiry, setCustomExpiry] = useState(() =>
    localDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const expiresAt = useMemo(() => {
    if (preset === "custom") return new Date(customExpiry);
    const match = PRESETS.find((candidate) => candidate.value === preset);
    return new Date(baseNow + (match?.ms ?? 24 * 60 * 60 * 1000));
  }, [baseNow, customExpiry, preset]);

  if (!ready || user?.role !== "ADMIN" || !webEligible) return null;

  function openDialog(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setError(null);
    setCopied(false);
    setBaseNow(Date.now());
    setCustomExpiry(localDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
    setOpen(true);
  }

  async function createShare() {
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now() + 30_000) {
      setError("Choose an expiry at least one minute from now.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await zendeFetch("/api/admin/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, expiresAt: expiresAt.toISOString() }),
      });
      const body = (await response.json().catch(() => ({}))) as { path?: string; error?: string };
      if (!response.ok || !body.path) {
        throw new Error(body.error || "Could not create the share link.");
      }
      const absolute = new URL(body.path, window.location.origin).href;
      setShareUrl(absolute);
      try {
        await navigator.clipboard.writeText(absolute);
        setCopied(true);
      } catch {
        // The visible text field remains available when clipboard permission is denied.
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the share link.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
  }

  async function nativeShare() {
    if (!shareUrl || typeof navigator.share !== "function") return;
    await navigator.share({ title: target.title, url: shareUrl }).catch(() => {});
  }

  return (
    <>
      <Button
        data-web-share
        type="button"
        variant="secondary"
        size={size === "lg" ? "lg" : undefined}
        onClick={openDialog}
        aria-label={`Share ${target.title}`}
        title="Share"
        className={cn(
          "rounded-full",
          !showLabel && size === "sm" && "size-9 p-0",
          !showLabel && size === "md" && "size-10 p-0",
          className,
        )}
      >
        <Share2 className={size === "lg" ? "size-4" : "size-[18px]"} aria-hidden />
        {showLabel ? "Share" : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{shareUrl ? "Your link is ready" : `Share ${target.title}`}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {shareUrl ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-success-subtle bg-success-subtle/10 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success-foreground">
                      <Check className="size-5" aria-hidden />
                    </span>
                    <div>
                      <p className="font-semibold text-foreground-intense">Ready to send</p>
                      <p className="text-sm text-foreground-muted">
                        Expires {expiresAt.toLocaleString()}.
                      </p>
                    </div>
                  </div>
                </div>
                <Input value={shareUrl} readOnly aria-label="Public share link" />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="secondary" onClick={() => void copyLink()}>
                    {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                  {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
                    <Button onClick={() => void nativeShare()}>
                      <Share2 className="size-4" aria-hidden />
                      Share…
                    </Button>
                  ) : (
                    <Button render={<a href={shareUrl} target="_blank" rel="noopener noreferrer" />}>
                      <ExternalLink className="size-4" aria-hidden />
                      Open link
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start gap-3 rounded-2xl border border-border bg-background-muted p-4">
                  <Clock3 className="mt-0.5 size-5 shrink-0 text-primary-strong" aria-hidden />
                  <p className="text-sm leading-6 text-foreground-muted">
                    Anyone with the link can open this {target.kind === "series" ? "series and its episodes" : target.kind}. Playback and downloads stop when the link expires.
                  </p>
                </div>
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-foreground-intense">Link expires in</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PRESETS.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        variant={preset === option.value ? "primary" : "secondary"}
                        onClick={() => setPreset(option.value)}
                        className="w-full"
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant={preset === "custom" ? "primary" : "ghost"}
                    onClick={() => setPreset("custom")}
                    className="mt-2"
                  >
                    Custom date & time
                  </Button>
                  {preset === "custom" ? (
                    <Input
                      type="datetime-local"
                      value={customExpiry}
                      min={localDateTimeValue(new Date(baseNow + 60_000))}
                      max={localDateTimeValue(new Date(baseNow + 365 * 24 * 60 * 60 * 1000))}
                      onValueChange={setCustomExpiry}
                      className="mt-2"
                    />
                  ) : null}
                </fieldset>
                <p className="text-sm text-foreground-muted">
                  Expires on <span className="font-medium text-foreground-intense">{Number.isFinite(expiresAt.getTime()) ? expiresAt.toLocaleString() : "an invalid date"}</span>
                </p>
                {error ? <p role="alert" className="text-sm text-error-strong">{error}</p> : null}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Close</DialogClose>
            {!shareUrl ? (
              <Button onClick={() => void createShare()} disabled={busy}>
                {busy ? <ZendeSpinner size="tiny" label="Creating share link" /> : <Share2 className="size-4" aria-hidden />}
                {busy ? "Creating…" : "Create link"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
