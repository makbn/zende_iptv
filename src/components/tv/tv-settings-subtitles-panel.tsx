"use client";

import { Input } from "@appica/ui-react/input";

import { Button } from "@appica/ui-react/button";

import { useCallback, useEffect, useState } from "react";

import { Card } from "@appica/ui-react/card";
import { ZendeSpinner } from "@/components/loading/zende-spinner";
import { useAuth } from "@/features/auth/auth-context";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";

type SubtitleSettingsState = {
  configured: boolean;
  wyzieApiKeyPreview: string | null;
  wyzieApiKeySource: "database" | "environment" | null;
  tmdbConfigured: boolean;
  tmdbApiKeyPreview: string | null;
  tmdbApiKeySource: "database" | "environment" | null;
  provider?: "wyzie";
};

async function parseJsonSafely(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function TvSettingsSubtitlesPanel() {
  const { authEnabled, user } = useAuth();
  const [state, setState] = useState<SubtitleSettingsState | null>(null);
  const [wyzieApiKey, setWyzieApiKey] = useState("");
  const [tmdbApiKey, setTmdbApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canEdit = !authEnabled || user?.role === "ADMIN";

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await zendeFetch("/api/settings/subtitles");
      const data = (await parseJsonSafely(res)) as SubtitleSettingsState & { error?: string };
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not load subtitle settings.",
        );
        setState(null);
        return;
      }
      setState(data);
      setError(null);
    } catch {
      setError("Could not load subtitle settings.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = useCallback(async () => {
    if (!canEdit) return;
    setBusy(true);
    setHint(null);
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (wyzieApiKey.trim()) body.wyzieApiKey = wyzieApiKey.trim();
      if (tmdbApiKey.trim()) body.tmdbApiKey = tmdbApiKey.trim();

      if (Object.keys(body).length === 0) {
        setHint("Enter at least one API key to save.");
        return;
      }

      const res = await zendeFetch("/api/settings/subtitles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await parseJsonSafely(res)) as SubtitleSettingsState & { error?: string };
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not save subtitle settings.",
        );
        return;
      }

      setState(data);
      setWyzieApiKey("");
      setTmdbApiKey("");
      setHint("Subtitle settings saved.");
    } catch {
      setError("Could not save subtitle settings.");
    } finally {
      setBusy(false);
    }
  }, [canEdit, tmdbApiKey, wyzieApiKey]);

  const onClearWyzie = useCallback(async () => {
    if (!canEdit) return;
    if (!confirm("Remove the saved Wyzie API key from this server?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await zendeFetch("/api/settings/subtitles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wyzieApiKey: null }),
      });
      const data = (await parseJsonSafely(res)) as SubtitleSettingsState & { error?: string };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not clear Wyzie key.");
        return;
      }
      setState(data);
      setHint("Wyzie API key removed.");
    } finally {
      setBusy(false);
    }
  }, [canEdit]);

  const onClearTmdb = useCallback(async () => {
    if (!canEdit) return;
    if (!confirm("Remove the saved TMDB API key from this server?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await zendeFetch("/api/settings/subtitles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbApiKey: null }),
      });
      const data = (await parseJsonSafely(res)) as SubtitleSettingsState & { error?: string };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not clear TMDB key.");
        return;
      }
      setState(data);
      setHint("TMDB API key removed.");
    } finally {
      setBusy(false);
    }
  }, [canEdit]);

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-background-muted p-6 ring-1 ring-border",
      )}
      aria-labelledby="subtitles-heading"
    >
      <h2 id="subtitles-heading" className="text-[18px] font-semibold text-foreground-intense">
        Online subtitles
      </h2>
      <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-foreground-intense">
        Search by movie or show title via{" "}
        <a
          href="https://developer.themoviedb.org/docs/getting-started"
          target="_blank"
          rel="noreferrer"
          className="text-primary-strong underline decoration-border-strong underline-offset-2 hover:text-primary-strong"
        >
          TMDB
        </a>
        , then download subtitle files from{" "}
        <a
          href="https://sub.wyzie.io/"
          target="_blank"
          rel="noreferrer"
          className="text-primary-strong underline decoration-border-strong underline-offset-2 hover:text-primary-strong"
        >
          Wyzie Subs
        </a>
        . Both keys are stored in your server database.
      </p>

      {authEnabled && user?.role !== "ADMIN" ? (
        <p className="mt-4 rounded-xl border border-warning bg-warning-subtle px-4 py-3 text-[14px] text-warning-strong">
          Only administrators can change subtitle settings.
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-error bg-error-subtle px-3 py-2 text-[13px] text-error-strong">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p className="mt-4 rounded-lg border border-success bg-success-subtle px-3 py-2 text-[13px] text-success-strong">
          {hint}
        </p>
      ) : null}

      <dl className="mt-5 grid gap-3 text-[14px] sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-background px-4 py-3">
          <dt className="text-foreground-intense">TMDB title search</dt>
          <dd className="mt-1 text-foreground-intense">
            {busy && !state ? <span className="inline-flex items-center gap-2"><ZendeSpinner size="tiny" label="Loading TMDB status" /> Loading…</span> : state?.tmdbConfigured ? "Enabled" : "Not configured"}
          </dd>
          <dd className="mt-1 font-mono text-[12px] text-foreground-intense">
            {state?.tmdbApiKeyPreview ?? "No key"}
          </dd>
        </div>
        <div className="rounded-xl border border-border bg-background px-4 py-3">
          <dt className="text-foreground-intense">Wyzie subtitles</dt>
          <dd className="mt-1 text-foreground-intense">
            {busy && !state ? <span className="inline-flex items-center gap-2"><ZendeSpinner size="tiny" label="Loading subtitle status" /> Loading…</span> : state?.configured ? "Enabled" : "Not configured"}
          </dd>
          <dd className="mt-1 font-mono text-[12px] text-foreground-intense">
            {state?.wyzieApiKeyPreview ?? "No key"}
          </dd>
        </div>
      </dl>

      {canEdit ? (
        <div className="mt-6 space-y-4 rounded-xl border border-border bg-background p-4">
          <label className="block text-[13px] font-medium text-foreground-intense">
            TMDB API key
            <Input
              type="password"
              autoComplete="off"
              value={tmdbApiKey}
              onChange={(e) => setTmdbApiKey(e.target.value)}
              placeholder={
                state?.tmdbConfigured ? "Enter a new TMDB key to replace" : "Paste TMDB API key"
              }
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground-intense outline-none placeholder:text-foreground-intense focus-visible:ring-2 focus-visible:ring-border"
            />
            <span className="mt-1 block text-[11px] text-foreground-intense">
              Free from your TMDB account settings — used to resolve titles like “1899” to an id.
            </span>
          </label>

          <label className="block text-[13px] font-medium text-foreground-intense">
            Wyzie API key
            <Input
              type="password"
              autoComplete="off"
              value={wyzieApiKey}
              onChange={(e) => setWyzieApiKey(e.target.value)}
              placeholder={
                state?.configured ? "Enter a new Wyzie key to replace" : "Paste Wyzie API key"
              }
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground-intense outline-none placeholder:text-foreground-intense focus-visible:ring-2 focus-visible:ring-border"
            />
            <span className="mt-1 block text-[11px] text-foreground-intense">
              Free from{" "}
              <a
                href="https://store.wyzie.io/redeem"
                target="_blank"
                rel="noreferrer"
                className="text-primary-strong underline underline-offset-2"
              >
                store.wyzie.io/redeem
              </a>{" "}
              — used to fetch subtitle files.
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary"
              type="button"
              disabled={busy}
              onClick={() => void onSave()}
              className="outline-none disabled:opacity-40"
            >
              <Card frame="solid">
                <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-foreground-inverse">
                  {busy ? <><ZendeSpinner size="tiny" label="Saving subtitle settings" /> Saving…</> : "Save subtitle settings"}
                </span>
              </Card>
            </Button>
            {state?.tmdbConfigured && state.tmdbApiKeySource === "database" ? (
              <Button variant="destructive"
                type="button"
                disabled={busy}
                onClick={() => void onClearTmdb()}
                className="rounded-full border border-error bg-error-subtle px-4 py-2.5 text-[14px] font-semibold text-error-strong outline-none hover:bg-error-subtle disabled:opacity-40"
              >
                Remove TMDB key
              </Button>
            ) : null}
            {state?.configured && state.wyzieApiKeySource === "database" ? (
              <Button variant="destructive"
                type="button"
                disabled={busy}
                onClick={() => void onClearWyzie()}
                className="rounded-full border border-error bg-error-subtle px-4 py-2.5 text-[14px] font-semibold text-error-strong outline-none hover:bg-error-subtle disabled:opacity-40"
              >
                Remove Wyzie key
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
