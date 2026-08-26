"use client";

import { Input } from "@appica/ui-react/input";

import { Button } from "@appica/ui-react/button";

import { Copy, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Card } from "@appica/ui-react/card";
import { ZendeLoadingState, ZendeSpinner } from "@/components/loading/zende-spinner";
import { TvSettingsSubtitlesPanel } from "@/components/tv/tv-settings-subtitles-panel";
import { createClientLogger } from "@/core/logging/client";
import { useAuth } from "@/features/auth/auth-context";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";

const log = createClientLogger("shell.TvSettingsIntegrationsPanel");

type CredentialRow = {
  id: string;
  label: string;
  portalUsername: string;
  createdAt: string;
  lastUsedAt: string | null;
  ownerUserId: string | null;
  ownerUsername?: string | null;
};

type ThreadfinInfo = {
  enabled: boolean;
  dvrAddress: string;
  discoverUrl: string;
  webUiUrl: string;
  publicHost: string;
  publicPort: number;
  tunerCount: number;
  threadfinM3uUrl: string;
  threadfinXmltvUrl: string;
  sourcePlaylistUrl: string;
  sourceEpgUrl: string;
  portalUsername: string;
  portalPassword: string;
  lineupMode: "primary-admin-favorites";
  lineupOwner: {
    userId: string;
    username: string;
    isGuest: boolean;
  };
  counts: {
    live: number;
    movie: number;
    episode: number;
    total: number;
    favoriteTotal: number;
    skippedUnplayable: number;
    capped: boolean;
    maxChannels: number;
  };
  lastSyncAt: string | null;
  lastSyncOk: boolean;
  lastSyncError: string | null;
};

async function parseJsonSafely(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function TvSettingsIntegrationsPanel() {
  const { authEnabled, user } = useAuth();
  const [rows, setRows] = useState<CredentialRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [portalUsernameCustom, setPortalUsernameCustom] = useState("");
  const [revealed, setRevealed] = useState<{
    portalUsername: string;
    portalPassword: string;
  } | null>(null);
  const [threadfin, setThreadfin] = useState<ThreadfinInfo | null>(null);
  const [threadfinSyncBusy, setThreadfinSyncBusy] = useState(false);

  const portalBaseUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await zendeFetch("/api/iptv-clients/credentials");
      const data = (await parseJsonSafely(res)) as {
        credentials?: CredentialRow[];
        error?: unknown;
      };
      if (!res.ok) {
        setHint(
          typeof data?.error === "string"
            ? data.error
            : "Could not load portal credentials.",
        );
        setRows([]);
        return;
      }
      setRows(Array.isArray(data.credentials) ? data.credentials : []);
      setHint(null);
    } catch (e) {
      log.warn("credentials load failed", {
        message: e instanceof Error ? e.message : String(e),
      });
      setHint("Could not load portal credentials.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadThreadfin = useCallback(async () => {
    try {
      const res = await zendeFetch("/api/threadfin/info");
      if (!res.ok) return;
      const data = (await parseJsonSafely(res)) as ThreadfinInfo;
      if (typeof data?.enabled === "boolean") setThreadfin(data);
    } catch {
      /* optional panel */
    }
  }, []);

  useEffect(() => {
    void loadThreadfin();
  }, [loadThreadfin]);

  const onThreadfinSync = useCallback(async () => {
    setThreadfinSyncBusy(true);
    setHint(null);
    try {
      const res = await zendeFetch("/api/threadfin/sync", { method: "POST" });
      const data = (await parseJsonSafely(res)) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setHint(
          typeof data?.error === "string"
            ? data.error
            : "Threadfin sync failed.",
        );
      }
      await loadThreadfin();
    } catch {
      setHint("Threadfin sync failed.");
    } finally {
      setThreadfinSyncBusy(false);
    }
  }, [loadThreadfin]);

  const onCreate = useCallback(async () => {
    setCreateBusy(true);
    setHint(null);
    try {
      const trimmedUser = portalUsernameCustom.trim();
      const body =
        trimmedUser || label.trim()
          ? {
              ...(label.trim() ? { label: label.trim() } : {}),
              ...(trimmedUser ? { portalUsername: trimmedUser } : {}),
            }
          : {};
      const res = await zendeFetch("/api/iptv-clients/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await parseJsonSafely(res)) as {
        portalPassword?: string;
        credential?: { portalUsername: string };
        error?: unknown;
      };
      if (!res.ok) {
        const err =
          data?.error &&
          typeof data.error === "object" &&
          data.error !== null &&
          "formErrors" in (data.error as object)
            ? "Check username format (3–48 letters, numbers, _ or -)."
            : typeof data?.error === "string"
              ? data.error
              : "Could not create credential.";
        setHint(err);
        return;
      }
      if (data.credential?.portalUsername && data.portalPassword) {
        setRevealed({
          portalUsername: data.credential.portalUsername,
          portalPassword: data.portalPassword,
        });
        setLabel("");
        setPortalUsernameCustom("");
      }
      await load();
    } catch {
      setHint("Could not create credential.");
    } finally {
      setCreateBusy(false);
    }
  }, [label, portalUsernameCustom, load]);

  const onDelete = useCallback(
    async (id: string) => {
      if (!confirm("Revoke this portal login? TiviMate and other apps using it will stop working.")) {
        return;
      }
      const res = await zendeFetch(`/api/iptv-clients/credentials/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setHint("Could not delete credential.");
        return;
      }
      setHint(null);
      await load();
    },
    [load],
  );

  const copy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text).catch(() => {
      setHint("Clipboard blocked — copy manually.");
    });
  }, []);

  const authGate =
    authEnabled && !user ? (
      <p className="rounded-xl border border-warning bg-warning-subtle px-4 py-3 text-[14px] text-warning-strong">
        Sign in to create and manage IPTV portal keys. External players can still use keys you
        created earlier.
      </p>
    ) : null;

  return (
    <div className="space-y-10">
      <TvSettingsSubtitlesPanel />

      <section
        className={cn(
          "rounded-2xl border border-border bg-background-muted p-6 ring-1 ring-border",
        )}
        aria-labelledby="iptv-players-heading"
      >
        <h2
          id="iptv-players-heading"
          className="text-[18px] font-semibold text-foreground-intense"
        >
          IPTV players (TiviMate, etc.)
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-foreground-intense">
          Zende exposes an <span className="text-foreground-intense">Xtream Codes–compatible</span> portal on
          the same host as the web app. Your catalog is whatever is wired in Settings → Catalog plus
          manual channels: live categories and streams mirror that merged lineup. Playlist URLs use
          the classic <span className="font-mono text-[13px] text-foreground-intense">player_api.php</span>,{" "}
          <span className="font-mono text-[13px] text-foreground-intense">get.php</span>,{" "}
          <span className="font-mono text-[13px] text-foreground-intense">xmltv.php</span>, and Xtream-style{" "}
          <span className="font-mono text-[13px] text-foreground-intense">/live/…</span> playback (relayed
          through the same proxy path as Watch in the browser). Movies/Series stubs return empty lists
          for now — add VOD shaping later if you standardize hosted media.
        </p>

        <ul className="mt-5 list-disc space-y-2 pl-5 text-[14px] text-foreground-intense">
          <li>
            <span className="text-foreground-intense">TiviMate</span> → add playlist →{" "}
            <span className="text-foreground-intense">Xtream Codes API</span>. Server = your site origin (
            <span className="font-mono text-[12px] text-foreground-intense">{portalBaseUrl || "…"}</span>
            ), username + password = a portal key from below.
          </li>
          <li>
            <span className="text-foreground-intense">M3U URL</span> → use the template with{" "}
            <span className="font-mono text-[12px] text-foreground-intense">get.php</span> (see per-key
            examples after you create a key).
          </li>
        </ul>
      </section>

      {threadfin?.enabled ? (
        <section
          className={cn(
            "rounded-2xl border border-border bg-background-muted p-6 ring-1 ring-border",
          )}
          aria-labelledby="plex-dvr-heading"
        >
          <h2 id="plex-dvr-heading" className="text-[18px] font-semibold text-foreground-intense">
            Plex DVR (Threadfin)
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground-intense">
            Zende runs{" "}
            <a
              href="https://github.com/Threadfin/Threadfin"
              className="text-success-strong underline decoration-border-strong underline-offset-2 hover:text-success-strong"
              target="_blank"
              rel="noreferrer"
            >
              Threadfin
            </a>{" "}
            as a sidecar and publishes only the primary administrator&apos;s playable favorites. Plex
            connects to Threadfin as an HDHomeRun tuner; favorite live streams, movies, and direct
            episodes appear as channels. Global parental controls are always enforced here.
          </p>

          <dl className="mt-5 grid gap-3 text-[14px] sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <dt className="text-foreground-intense">Device address (Plex)</dt>
              <dd className="mt-1 break-all font-mono text-[13px] text-success-strong">
                {threadfin.dvrAddress}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <dt className="text-foreground-intense">Threadfin web UI</dt>
              <dd className="mt-1 break-all font-mono text-[13px] text-foreground-intense">
                {threadfin.webUiUrl}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <dt className="text-foreground-intense">Tuners · channels</dt>
              <dd className="mt-1 text-foreground-intense">
                {threadfin.tunerCount} tuner{threadfin.tunerCount === 1 ? "" : "s"} ·{" "}
                {threadfin.counts.total.toLocaleString()} total (
                {threadfin.counts.live.toLocaleString()} live ·{" "}
                {threadfin.counts.movie.toLocaleString()} movies ·{" "}
                {threadfin.counts.episode.toLocaleString()} episodes)
                {threadfin.counts.capped
                  ? ` · capped at ${threadfin.counts.maxChannels.toLocaleString()}`
                  : ""}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <dt className="text-foreground-intense">Plex favorites owner</dt>
              <dd className="mt-1 text-foreground-intense">
                {threadfin.lineupOwner.username} · {threadfin.counts.favoriteTotal.toLocaleString()} saved
                {threadfin.counts.skippedUnplayable > 0
                  ? ` · ${threadfin.counts.skippedUnplayable.toLocaleString()} locked, duplicate, or unplayable`
                  : ""}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <dt className="text-foreground-intense">Last sync</dt>
              <dd className="mt-1 text-foreground-intense">
                {threadfin.lastSyncAt
                  ? new Date(threadfin.lastSyncAt).toLocaleString()
                  : "Not yet"}
                {threadfin.lastSyncOk ? " · OK" : threadfin.lastSyncError ? " · error" : ""}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-3 sm:col-span-2">
              <dt className="text-foreground-intense">Zende → Threadfin portal login</dt>
              <dd className="mt-1 space-y-1 font-mono text-[13px]">
                <div>
                  <span className="text-foreground-intense">user </span>
                  <span className="text-success-strong">{threadfin.portalUsername}</span>
                </div>
                <div>
                  <span className="text-foreground-intense">pass </span>
                  <span className="text-warning-strong">{threadfin.portalPassword}</span>
                </div>
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-3 sm:col-span-2">
              <dt className="text-foreground-intense">Threadfin export URLs</dt>
              <dd className="mt-1 space-y-1 break-all font-mono text-[12px] text-foreground-intense">
                <div>M3U: {threadfin.threadfinM3uUrl}</div>
                <div>XMLTV: {threadfin.threadfinXmltvUrl}</div>
              </dd>
            </div>
          </dl>

          {threadfin.lastSyncError ? (
            <p className="mt-4 rounded-lg border border-warning bg-warning-subtle px-3 py-2 text-[13px] text-warning-strong">
              {threadfin.lastSyncError}
            </p>
          ) : null}

          <div className="mt-5 rounded-xl border border-border bg-background p-4">
            <h3 className="text-[15px] font-semibold text-foreground-intense">Setup — follow in order</h3>
            <ol className="mt-3 list-decimal space-y-4 pl-5 text-[14px] leading-relaxed text-foreground-intense marker:font-semibold marker:text-success-strong">
              <li>
                <span className="font-medium text-foreground-intense">Start the two containers.</span>
                <div className="mt-1 rounded-md bg-background px-2.5 py-1.5 font-mono text-[12px] text-foreground-intense">
                  docker compose up -d --build zende threadfin
                </div>
              </li>
              <li>
                <span className="font-medium text-foreground-intense">Publish the /thf path to Zende.</span>{" "}
                If all of <span className="font-mono text-[12px]">example.com</span> already points
                to Zende, no additional route is needed. Otherwise preserve the path and route{" "}
                <span className="font-mono text-[12px] text-success-strong">
                  example.com/thf/* → 127.0.0.1:8077/thf/*
                </span>
                . Do not send /thf directly to port 34400; Zende removes the prefix and safely
                proxies it to the Threadfin Docker service.
              </li>
              <li>
                <span className="font-medium text-foreground-intense">Set the public URL and recreate Zende.</span>
                <div className="mt-1 rounded-md bg-background px-2.5 py-1.5 font-mono text-[12px] text-foreground-intense">
                  ZENDE_THREADFIN_PUBLIC_BASE_URL={threadfin.dvrAddress}
                </div>
              </li>
              <li>
                <span className="font-medium text-foreground-intense">Choose the Plex channels.</span> Sign in
                as <span className="text-success-strong">{threadfin.lineupOwner.username}</span> and
                favorite every live stream or VOD you want in Plex. Other accounts&apos; favorites are
                private and are not advertised to the household tuner.
              </li>
              <li>
                <span className="font-medium text-foreground-intense">Generate the lineup and guide.</span> Click{" "}
                <span className="text-success-strong">Generate XMLTV &amp; refresh Plex</span> below.
                Wait for Last sync to say <span className="text-success-strong">OK</span> and verify
                the displayed channel count matches your playable favorites.
              </li>
              <li>
                <span className="font-medium text-foreground-intense">Check the public endpoint.</span> Open{" "}
                <a
                  href={threadfin.discoverUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-[12px] text-success-strong underline decoration-border-strong underline-offset-2"
                >
                  {threadfin.discoverUrl}
                </a>
                . It must show JSON before Plex can connect.
              </li>
              <li>
                <span className="font-medium text-foreground-intense">Add it to Plex.</span> In Plex, open{" "}
                <span className="text-foreground-intense">Settings → Live TV &amp; DVR → Set Up Plex DVR</span>.
                If Plex does not discover it, choose the manual address option and paste{" "}
                <span className="break-all font-mono text-[12px] text-success-strong">
                  {threadfin.dvrAddress}
                </span>
                . Plex Live TV &amp; DVR requires Plex Pass.
              </li>
              <li>
                <span className="font-medium text-foreground-intense">Finish channels and guide.</span> Continue
                the Plex scan and choose <span className="text-foreground-intense">Use an XMLTV guide</span>.
                Paste this generated guide URL:
                <div className="mt-1 break-all rounded-md bg-background px-2.5 py-1.5 font-mono text-[12px] text-foreground-intense">
                  {threadfin.threadfinXmltvUrl}
                </div>
              </li>
              <li>
                <span className="font-medium text-foreground-intense">Test one channel.</span> If setup works but
                playback fails, test the same favorite in Zende, then generate the guide again. Live
                channels use Zende&apos;s MPEG-TS relay so Plex never calls the IPTV provider directly.
              </li>
            </ol>
          </div>

          <p className="mt-3 rounded-lg border border-primary bg-primary-subtle px-3 py-2 text-[13px] leading-relaxed text-primary-strong">
            If Plex rejects an HTTPS address containing <span className="font-mono">/thf</span>, use a
            dedicated hostname such as <span className="font-mono">thf.example.com</span> and route its
            root to Threadfin. Some Plex clients only accept a tuner host/IP and port.
          </p>

          {threadfin.counts.total > 480 ? (
            <p className="mt-4 rounded-lg border border-warning bg-warning-subtle px-3 py-2 text-[13px] text-warning-strong">
              Large lineups can overwhelm Plex. Lower{" "}
              <span className="font-mono text-[12px]">ZENDE_THREADFIN_MAX_CHANNELS</span> if setup
              hangs.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="ghost"
              type="button"
              onClick={() => copy(threadfin.dvrAddress)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground-intense outline-none hover:bg-background-muted"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy device address
            </Button>
            <Button variant="ghost"
              type="button"
              onClick={() => copy(threadfin.webUiUrl)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground-intense outline-none hover:bg-background-muted"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy Threadfin UI
            </Button>
            <Button variant="ghost"
              type="button"
              onClick={() => copy(threadfin.threadfinXmltvUrl)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground-intense outline-none hover:bg-background-muted"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy XMLTV
            </Button>
            <Button variant="ghost"
              type="button"
              onClick={() =>
                copy(`${threadfin.portalUsername}\t${threadfin.portalPassword}`)
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground-intense outline-none hover:bg-background-muted"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy portal login
            </Button>
            <Button variant="ghost"
              type="button"
              disabled={threadfinSyncBusy || (authEnabled && !user)}
              onClick={() => void onThreadfinSync()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-success bg-success-subtle px-3 py-2 text-[13px] font-medium text-success-strong outline-none hover:bg-success-subtle disabled:opacity-40"
            >
              {threadfinSyncBusy ? <><ZendeSpinner size="tiny" label="Generating Plex guide" /> Generating guide…</> : "Generate XMLTV & refresh Plex"}
            </Button>
          </div>
        </section>
      ) : null}

      <section
        className={cn(
          "rounded-2xl border border-border bg-background-muted p-6 ring-1 ring-border",
        )}
        aria-labelledby="portal-keys-heading"
      >
        <h2
          id="portal-keys-heading"
          className="text-[18px] font-semibold text-foreground-intense"
        >
          Portal API keys
        </h2>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-foreground-intense">
          Each key is a long-lived <span className="text-foreground-intense">username + password</span> pair
          (password is generated and stored hashed). Revoke a key anytime — it is independent of your
          web login session.
        </p>

        {authGate}

        {hint ? (
          <p className="mt-4 rounded-lg border border-error bg-error-subtle px-3 py-2 text-[13px] text-error-strong">
            {hint}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-4 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-3">
            <label className="block text-[13px] font-medium text-foreground-intense">
              Label (optional)
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Living room TV"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[14px] text-foreground-intense outline-none placeholder:text-foreground-intense focus-visible:ring-2 focus-visible:ring-border"
              />
            </label>
            <label className="block text-[13px] font-medium text-foreground-intense">
              Portal username (optional — auto-generated if empty)
              <Input
                value={portalUsernameCustom}
                onChange={(e) => setPortalUsernameCustom(e.target.value)}
                placeholder="my_tivimate_slot"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground-intense outline-none placeholder:text-foreground-intense focus-visible:ring-2 focus-visible:ring-border"
              />
              <span className="mt-1 block text-[11px] text-foreground-intense">
                3–48 characters: letters, digits, underscores, hyphen.
              </span>
            </label>
          </div>
          <Button variant="ghost"
            type="button"
            disabled={createBusy || (authEnabled && !user)}
            onClick={() => void onCreate()}
            className="shrink-0 outline-none disabled:opacity-40"
          >
            <Card frame="solid">
              <span className="flex items-center gap-2 px-5 py-2.5 text-[15px] font-semibold text-foreground-inverse">
                {createBusy ? <><ZendeSpinner size="tiny" label="Creating portal key" /> Creating…</> : "New portal key"}
              </span>
            </Card>
          </Button>
        </div>

        {busy ? (
          <ZendeLoadingState className="mt-6 items-start" size="small" label="Loading portal keys…" />
        ) : rows.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-border bg-background px-5 py-8 text-center text-[14px] text-foreground-intense">
            No portal keys yet. Create one — the password appears once; store it where TiviMate or
            your notes app keeps credentials.
          </p>
        ) : (
          <ul className="mt-8 space-y-4">
            {rows.map((r) => {
              const xtreamTester = portalBaseUrl
                ? `${portalBaseUrl}/player_api.php?username=${encodeURIComponent(r.portalUsername)}&password=YOUR_PASSWORD`
                : "";
              const m3uTemplate = portalBaseUrl
                ? `${portalBaseUrl}/get.php?username=${encodeURIComponent(r.portalUsername)}&password=YOUR_PASSWORD&type=m3u_plus&output=m3u8`
                : "";
              const xmltvTemplate = portalBaseUrl
                ? `${portalBaseUrl}/xmltv.php?username=${encodeURIComponent(r.portalUsername)}&password=YOUR_PASSWORD`
                : "";
              return (
                <li
                  key={r.id}
                  className="rounded-xl border border-border bg-background px-4 py-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground-intense">
                        {r.label?.trim() || r.portalUsername}
                      </p>
                      <p className="mt-1 font-mono text-[13px] text-success-strong">
                        {r.portalUsername}
                      </p>
                      {r.ownerUsername ? (
                        <p className="mt-1 text-[12px] text-foreground-intense">
                          Owner: {r.ownerUsername}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[12px] text-foreground-intense">
                        Created {new Date(r.createdAt).toLocaleString()}
                        {r.lastUsedAt
                          ? ` · Last used ${new Date(r.lastUsedAt).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                    <Button variant="ghost"
                      type="button"
                      onClick={() => void onDelete(r.id)}
                      disabled={authEnabled && !user}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-error bg-error-subtle px-3 py-2 text-[13px] font-medium text-error-strong outline-none hover:bg-error-subtle focus-visible:ring-2 focus-visible:ring-border disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Revoke
                    </Button>
                  </div>
                  {portalBaseUrl ? (
                    <div className="mt-4 space-y-2 text-[12px] text-foreground-intense">
                      <p className="text-foreground-intense">Reference URLs (replace YOUR_PASSWORD):</p>
                      <div className="flex flex-col gap-2">
                        {[
                          ["Xtream API", xtreamTester],
                          ["M3U (get.php)", m3uTemplate],
                          ["XMLTV", xmltvTemplate],
                        ].map(([k, u]) => (
                          <div
                            key={k}
                            className="flex flex-col gap-1 rounded-lg border border-border bg-background p-2 sm:flex-row sm:items-center sm:gap-2"
                          >
                            <span className="w-36 shrink-0 text-foreground-intense">{k}</span>
                            <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-foreground-intense">
                              {u}
                            </code>
                            <Button variant="ghost"
                              type="button"
                              onClick={() => copy(u)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground-intense outline-none hover:bg-background-muted"
                            >
                              <Copy className="h-3 w-3" aria-hidden />
                              Copy
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {revealed ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4"
          role="dialog"
          aria-modal
          aria-labelledby="reveal-key-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-xl">
            <h3 id="reveal-key-title" className="text-lg font-semibold text-foreground-intense">
              Save this password now
            </h3>
            <p className="mt-2 text-[14px] text-foreground-intense">
              It is not shown again. Use it as the Xtream / M3U password for this portal username.
            </p>
            <dl className="mt-4 space-y-3 text-[13px]">
              <div>
                <dt className="text-foreground-intense">Portal username</dt>
                <dd className="mt-1 break-all font-mono text-success-strong">{revealed.portalUsername}</dd>
              </div>
              <div>
                <dt className="text-foreground-intense">Portal password</dt>
                <dd className="mt-1 break-all font-mono text-warning-strong">{revealed.portalPassword}</dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="ghost"
                type="button"
                onClick={() =>
                  copy(`${revealed.portalUsername}\t${revealed.portalPassword}`)
                }
                className="rounded-lg bg-background-muted px-4 py-2 text-[13px] text-foreground-intense outline-none hover:bg-background-muted"
              >
                Copy username + password
              </Button>
              <Button variant="ghost"
                type="button"
                onClick={() => setRevealed(null)}
                className="rounded-lg bg-success-subtle px-4 py-2 text-[13px] font-semibold text-foreground-inverse outline-none hover:bg-success-subtle"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
