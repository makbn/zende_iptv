"use client";

import { Input } from "@appica/ui-react/input";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
import { Tabs, TabsList, TabsTrigger } from "@appica/ui-react/tabs";
import { ZendeSpinner } from "@/components/loading/zende-spinner";
import {
  AppicaHero,
} from "@/components/layout/appica-page";
import { createClientLogger } from "@/core/logging/client";
import { useAuth } from "@/features/auth/auth-context";
import { TV_BROWSE_TOP_PAD_CLASS } from "@/components/tv/tv-top-bar";
import { Z_ACCESS } from "@/lib/auth/token-storage-keys";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { useRemoteNavigation } from "@/lib/navigation/use-remote-navigation";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "zende.cronSecret";

const log = createClientLogger("shell.TvSettingsPage");

type SettingsTab = "catalog" | "authentication" | "integrations" | "proxies" | "server";

export function TvSettingsPage() {
  const { user, userCount } = useAuth();
  const canManageSystem = user?.role === "ADMIN" || userCount === 0;
  const { onNavigateClick } = useRemoteNavigation();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>("catalog");

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
    <div className="tv-settings-page bg-background min-h-screen overflow-x-clip text-foreground">
      <main className={cn("tv-browse-main pb-24", TV_BROWSE_TOP_PAD_CLASS)}>
        <AppicaHero
          className="py-6"
          eyebrow="Settings"
          title="Settings"
          description="Manage providers, playback, access, integrations, VPN routing, and server tools."
        >
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground-muted">
            <span className="rounded-full border border-border bg-background-muted px-3 py-1.5">
              {canManageSystem ? "Administrator" : "Personal settings"}
            </span>
            <span className="rounded-full border border-border bg-background-muted px-3 py-1.5">
              {canManageSystem ? "5 sections" : "1 section"}
            </span>
          </div>
        </AppicaHero>

        <div className={cn(BROWSE_CONTAINER_CLASS, "mt-5")}>
          <Tabs
            value={activeTab}
            onValueChange={(value) => setTab(value as SettingsTab)}
            variant="line"
            size="md"
            className="gap-0"
          >
            <div className="overflow-x-auto border-b border-border">
              <TabsList aria-label="Settings sections" className="min-w-max">
                {(
                  (canManageSystem ? [
                    ["catalog", "Catalog"],
                    ["authentication", "Authentication"],
                    ["integrations", "Integrations"],
                    ["proxies", "VPN Proxies"],
                    ["server", "Server & reliability"],
                  ] : [["authentication", "My account"]]) as readonly (readonly [SettingsTab, string])[]
                ).map(([id, label]) => (
                  <TabsTrigger key={id} value={id}>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
        </div>

        {canManageSystem && activeTab === "catalog" ? (
          <>
            <div className={cn(BROWSE_CONTAINER_CLASS, "mt-8")}>
              <TvIptvProvidersSection />
            </div>

            <div className={cn(BROWSE_CONTAINER_CLASS, "mt-8")}>
              <TvPlaybackPrefsCard />
              <TvParentalControlsCard />
            </div>
            <div className={cn(BROWSE_CONTAINER_CLASS, "mt-8")}>
              <TvPersonalLibraryCard />
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
