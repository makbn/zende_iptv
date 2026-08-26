"use client";

import { Textarea } from "@appica/ui-react/textarea";

import { Input } from "@appica/ui-react/input";
import { Checkbox } from "@appica/ui-react/checkbox";

import { Lock, ShieldCheck, Unlock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@appica/ui-react/button";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { notifyParentalAccessChanged } from "@/lib/parental/parental-events";
import { cn } from "@/lib/utils";

type ParentalSettingsResponse = {
  enabled: boolean;
  hiddenPatterns: string[];
  hasPin: boolean;
  unlocked: boolean;
  locked: boolean;
  canManage: boolean;
  plexSyncOk?: boolean | null;
  plexSyncError?: string | null;
};

function splitPatterns(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((pattern) => pattern.trim())
    .filter(Boolean);
}

export function TvParentalControlsCard() {
  const [settings, setSettings] = useState<ParentalSettingsResponse | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [patternsText, setPatternsText] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [clearPin, setClearPin] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const response = await zendeFetch("/api/settings/parental", {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as Partial<ParentalSettingsResponse> & {
        error?: string;
      };
      if (!response.ok) {
        setHint(data.error ?? "Could not load parental controls.");
        return;
      }
      const next: ParentalSettingsResponse = {
        enabled: Boolean(data.enabled),
        hiddenPatterns: Array.isArray(data.hiddenPatterns) ? data.hiddenPatterns : [],
        hasPin: Boolean(data.hasPin),
        unlocked: Boolean(data.unlocked),
        locked: Boolean(data.locked),
        canManage: Boolean(data.canManage),
      };
      setSettings(next);
      setEnabled(next.enabled);
      setPatternsText(next.hiddenPatterns.join(", "));
    } catch (error) {
      setHint(error instanceof Error ? error.message : "Could not load parental controls.");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadSettings();
    });
  }, [loadSettings]);

  const save = useCallback(async () => {
    if (!settings?.canManage) return;
    if (newPin && !/^\d{4,12}$/.test(newPin)) {
      setHint("The parental PIN must contain 4–12 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      setHint("PIN confirmation does not match.");
      return;
    }

    setBusy(true);
    setHint(null);
    try {
      const response = await zendeFetch("/api/settings/parental", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          hiddenPatterns: splitPatterns(patternsText),
          ...(newPin ? { pin: newPin } : clearPin ? { pin: null } : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<ParentalSettingsResponse> & {
        error?: string;
      };
      if (!response.ok) {
        setHint(data.error ?? "Could not save parental controls.");
        return;
      }
      setNewPin("");
      setConfirmPin("");
      setClearPin(false);
      setHint(
        data.plexSyncOk === false
          ? `Policy saved, but Plex refresh failed: ${data.plexSyncError ?? "refresh Threadfin manually"}`
          : "Global policy saved. Browser sessions were re-locked and the Plex lineup was refreshed.",
      );
      notifyParentalAccessChanged();
      await loadSettings();
    } finally {
      setBusy(false);
    }
  }, [clearPin, confirmPin, enabled, loadSettings, newPin, patternsText, settings?.canManage]);

  const unlock = useCallback(async () => {
    setBusy(true);
    setHint(null);
    try {
      const response = await zendeFetch("/api/settings/parental", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: unlockPin }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setHint(data.error ?? "Could not unlock restricted channels.");
        return;
      }
      setUnlockPin("");
      setHint("All channels are unlocked for this browser session.");
      notifyParentalAccessChanged();
      await loadSettings();
    } finally {
      setBusy(false);
    }
  }, [loadSettings, unlockPin]);

  const lock = useCallback(async () => {
    setBusy(true);
    setHint(null);
    try {
      const response = await zendeFetch("/api/settings/parental", { method: "DELETE" });
      if (!response.ok) {
        setHint("Could not lock restricted channels.");
        return;
      }
      setHint("Restricted channels are locked in this browser session.");
      notifyParentalAccessChanged();
      await loadSettings();
    } finally {
      setBusy(false);
    }
  }, [loadSettings]);

  return (
    <section
      className={cn(
        "mt-8 rounded-2xl border border-border bg-background-muted p-6 ring-1 ring-border",
        !settings && "opacity-70",
      )}
      aria-labelledby="parental-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="parental-heading" className="flex items-center gap-2 text-[18px] font-semibold text-foreground-intense">
            <ShieldCheck className="size-5 text-primary-strong" aria-hidden />
            Parental controls
          </h2>
          <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-foreground-intense">
            Global patterns apply to every account and match channel names and group titles.
            Restricted channels stay out of catalogs, favorites, history, playback, IPTV exports,
            and Plex. This browser can temporarily unlock app browsing and playback; session unlocks
            never unlock Plex.
          </p>
        </div>
        {settings?.enabled && settings.hiddenPatterns.length > 0 ? (
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-semibold",
              settings.locked
                ? "border-warning bg-warning-subtle text-warning-strong"
                : "border-success bg-success-subtle text-success-strong",
            )}
          >
            {settings.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
            {settings.locked ? "Restricted channels locked" : "All channels unlocked"}
          </span>
        ) : null}
      </div>

      {settings?.canManage ? (
        <div className="mt-6 border-t border-border pt-5">
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-foreground-intense">
            Administrator policy
          </p>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background px-4 py-3.5">
            <Checkbox
              className="mt-1 shrink-0"
              checked={enabled}
              onCheckedChange={(checked) => setEnabled(checked === true)}
            />
            <span>
              <span className="block text-[15px] font-medium text-foreground-intense">
                Enable the global parental filter
              </span>
              <span className="mt-1 block text-[13px] leading-relaxed text-foreground-intense">
                A policy change immediately invalidates every existing session unlock and refreshes
                the Threadfin/Plex lineup.
              </span>
            </span>
          </label>

          <label className="mt-4 block">
            <span className="text-[13px] font-medium text-foreground-intense">
              Hidden patterns (comma, semicolon, or new-line separated)
            </span>
            <Textarea
              value={patternsText}
              onChange={(event) => setPatternsText(event.target.value)}
              placeholder="adult, xxx, 18+, +18"
              rows={3}
              className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-[15px] text-foreground-intense outline-none placeholder:text-foreground-intense focus-visible:ring-2 focus-visible:ring-border"
            />
            <span className="mt-2 block text-[12px] leading-relaxed text-foreground-intense">
              While enabled, a built-in safety net also blocks common adult markers such as XX, XXX,
              adult, erotic, 18+, +18, and similar provider labels.
            </span>
          </label>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[13px] font-medium text-foreground-intense">
                {settings.hasPin ? "New PIN (leave blank to keep current)" : "Unlock PIN (optional)"}
              </span>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={newPin}
                onChange={(event) => {
                  setNewPin(event.target.value);
                  setClearPin(false);
                }}
                placeholder="4–12 digits"
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-4 text-[15px] text-foreground-intense outline-none placeholder:text-foreground-intense focus-visible:ring-2 focus-visible:ring-border"
              />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-foreground-intense">Confirm new PIN</span>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={confirmPin}
                onChange={(event) => setConfirmPin(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-4 text-[15px] text-foreground-intense outline-none focus-visible:ring-2 focus-visible:ring-border"
              />
            </label>
          </div>

          {settings.hasPin ? (
            <label className="mt-3 flex items-center gap-2 text-[13px] text-foreground-intense">
              <Checkbox
                checked={clearPin}
                onCheckedChange={(checked) => {
                  const next = checked === true;
                  setClearPin(next);
                  if (next) {
                    setNewPin("");
                    setConfirmPin("");
                  }
                }}
              />
              Remove the PIN when saving (signed-in users can then unlock without a PIN)
            </label>
          ) : null}

          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => void save()}
            className="mt-5"
          >
            {busy ? "Saving and refreshing Plex…" : "Save global policy"}
          </Button>
        </div>
      ) : null}

      {settings?.enabled && settings.hiddenPatterns.length > 0 ? (
        <div className="mt-6 border-t border-border pt-5">
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-foreground-intense">
            This browser session
          </p>
          {settings.locked ? (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              {settings.hasPin ? (
                <label className="block min-w-[220px] flex-1">
                  <span className="text-[13px] font-medium text-foreground-intense">Parental PIN</span>
                  <Input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={unlockPin}
                    onChange={(event) => setUnlockPin(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void unlock();
                    }}
                    className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-4 text-[15px] text-foreground-intense outline-none focus-visible:ring-2 focus-visible:ring-border"
                  />
                </label>
              ) : null}
              <Button
                type="button"
                variant="primary"
                disabled={busy || (settings.hasPin && !unlockPin)}
                onClick={() => void unlock()}
              >
                <Unlock className="size-4" aria-hidden />
                Unlock all channels for this session
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void lock()}
              className="mt-4"
            >
              <Lock className="size-4" aria-hidden />
              Lock restricted channels now
            </Button>
          )}
        </div>
      ) : null}

      {hint ? (
        <p className="mt-4 text-[14px] leading-relaxed text-warning-strong">{hint}</p>
      ) : null}
    </section>
  );
}
