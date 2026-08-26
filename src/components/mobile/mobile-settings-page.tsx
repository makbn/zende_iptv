"use client";

import { Input } from "@appica/ui-react/input";

import { useCallback, useEffect, useState } from "react";

import { Card } from "@appica/ui-react/card";
import { TvCatalogSetupStrip } from "@/components/tv/tv-catalog-setup-strip";
import { TvManualChannelsSection } from "@/components/tv/tv-manual-channels-section";
import { TvPersonalLibraryCard } from "@/components/tv/tv-personal-library-card";
import { TvParentalControlsCard } from "@/components/tv/tv-parental-controls-card";
import { TvPlaybackPrefsCard } from "@/components/tv/tv-playback-prefs-card";
import { TvSettingsAuthPanel } from "@/components/tv/tv-settings-auth-panel";
import { TvSettingsIntegrationsPanel } from "@/components/tv/tv-settings-integrations-panel";
import { TvSettingsProxiesPanel } from "@/components/tv/tv-settings-proxies-panel";
import { TvSettingsCachePanel } from "@/components/tv/tv-settings-cache-panel";
import { Button } from "@appica/ui-react/button";
import { ZendeSpinner } from "@/components/loading/zende-spinner";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";
import { createClientLogger } from "@/core/logging/client";
import { useCatalogBootstrap } from "@/features/iptv/use-catalog-bootstrap";
import { useAuth } from "@/features/auth/auth-context";
import { Z_ACCESS } from "@/lib/auth/token-storage-keys";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "zende.cronSecret";
const source = BUILTIN_PLAYLIST_SOURCES[0]!;
const log = createClientLogger("shell.MobileSettingsPage");

type SettingsTab = "catalog" | "authentication" | "integrations" | "proxies" | "server";

export function MobileSettingsPage() {
  const { user, userCount } = useAuth();
  const canManageSystem = user?.role === "ADMIN" || userCount === 0;
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
    <main className="bg-background min-h-screen w-full max-w-full overflow-x-hidden pb-28 pt-[calc(4.75rem+env(safe-area-inset-top))] text-foreground">
      <section className="px-1.5">
        <div
          className={cn(
            "rounded-lg border border-border bg-background-muted px-3 py-2.5 ring-1 ring-border",
            "backdrop-blur-xl motion-reduce:animate-none motion-reduce:opacity-100",
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted text-[10px]">
            Zende
          </p>
          <h1 className="mt-1 text-[1.45rem] font-semibold leading-none tracking-[-0.055em] text-foreground-intense sm:text-[1.55rem]">
            Settings
          </h1>
          <p className="mt-1.5 max-w-[36ch] text-[11.5px] leading-snug text-foreground-intense">
            Catalog, security, integrations, VPN proxies, and server tools — tabs below.
          </p>
        </div>
      </section>

      <section className="sticky top-[5.35rem] z-40 mt-2 px-1" aria-label="Settings sections">
        <Card
          frame="solid"
          className="rounded-lg border-border bg-background p-1 shadow-lg transition-shadow duration-300"
        >
          <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Settings">
            {(
              (canManageSystem ? [
                ["catalog", "Catalog"],
                ["authentication", "Auth"],
                ["integrations", "Apps"],
                ["proxies", "VPN"],
                ["server", "Server"],
              ] : [["authentication", "My account"]]) as readonly (readonly [SettingsTab, string])[]
            ).map(([id, label]) => (
              <Button variant="ghost"
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "transition-colors min-h-11 shrink-0 rounded-2xl px-4 text-[13px] font-semibold outline-none",
                  "transition-[background-color,color,transform,box-shadow] duration-200 ease-out active:scale-[0.99] motion-reduce:transform-none",
                  "focus-visible:ring-2 focus-visible:ring-primary",
                  activeTab === id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-background-muted text-foreground-intense hover:bg-background-muted",
                )}
              >
                {label}
              </Button>
            ))}
          </div>
        </Card>
      </section>

      <div className="mt-2.5 min-w-0 max-w-full space-y-2.5 px-1.5" role="tabpanel">
        {canManageSystem && activeTab === "catalog" ? (
          <>
            <details open className="group rounded-lg border border-border bg-background-muted ring-1 ring-border">
              <summary className="cursor-pointer list-none px-4 py-3.5 text-[16px] font-semibold text-foreground-intense marker:content-none [&::-webkit-details-marker]:hidden">
                Catalog & playback
              </summary>
              <div className="space-y-4 border-t border-border p-4 pt-3">
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

        {activeTab === "authentication" ? (
          <details open className="rounded-lg border border-border bg-background-muted ring-1 ring-border">
            <summary className="cursor-pointer list-none px-4 py-3.5 text-[16px] font-semibold text-foreground-intense marker:content-none [&::-webkit-details-marker]:hidden">
              Authentication
            </summary>
            <div className="border-t border-border p-4 pt-3 space-y-4">
              <TvSettingsAuthPanel />
              {!canManageSystem ? (
                <>
                  <TvPlaybackPrefsCard />
                  <TvParentalControlsCard />
                  <TvPersonalLibraryCard />
                </>
              ) : null}
            </div>
          </details>
        ) : null}

        {canManageSystem && activeTab === "integrations" ? (
          <details open className="rounded-lg border border-border bg-background-muted ring-1 ring-border">
            <summary className="cursor-pointer list-none px-4 py-3.5 text-[16px] font-semibold text-foreground-intense marker:content-none [&::-webkit-details-marker]:hidden">
              Integrations
            </summary>
            <div className="border-t border-border p-4 pt-3">
              <TvSettingsIntegrationsPanel />
            </div>
          </details>
        ) : null}

        {canManageSystem && activeTab === "proxies" ? (
          <details open className="rounded-lg border border-border bg-background-muted ring-1 ring-border">
            <summary className="cursor-pointer list-none px-4 py-3.5 text-[16px] font-semibold text-foreground-intense marker:content-none [&::-webkit-details-marker]:hidden">
              VPN proxies
            </summary>
            <div className="border-t border-border p-4 pt-3">
              <TvSettingsProxiesPanel />
            </div>
          </details>
        ) : null}

        {canManageSystem && activeTab === "server" ? (
          <details open className="rounded-lg border border-border bg-background-muted ring-1 ring-border">
            <summary className="cursor-pointer list-none px-4 py-3.5 text-[16px] font-semibold text-foreground-intense marker:content-none [&::-webkit-details-marker]:hidden">
              Server tools
            </summary>
            <div className="border-t border-border p-4 pt-3">
            <TvSettingsCachePanel />
            <label className="mt-4 block">
              <span className="sr-only">Operator secret</span>
              <Input
                type="password"
                autoComplete="off"
                placeholder="Bearer token"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-[16px] text-foreground-intense outline-none placeholder:text-foreground-intense focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </label>
            <div className="mt-4 grid gap-3">
              <Button
                type="button"
                size="lg"
                variant="primary"
                onClick={saveSecret}
                className="w-full"
              >
                Save key
              </Button>
              <Button
                type="button"
                size="lg"
                disabled={runBusy}
                onClick={() => void runHealthSweep()}
                className="w-full"
              >
                {runBusy ? <><ZendeSpinner size="tiny" label="Running health sweep" /> Running…</> : "Run health sweep"}
              </Button>
            </div>
            {savedHint ? (
              <p className="mt-3 text-[14px] text-success-strong">{savedHint}</p>
            ) : null}
            {runStatus ? (
              <p className="mt-3 text-[14px] leading-relaxed text-foreground-intense">
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
