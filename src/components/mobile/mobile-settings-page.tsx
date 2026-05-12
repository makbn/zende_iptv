"use client";

import { useCallback, useState } from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { TvCatalogSetupStrip } from "@/components/tv/tv-catalog-setup-strip";
import { TvManualChannelsSection } from "@/components/tv/tv-manual-channels-section";
import { TvPlaybackPrefsCard } from "@/components/tv/tv-playback-prefs-card";
import { TvSettingsAuthPanel } from "@/components/tv/tv-settings-auth-panel";
import { TvSettingsIntegrationsPanel } from "@/components/tv/tv-settings-integrations-panel";
import { TvSettingsProxiesPanel } from "@/components/tv/tv-settings-proxies-panel";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { createClientLogger } from "@/core/logging/client";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { Z_ACCESS } from "@/lib/auth/token-storage-keys";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "zenede.cronSecret";
const source = BUILTIN_PLAYLIST_SOURCES[0]!;
const log = createClientLogger("shell.MobileSettingsPage");

type SettingsTab = "catalog" | "authentication" | "integrations" | "proxies" | "server";

export function MobileSettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("catalog");
  const catalog = useCatalogBootstrap(source);
  const {
    busy: catalogBusy,
    error: catalogError,
    channelCount,
    manualChannelCount,
    registered,
    refreshCatalog,
  } = catalog;

  const [secret, setSecret] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return sessionStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runBusy, setRunBusy] = useState(false);

  const saveSecret = useCallback(() => {
    try {
      if (secret.trim()) sessionStorage.setItem(STORAGE_KEY, secret.trim());
      else sessionStorage.removeItem(STORAGE_KEY);
      setSavedHint("Saved on this device.");
      window.setTimeout(() => setSavedHint(null), 2500);
    } catch (error) {
      log.warn("Could not persist operator key", {
        error: error instanceof Error ? error.message : String(error),
      });
      setSavedHint("Could not save in this browser.");
    }
  }, [secret]);

  const runHealthSweep = useCallback(async () => {
    setRunBusy(true);
    setRunStatus(null);
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      const access =
        typeof window !== "undefined" ? localStorage.getItem(Z_ACCESS) : null;
      if (!access) {
        const stored = secret.trim() || sessionStorage.getItem(STORAGE_KEY);
        if (stored) headers.Authorization = `Bearer ${stored}`;
      }

      const res = await zendeFetch("/api/channel-health/run", {
        method: "POST",
        headers,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRunStatus(
          typeof body?.error === "string"
            ? body.error
            : `Request failed (${res.status}).`,
        );
        return;
      }
      const probed =
        typeof body?.probed === "number"
          ? body.probed
          : typeof body?.total === "number"
            ? body.total
            : null;
      setRunStatus(
        probed != null
          ? `Sweep finished. ${probed.toLocaleString()} URLs probed.`
          : "Sweep finished.",
      );
    } catch (error) {
      setRunStatus(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setRunBusy(false);
    }
  }, [secret]);

  return (
    <main className="min-h-screen bg-[var(--tv-page-bg)] pb-28 pt-[6.25rem] text-foreground">
      <section className="px-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">
          Zenede
        </p>
        <h1 className="mt-2 text-[34px] font-semibold leading-none tracking-tight text-white">
          Settings
        </h1>
        <p className="mt-3 max-w-[32ch] text-[15px] leading-relaxed text-white/50">
          Catalog, security, integrations, VPN proxies, and server reliability tools.
        </p>
      </section>

      <section className="sticky top-[5.35rem] z-40 mt-5 px-3" aria-label="Settings sections">
        <ZenedeGlass
          variant="panelCompact"
          className="rounded-[26px] border-white/[0.1] bg-black/58 p-2"
        >
          <div className="tv-row-scroll flex gap-2 overflow-x-auto">
            {(
              [
                ["catalog", "Catalog"],
                ["authentication", "Auth"],
                ["integrations", "Apps"],
                ["proxies", "VPN"],
                ["server", "Server"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "min-h-11 shrink-0 rounded-2xl px-4 text-[13px] font-semibold",
                  tab === id
                    ? "bg-white text-zinc-950"
                    : "border border-white/[0.1] bg-white/[0.06] text-white/70",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </ZenedeGlass>
      </section>

      <div className="mt-5 space-y-6 px-4">
        {tab === "catalog" ? (
          <>
            <TvCatalogSetupStrip
              source={source}
              busy={catalogBusy}
              error={catalogError}
              registered={registered}
              channelCount={channelCount}
              manualChannelCount={manualChannelCount}
              onRefresh={() => void refreshCatalog()}
            />
            <TvPlaybackPrefsCard />
            <TvManualChannelsSection />
          </>
        ) : null}

        {tab === "authentication" ? <TvSettingsAuthPanel /> : null}
        {tab === "integrations" ? <TvSettingsIntegrationsPanel /> : null}
        {tab === "proxies" ? <TvSettingsProxiesPanel /> : null}

        {tab === "server" ? (
          <section className="rounded-[26px] border border-white/[0.1] bg-white/[0.04] p-5">
            <h2 className="text-[20px] font-semibold text-white">
              Server key
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-white/50">
              Save the optional operator key in this tab, then run a manual
              channel-health sweep.
            </p>
            <label className="mt-4 block">
              <span className="sr-only">Operator secret</span>
              <input
                type="password"
                autoComplete="off"
                placeholder="Bearer token"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                className="h-12 w-full rounded-2xl border border-white/[0.12] bg-black/30 px-4 text-[16px] text-white outline-none placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-white/30"
              />
            </label>
            <div className="mt-4 grid gap-3">
              <button
                type="button"
                onClick={saveSecret}
                className="min-h-[52px] rounded-2xl bg-white text-[15px] font-semibold text-zinc-950"
              >
                Save key
              </button>
              <button
                type="button"
                disabled={runBusy}
                onClick={() => void runHealthSweep()}
                className="min-h-[52px] rounded-2xl border border-white/[0.12] bg-white/[0.06] text-[15px] font-semibold text-white disabled:opacity-45"
              >
                {runBusy ? "Running…" : "Run health sweep"}
              </button>
            </div>
            {savedHint ? (
              <p className="mt-3 text-[14px] text-emerald-300/90">{savedHint}</p>
            ) : null}
            {runStatus ? (
              <p className="mt-3 text-[14px] leading-relaxed text-white/50">
                {runStatus}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
