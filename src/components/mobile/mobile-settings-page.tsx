"use client";

import { useCallback, useEffect, useState } from "react";

import { ZendeGlass } from "@/components/glass/zende-glass";
import { TvCatalogSetupStrip } from "@/components/tv/tv-catalog-setup-strip";
import { TvManualChannelsSection } from "@/components/tv/tv-manual-channels-section";
import { TvPersonalLibraryCard } from "@/components/tv/tv-personal-library-card";
import { TvParentalControlsCard } from "@/components/tv/tv-parental-controls-card";
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
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "zende.cronSecret";
const source = BUILTIN_PLAYLIST_SOURCES[0]!;
const log = createClientLogger("shell.MobileSettingsPage");

type SettingsTab = "catalog" | "authentication" | "integrations" | "proxies" | "server";

export function MobileSettingsPage() {
  const searchParams = useSearchParams();
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

  useEffect(() => {
    const requested = searchParams.get("tab");
    if (
      requested === "catalog" ||
      requested === "authentication" ||
      requested === "integrations" ||
      requested === "proxies" ||
      requested === "server"
    ) {
      setTab(requested);
    }
  }, [searchParams]);

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
    <main className="zen-page-bg min-h-screen pb-28 pt-[5.35rem] text-foreground">
      <section className="px-4">
        <div
          className={cn(
            "rounded-[24px] border border-white/[0.11] bg-white/[0.055] px-4 py-3 ring-1 ring-white/[0.05]",
            "backdrop-blur-xl motion-safe:animate-zen-shell-in motion-reduce:animate-none motion-reduce:opacity-100",
          )}
        >
          <p className="zen-kicker text-[10px]">
            Zende
          </p>
          <h1 className="mt-1 text-[1.45rem] font-semibold leading-none tracking-[-0.055em] text-white sm:text-[1.55rem]">
            Settings
          </h1>
          <p className="mt-1.5 max-w-[36ch] text-[11.5px] leading-snug text-white/42">
            Catalog, security, integrations, VPN proxies, and server tools — tabs below.
          </p>
        </div>
      </section>

      <section className="sticky top-[5.35rem] z-40 mt-2 px-3" aria-label="Settings sections">
        <ZendeGlass
          variant="panelCompact"
          className="rounded-[24px] border-white/[0.12] bg-black/62 p-2 shadow-[0_18px_58px_-28px_rgba(0,0,0,0.9)] transition-shadow duration-300"
        >
          <div className="tv-row-scroll flex gap-2 overflow-x-auto" role="tablist" aria-label="Settings">
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
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "zen-pressable min-h-11 shrink-0 rounded-2xl px-4 text-[13px] font-semibold outline-none",
                  "transition-[background-color,color,transform,box-shadow] duration-200 ease-out active:scale-[0.99] motion-reduce:transform-none",
                  "focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]",
                  tab === id
                    ? "bg-[var(--zen-frost)] text-[var(--zen-void)] shadow-sm"
                    : "border border-white/[0.1] bg-white/[0.06] text-white/70 hover:bg-white/[0.1]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </ZendeGlass>
      </section>

      <div className="mt-4 space-y-4 px-4" role="tabpanel">
        {tab === "catalog" ? (
          <>
            <details open className="group rounded-[26px] border border-white/[0.1] bg-white/[0.04] ring-1 ring-white/[0.04]">
              <summary className="cursor-pointer list-none px-4 py-3.5 text-[16px] font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
                Catalog & playback
              </summary>
              <div className="space-y-4 border-t border-white/[0.06] p-4 pt-3">
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
                <TvParentalControlsCard />
                <TvPersonalLibraryCard />
                <TvManualChannelsSection />
              </div>
            </details>
          </>
        ) : null}

        {tab === "authentication" ? (
          <details open className="rounded-[26px] border border-white/[0.1] bg-white/[0.04] ring-1 ring-white/[0.04]">
            <summary className="cursor-pointer list-none px-4 py-3.5 text-[16px] font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
              Authentication
            </summary>
            <div className="border-t border-white/[0.06] p-4 pt-3">
              <TvSettingsAuthPanel />
            </div>
          </details>
        ) : null}

        {tab === "integrations" ? (
          <details open className="rounded-[26px] border border-white/[0.1] bg-white/[0.04] ring-1 ring-white/[0.04]">
            <summary className="cursor-pointer list-none px-4 py-3.5 text-[16px] font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
              Integrations
            </summary>
            <div className="border-t border-white/[0.06] p-4 pt-3">
              <TvSettingsIntegrationsPanel />
            </div>
          </details>
        ) : null}

        {tab === "proxies" ? (
          <details open className="rounded-[26px] border border-white/[0.1] bg-white/[0.04] ring-1 ring-white/[0.04]">
            <summary className="cursor-pointer list-none px-4 py-3.5 text-[16px] font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
              VPN proxies
            </summary>
            <div className="border-t border-white/[0.06] p-4 pt-3">
              <TvSettingsProxiesPanel />
            </div>
          </details>
        ) : null}

        {tab === "server" ? (
          <details open className="rounded-[26px] border border-white/[0.1] bg-white/[0.04] ring-1 ring-white/[0.04]">
            <summary className="cursor-pointer list-none px-4 py-3.5 text-[16px] font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
              Server tools
            </summary>
            <div className="border-t border-white/[0.06] p-4 pt-3">
            <label className="mt-4 block">
              <span className="sr-only">Operator secret</span>
              <input
                type="password"
                autoComplete="off"
                placeholder="Bearer token"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                className="h-12 w-full rounded-2xl border border-white/[0.12] bg-black/30 px-4 text-[16px] text-white outline-none placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]/60"
              />
            </label>
            <div className="mt-4 grid gap-3">
              <button
                type="button"
                onClick={saveSecret}
                className="min-h-[52px] rounded-full bg-[var(--zen-frost)] text-[15px] font-semibold text-[var(--zen-void)] outline-none transition-[transform,box-shadow,background-color] duration-200 ease-out hover:shadow-md hover:shadow-black/20 active:scale-[0.99] motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
              >
                Save key
              </button>
              <button
                type="button"
                disabled={runBusy}
                onClick={() => void runHealthSweep()}
                className="min-h-[52px] rounded-full border border-white/[0.12] bg-white/[0.06] text-[15px] font-semibold text-white disabled:opacity-45 outline-none transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-white/[0.085] hover:shadow-[0_14px_44px_-26px_rgba(0,0,0,0.55)] active:scale-[0.99] motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]"
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
            </div>
          </details>
        ) : null}
      </div>
    </main>
  );
}
