"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { TvCatalogSetupStrip } from "@/components/tv/tv-catalog-setup-strip";
import { TvManualChannelsSection } from "@/components/tv/tv-manual-channels-section";
import { TvSettingsAuthPanel } from "@/components/tv/tv-settings-auth-panel";
import { TvSettingsIntegrationsPanel } from "@/components/tv/tv-settings-integrations-panel";
import { TvSettingsProxiesPanel } from "@/components/tv/tv-settings-proxies-panel";
import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { createClientLogger } from "@/core/logging/client";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { TV_BROWSE_TOP_PAD_CLASS } from "@/components/tv/tv-top-bar";
import { Z_ACCESS } from "@/lib/auth/token-storage-keys";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "zenede.cronSecret";

const log = createClientLogger("shell.TvSettingsPage");

const source = BUILTIN_PLAYLIST_SOURCES[0]!;

type SettingsTab = "catalog" | "authentication" | "integrations" | "proxies" | "server";

export function TvSettingsPage() {
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
      if (secret.trim()) {
        sessionStorage.setItem(STORAGE_KEY, secret.trim());
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
      setSavedHint("Saved on this device.");
      window.setTimeout(() => setSavedHint(null), 2500);
    } catch (e) {
      log.warn("Could not persist operator key", {
        error: e instanceof Error ? e.message : String(e),
      });
      setSavedHint("Could not save — browser storage blocked.");
    }
  }, [secret]);

  const runHealthSweep = useCallback(async () => {
    setRunBusy(true);
    setRunStatus(null);
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      const access =
        typeof window !== "undefined"
          ? localStorage.getItem(Z_ACCESS)
          : null;
      if (!access) {
        const s = secret.trim() || sessionStorage.getItem(STORAGE_KEY);
        if (s) headers.Authorization = `Bearer ${s}`;
      }

      const res = await zendeFetch("/api/channel-health/run", {
        method: "POST",
        headers,
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          typeof body?.error === "string"
            ? body.error
            : res.status === 503
              ? "Server rejected the request — set CRON_SECRET on the host and paste the same key here."
              : `Request failed (${res.status}).`;
        setRunStatus(msg);
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
          ? `Sweep finished — ${probed.toLocaleString()} URLs probed.`
          : "Sweep finished.",
      );
    } catch (e) {
      setRunStatus(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setRunBusy(false);
    }
  }, [secret]);

  return (
    <div className="min-h-screen bg-[var(--tv-page-bg)] text-foreground">
      <main className={cn("pb-24", TV_BROWSE_TOP_PAD_CLASS)}>
        <header className="mx-auto max-w-[1920px] px-6 pt-10 sm:px-10 lg:px-14 xl:px-20">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/45">
            Zenede
          </p>
          <h1 className="mt-2 text-[clamp(1.75rem,4vw,2.25rem)] font-semibold tracking-tight text-white">
            Settings
          </h1>
          <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-white/48">
            Catalog, security, integrations, and hosting tools — pick a tab below.
          </p>
        </header>

        <div className="mx-auto mt-8 max-w-[1920px] px-6 sm:px-10 lg:px-14 xl:px-20">
          <div
            className="flex flex-wrap gap-2 border-b border-white/[0.08] pb-px"
            role="tablist"
            aria-label="Settings sections"
          >
            {(
              [
                ["catalog", "Catalog"],
                ["authentication", "Authentication"],
                ["integrations", "Integrations"],
                ["proxies", "VPN Proxies"],
                ["server", "Server & reliability"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "-mb-px rounded-t-lg px-4 py-2.5 text-[15px] font-medium outline-none transition-colors",
                  tab === id
                    ? "border border-b-0 border-white/[0.12] bg-white/[0.06] text-white"
                    : "border border-transparent text-white/45 hover:text-white/75",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tab === "catalog" ? (
          <>
            <div className="mx-auto mt-8 max-w-[1920px] px-6 sm:px-10 lg:px-14 xl:px-20">
              <TvCatalogSetupStrip
                source={source}
                busy={catalogBusy}
                error={catalogError}
                registered={registered}
                channelCount={channelCount}
                manualChannelCount={manualChannelCount}
                onRefresh={() => void refreshCatalog()}
              />
            </div>

            <div className="mx-auto mt-10 max-w-[1920px] px-6 sm:px-10 lg:px-14 xl:px-20">
              <TvManualChannelsSection />
            </div>
          </>
        ) : null}

        {tab === "authentication" ? (
          <div className="mx-auto mt-8 max-w-[1920px] px-6 sm:px-10 lg:px-14 xl:px-20">
            <TvSettingsAuthPanel />
          </div>
        ) : null}

        {tab === "integrations" ? (
          <div className="mx-auto mt-8 max-w-[1920px] px-6 sm:px-10 lg:px-14 xl:px-20">
            <TvSettingsIntegrationsPanel />
          </div>
        ) : null}

        {tab === "proxies" ? (
          <div className="mx-auto mt-8 max-w-[1920px] px-6 sm:px-10 lg:px-14 xl:px-20">
            <TvSettingsProxiesPanel />
          </div>
        ) : null}

        {tab === "server" ? (
          <div className="mx-auto mt-8 max-w-[1920px] space-y-8 px-6 sm:px-10 lg:px-14 xl:px-20">
          <section
            className={cn(
              "rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 ring-1 ring-white/[0.04]",
            )}
            aria-labelledby="health-operator-heading"
          >
            <h2
              id="health-operator-heading"
              className="text-[18px] font-semibold text-white"
            >
              Self-hosted server key
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-white/50">
              If your deployment uses a shared secret for automated jobs, enter it here
              so this browser can sync the channel list with the server and run manual
              sweeps. Saved only in{" "}
              <span className="text-white/70">session storage</span> for this tab.
            </p>

            <label className="mt-5 block">
              <span className="sr-only">Operator secret</span>
              <input
                type="password"
                autoComplete="off"
                placeholder="Bearer token (optional locally)"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className={cn(
                  "mt-1 h-12 w-full rounded-xl border border-white/[0.12] bg-black/30 px-4",
                  "text-[16px] text-white placeholder:text-white/35",
                  "outline-none ring-offset-[var(--tv-page-bg)] focus-visible:ring-2 focus-visible:ring-white",
                )}
              />
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => saveSecret()}
                className="outline-none"
              >
                <ZenedeGlass variant="ctaPill">
                  <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-zinc-950">
                    Save key
                  </span>
                </ZenedeGlass>
              </button>
              {savedHint ? (
                <p className="text-[14px] text-emerald-400/95">{savedHint}</p>
              ) : null}
            </div>
          </section>

          <section
            className={cn(
              "rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 ring-1 ring-white/[0.04]",
            )}
            aria-labelledby="health-run-heading"
          >
            <h2 id="health-run-heading" className="text-[18px] font-semibold text-white">
              Stream reliability sweep
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-white/50">
              Channel badges use a rolling window of reachability checks. When your
              server is configured, the same job runs on a schedule; you can run it
              manually here.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={runBusy}
                onClick={() => void runHealthSweep()}
                className="outline-none disabled:opacity-50"
              >
                <ZenedeGlass variant="ctaPill">
                  <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-zinc-950">
                    {runBusy ? "Running…" : "Run full sweep"}
                  </span>
                </ZenedeGlass>
              </button>
            </div>
            {runStatus ? (
              <p
                className={cn(
                  "mt-4 text-[15px] leading-relaxed",
                  runStatus.startsWith("Sweep finished")
                    ? "text-emerald-400/95"
                    : "text-amber-300/95",
                )}
              >
                {runStatus}
              </p>
            ) : null}
            <p className="mt-5 text-[14px] leading-relaxed text-white/38">
              If you host Zenede on your own server, you can automate these checks so
              reliability badges stay current without opening Settings. How you schedule
              that depends on your platform—your deployment notes cover it.
            </p>
          </section>
        </div>
        ) : null}

        <div className="mx-auto mt-12 max-w-[1920px] px-6 sm:px-10 lg:px-14 xl:px-20">
          <p className="text-[15px]">
            <Link
              href="/"
              className="font-medium text-white/85 underline-offset-4 hover:underline"
            >
              ← Home
            </Link>
          </p>
        </div>
      </main>

      <footer className="border-t border-white/[0.06] py-10 text-center">
        <p className="text-[13px] leading-relaxed text-white/35">
          Third-party streams. You are responsible for content you access.
        </p>
      </footer>
    </div>
  );
}
