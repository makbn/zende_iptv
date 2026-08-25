"use client";

import { useCallback, useEffect, useState } from "react";

import { ZendeGlass } from "@/components/glass/zende-glass";
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
        "rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 ring-1 ring-white/[0.04]",
      )}
      aria-labelledby="subtitles-heading"
    >
      <h2 id="subtitles-heading" className="text-[18px] font-semibold text-white">
        Online subtitles
      </h2>
      <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-white/50">
        Search by movie or show title via{" "}
        <a
          href="https://developer.themoviedb.org/docs/getting-started"
          target="_blank"
          rel="noreferrer"
          className="text-sky-300/90 underline decoration-sky-400/30 underline-offset-2 hover:text-sky-200"
        >
          TMDB
        </a>
        , then download subtitle files from{" "}
        <a
          href="https://sub.wyzie.io/"
          target="_blank"
          rel="noreferrer"
          className="text-sky-300/90 underline decoration-sky-400/30 underline-offset-2 hover:text-sky-200"
        >
          Wyzie Subs
        </a>
        . Both keys are stored in your server database.
      </p>

      {authEnabled && user?.role !== "ADMIN" ? (
        <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-[14px] text-amber-100/90">
          Only administrators can change subtitle settings.
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-[13px] text-red-100/90">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-100/90">
          {hint}
        </p>
      ) : null}

      <dl className="mt-5 grid gap-3 text-[14px] sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3">
          <dt className="text-white/45">TMDB title search</dt>
          <dd className="mt-1 text-white/75">
            {busy && !state ? <span className="inline-flex items-center gap-2"><ZendeSpinner size="tiny" label="Loading TMDB status" /> Loading…</span> : state?.tmdbConfigured ? "Enabled" : "Not configured"}
          </dd>
          <dd className="mt-1 font-mono text-[12px] text-white/45">
            {state?.tmdbApiKeyPreview ?? "No key"}
          </dd>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3">
          <dt className="text-white/45">Wyzie subtitles</dt>
          <dd className="mt-1 text-white/75">
            {busy && !state ? <span className="inline-flex items-center gap-2"><ZendeSpinner size="tiny" label="Loading subtitle status" /> Loading…</span> : state?.configured ? "Enabled" : "Not configured"}
          </dd>
          <dd className="mt-1 font-mono text-[12px] text-white/45">
            {state?.wyzieApiKeyPreview ?? "No key"}
          </dd>
        </div>
      </dl>

      {canEdit ? (
        <div className="mt-6 space-y-4 rounded-xl border border-white/[0.08] bg-black/25 p-4">
          <label className="block text-[13px] font-medium text-white/55">
            TMDB API key
            <input
              type="password"
              autoComplete="off"
              value={tmdbApiKey}
              onChange={(e) => setTmdbApiKey(e.target.value)}
              placeholder={
                state?.tmdbConfigured ? "Enter a new TMDB key to replace" : "Paste TMDB API key"
              }
              className="mt-1 w-full rounded-lg border border-white/[0.12] bg-black/40 px-3 py-2 font-mono text-[13px] text-white outline-none placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-white"
            />
            <span className="mt-1 block text-[11px] text-white/38">
              Free from your TMDB account settings — used to resolve titles like “1899” to an id.
            </span>
          </label>

          <label className="block text-[13px] font-medium text-white/55">
            Wyzie API key
            <input
              type="password"
              autoComplete="off"
              value={wyzieApiKey}
              onChange={(e) => setWyzieApiKey(e.target.value)}
              placeholder={
                state?.configured ? "Enter a new Wyzie key to replace" : "Paste Wyzie API key"
              }
              className="mt-1 w-full rounded-lg border border-white/[0.12] bg-black/40 px-3 py-2 font-mono text-[13px] text-white outline-none placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-white"
            />
            <span className="mt-1 block text-[11px] text-white/38">
              Free from{" "}
              <a
                href="https://store.wyzie.io/redeem"
                target="_blank"
                rel="noreferrer"
                className="text-sky-300/80 underline underline-offset-2"
              >
                store.wyzie.io/redeem
              </a>{" "}
              — used to fetch subtitle files.
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-button-variant="success"
              disabled={busy}
              onClick={() => void onSave()}
              className="outline-none disabled:opacity-40"
            >
              <ZendeGlass variant="ctaPill">
                <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-zinc-950">
                  {busy ? <><ZendeSpinner size="tiny" label="Saving subtitle settings" /> Saving…</> : "Save subtitle settings"}
                </span>
              </ZendeGlass>
            </button>
            {state?.tmdbConfigured && state.tmdbApiKeySource === "database" ? (
              <button
                type="button"
                data-button-variant="danger"
                disabled={busy}
                onClick={() => void onClearTmdb()}
                className="rounded-full border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-[14px] font-semibold text-red-200/95 outline-none hover:bg-red-500/15 disabled:opacity-40"
              >
                Remove TMDB key
              </button>
            ) : null}
            {state?.configured && state.wyzieApiKeySource === "database" ? (
              <button
                type="button"
                data-button-variant="danger"
                disabled={busy}
                onClick={() => void onClearWyzie()}
                className="rounded-full border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-[14px] font-semibold text-red-200/95 outline-none hover:bg-red-500/15 disabled:opacity-40"
              >
                Remove Wyzie key
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
