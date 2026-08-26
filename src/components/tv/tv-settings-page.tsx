"use client";

import { Input } from "@appica/ui-react/input";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { TvCatalogSetupStrip } from "@/components/tv/tv-catalog-setup-strip";
import { TvManualChannelsSection } from "@/components/tv/tv-manual-channels-section";
import { TvIptvProvidersSection } from "@/components/tv/tv-iptv-providers-section";
import { TvPersonalLibraryCard } from "@/components/tv/tv-personal-library-card";
import { TvParentalControlsCard } from "@/components/tv/tv-parental-controls-card";
import { TvPlaybackPrefsCard } from "@/components/tv/tv-playback-prefs-card";
import { TvSettingsAuthPanel } from "@/components/tv/tv-settings-auth-panel";
import { TvSettingsIntegrationsPanel } from "@/components/tv/tv-settings-integrations-panel";
import { TvSettingsProxiesPanel } from "@/components/tv/tv-settings-proxies-panel";
import { TvSettingsCachePanel } from "@/components/tv/tv-settings-cache-panel";
import { BROWSE_CONTAINER_CLASS } from "@/components/layout/browse-page-shell";
import { Button } from "@appica/ui-react/button";
import { ZendeSpinner } from "@/components/loading/zende-spinner";
import {
  AppicaPanel,
  AppicaHero,
  AppicaMetrics,
} from "@/components/layout/appica-page";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { createClientLogger } from "@/core/logging/client";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { useAuth } from "@/features/auth/auth-context";
import { TV_BROWSE_TOP_PAD_CLASS } from "@/components/tv/tv-top-bar";
import { Z_ACCESS } from "@/lib/auth/token-storage-keys";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { useRemoteNavigation } from "@/lib/navigation/use-remote-navigation";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "zende.cronSecret";

const log = createClientLogger("shell.TvSettingsPage");

const source = BUILTIN_PLAYLIST_SOURCES[0]!;

type SettingsTab = "catalog" | "authentication" | "integrations" | "proxies" | "server";

export function TvSettingsPage() {
  const { user, userCount } = useAuth();
  const canManageSystem = user?.role === "ADMIN" || userCount === 0;
  const { onNavigateClick } = useRemoteNavigation();
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
  const activeTab: SettingsTab = canManageSystem ? tab : "authentication";

  useEffect(() => {
    const requested = searchParams.get("tab");
    if (!canManageSystem) return;
    if (
      requested === "catalog" ||
      requested === "authentication" ||
      requested === "integrations" ||
      requested === "proxies" ||
      requested === "server"
    ) {
      queueMicrotask(() => setTab(requested));
    }
  }, [searchParams, canManageSystem]);

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
    <div className="bg-background min-h-screen overflow-x-clip text-foreground">
      <main className={cn("pb-24", TV_BROWSE_TOP_PAD_CLASS)}>
        <AppicaHero
          className="pt-8"
          eyebrow="Settings"
          title="Settings"
          description="Catalog, access, integrations, VPN routing, playback, and server tools."
          aside={
            <AppicaPanel>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">System status</p>
              <AppicaMetrics
                className="mt-4"
                metrics={[
                  {
                    label: "Channels",
                    value: channelCount != null ? channelCount.toLocaleString() : "0",
                    tone: "signal",
                  },
                  {
                    label: "Manual",
                    value: manualChannelCount.toLocaleString(),
                  },
                  {
                    label: "Catalog",
                    value: registered ? "Ready" : "Setup",
                    tone: registered ? "signal" : "ember",
                  },
                ]}
              />
              <p className="mt-5 text-[14px] leading-relaxed text-foreground-intense">
                Pick a section below.
              </p>
            </AppicaPanel>
          }
        />

        <div className={cn(BROWSE_CONTAINER_CLASS, "mt-5")}>
          <div
            className="flex flex-wrap gap-2 border-b border-border pb-px"
            role="tablist"
            aria-label="Settings sections"
          >
            {(
              (canManageSystem ? [
                ["catalog", "Catalog"],
                ["authentication", "Authentication"],
                ["integrations", "Integrations"],
                ["proxies", "VPN Proxies"],
                ["server", "Server & reliability"],
              ] : [["authentication", "My account"]]) as readonly (readonly [SettingsTab, string])[]
            ).map(([id, label]) => (
              <Button variant="ghost"
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "-mb-px rounded-t-[18px] px-4 py-2.5 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  "transition-[color,background-color,border-color,transform] duration-200 ease-out",
                  "motion-safe:hover:-translate-y-px",
                  activeTab === id
                    ? "border border-b-0 border-border bg-background-muted text-foreground-intense"
                    : "border border-transparent text-foreground-intense hover:text-foreground-intense",
                )}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {canManageSystem && activeTab === "catalog" ? (
          <>
            <div className={cn(BROWSE_CONTAINER_CLASS, "mt-8")}>
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

            <div className={cn(BROWSE_CONTAINER_CLASS, "mt-8")}>
              <TvPlaybackPrefsCard />
              <TvParentalControlsCard />
            </div>
            <div className={cn(BROWSE_CONTAINER_CLASS, "mt-8")}>
              <TvPersonalLibraryCard />
            </div>

            <div className={cn(BROWSE_CONTAINER_CLASS, "mt-10")}>
              <TvIptvProvidersSection />
            </div>
            <div className={cn(BROWSE_CONTAINER_CLASS, "mt-8")}>
              <TvManualChannelsSection />
            </div>
          </>
        ) : null}

        {activeTab === "authentication" ? (
          <div className={cn(BROWSE_CONTAINER_CLASS, "mt-8")}>
            <TvSettingsAuthPanel />
            {!canManageSystem ? (
              <>
                <div className="mt-8">
                  <TvPlaybackPrefsCard />
                  <TvParentalControlsCard />
                </div>
                <div className="mt-8">
                  <TvPersonalLibraryCard />
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {canManageSystem && activeTab === "integrations" ? (
          <div className={cn(BROWSE_CONTAINER_CLASS, "mt-8")}>
            <TvSettingsIntegrationsPanel />
          </div>
        ) : null}

        {canManageSystem && activeTab === "proxies" ? (
          <div className={cn(BROWSE_CONTAINER_CLASS, "mt-8")}>
            <TvSettingsProxiesPanel />
          </div>
        ) : null}

        {canManageSystem && activeTab === "server" ? (
          <div className={cn(BROWSE_CONTAINER_CLASS, "mt-8 space-y-8")}>
          <TvSettingsCachePanel />
          <section
            className={cn(
              "border border-border bg-background-subtle shadow-sm rounded-lg p-6",
            )}
            aria-labelledby="health-operator-heading"
          >
            <h2
              id="health-operator-heading"
              className="text-[18px] font-semibold text-foreground-intense"
            >
              Self-hosted server key
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-foreground-intense">
              If your deployment uses a shared secret for automated jobs, enter it here
              so this browser can sync the channel list with the server and run manual
              sweeps. Saved only in{" "}
              <span className="text-foreground-intense">session storage</span> for this tab.
            </p>

            <label className="mt-5 block">
              <span className="sr-only">Operator secret</span>
              <Input
                type="password"
                autoComplete="off"
                placeholder="Bearer token (optional locally)"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className={cn(
                  "mt-1 h-12 w-full rounded-xl border border-border bg-background px-4",
                  "text-[16px] text-foreground-intense placeholder:text-foreground-intense",
                  "outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-primary",
                )}
              />
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="primary"
                onClick={() => saveSecret()}
              >
                Save key
              </Button>
              {savedHint ? (
                <p className="text-[14px] text-success-strong">{savedHint}</p>
              ) : null}
            </div>
          </section>

          <section
            className={cn(
              "rounded-2xl border border-border bg-background-muted p-6 ring-1 ring-border",
            )}
            aria-labelledby="health-run-heading"
          >
            <h2 id="health-run-heading" className="text-[18px] font-semibold text-foreground-intense">
              Stream reliability sweep
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-foreground-intense">
              Channel badges use a rolling window of reachability checks. When your
              server is configured, the same job runs on a schedule; you can run it
              manually here.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                disabled={runBusy}
                onClick={() => void runHealthSweep()}
              >
                {runBusy ? <><ZendeSpinner size="tiny" label="Running health sweep" /> Running…</> : "Run full sweep"}
              </Button>
            </div>
            {runStatus ? (
              <p
                className={cn(
                  "mt-4 text-[15px] leading-relaxed",
                  runStatus.startsWith("Sweep finished")
                    ? "text-success-strong"
                    : "text-warning-strong",
                )}
              >
                {runStatus}
              </p>
            ) : null}
            <p className="mt-5 text-[14px] leading-relaxed text-foreground-intense">
              If you host Zende on your own server, you can automate these checks so
              reliability badges stay current without opening Settings. How you schedule
              that depends on your platform—your deployment notes cover it.
            </p>
          </section>
        </div>
        ) : null}

        <div className={cn(BROWSE_CONTAINER_CLASS, "mt-12")}>
          <p className="text-[15px]">
            <Link
              href="/"
              onClick={onNavigateClick("/")}
              className="font-medium text-foreground-intense underline-offset-4 hover:underline"
            >
              ← Home
            </Link>
          </p>
        </div>
      </main>

      <footer className="border-t border-border py-10 text-center">
        <p className="text-[13px] leading-relaxed text-foreground-intense">
          Third-party streams. You are responsible for content you access.
        </p>
      </footer>
    </div>
  );
}
