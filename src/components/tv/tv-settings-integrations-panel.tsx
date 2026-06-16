"use client";

import { Copy, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
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

type HdhrInfo = {
  enabled: boolean;
  deviceAddress: string | null;
  friendlyName: string;
  deviceId: string;
  tunerCount: number;
  channelCount: number;
  maxChannels: number | null;
  endpoints: {
    discover: string;
    lineup: string;
    epg: string;
  } | null;
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
  const [hdhr, setHdhr] = useState<HdhrInfo | null>(null);

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

  useEffect(() => {
    void (async () => {
      try {
        const res = await zendeFetch("/api/hdhr/info");
        if (!res.ok) return;
        const data = (await parseJsonSafely(res)) as HdhrInfo;
        if (typeof data?.enabled === "boolean") setHdhr(data);
      } catch {
        /* optional panel */
      }
    })();
  }, []);

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
      <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-[14px] text-amber-100/90">
        Sign in to create and manage IPTV portal keys. External players can still use keys you
        created earlier.
      </p>
    ) : null;

  return (
    <div className="space-y-10">
      <section
        className={cn(
          "rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 ring-1 ring-white/[0.04]",
        )}
        aria-labelledby="iptv-players-heading"
      >
        <h2
          id="iptv-players-heading"
          className="text-[18px] font-semibold text-white"
        >
          IPTV players (TiviMate, etc.)
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-white/50">
          Zenede exposes an <span className="text-white/70">Xtream Codes–compatible</span> portal on
          the same host as the web app. Your catalog is whatever is wired in Settings → Catalog plus
          manual channels: live categories and streams mirror that merged lineup. Playlist URLs use
          the classic <span className="font-mono text-[13px] text-white/60">player_api.php</span>,{" "}
          <span className="font-mono text-[13px] text-white/60">get.php</span>,{" "}
          <span className="font-mono text-[13px] text-white/60">xmltv.php</span>, and Xtream-style{" "}
          <span className="font-mono text-[13px] text-white/60">/live/…</span> playback (relayed
          through the same proxy path as Watch in the browser). Movies/Series stubs return empty lists
          for now — add VOD shaping later if you standardize hosted media.
        </p>

        <ul className="mt-5 list-disc space-y-2 pl-5 text-[14px] text-white/45">
          <li>
            <span className="text-white/65">TiviMate</span> → add playlist →{" "}
            <span className="text-white/65">Xtream Codes API</span>. Server = your site origin (
            <span className="font-mono text-[12px] text-white/55">{portalBaseUrl || "…"}</span>
            ), username + password = a portal key from below.
          </li>
          <li>
            <span className="text-white/65">M3U URL</span> → use the template with{" "}
            <span className="font-mono text-[12px] text-white/55">get.php</span> (see per-key
            examples after you create a key).
          </li>
        </ul>
      </section>

      {hdhr?.enabled && hdhr.deviceAddress ? (
        <section
          className={cn(
            "rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 ring-1 ring-white/[0.04]",
          )}
          aria-labelledby="plex-dvr-heading"
        >
          <h2 id="plex-dvr-heading" className="text-[18px] font-semibold text-white">
            Plex DVR (HDHomeRun)
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-white/50">
            Zenede emulates an{" "}
            <span className="text-white/70">HDHomeRun tuner</span> (same model as{" "}
            <a
              href="https://github.com/Threadfin/Threadfin"
              className="text-emerald-300/90 underline decoration-emerald-400/30 underline-offset-2 hover:text-emerald-200"
              target="_blank"
              rel="noreferrer"
            >
              Threadfin
            </a>
            ) so Plex can use your live catalog as a DVR source. Movies and series stay in the
            Zenede library — Plex DVR is for live channels only.
          </p>

          <dl className="mt-5 grid gap-3 text-[14px] sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3">
              <dt className="text-white/45">Device address (Plex)</dt>
              <dd className="mt-1 break-all font-mono text-[13px] text-emerald-200/95">
                {hdhr.deviceAddress}
              </dd>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3">
              <dt className="text-white/45">Tuners · channels</dt>
              <dd className="mt-1 text-white/75">
                {hdhr.tunerCount} tuner{hdhr.tunerCount === 1 ? "" : "s"} ·{" "}
                {hdhr.channelCount.toLocaleString()} live channel
                {hdhr.channelCount === 1 ? "" : "s"}
                {hdhr.maxChannels != null
                  ? ` (capped at ${hdhr.maxChannels.toLocaleString()})`
                  : ""}
              </dd>
            </div>
          </dl>

          <ol className="mt-5 list-decimal space-y-2 pl-5 text-[14px] text-white/45">
            <li>
              Plex → <span className="text-white/65">Settings → Live TV &amp; DVR → DVR</span> →
              add tuner → <span className="text-white/65">HDHomeRun</span>.
            </li>
            <li>
              Enter the device address above (host + port only, no path).
            </li>
            <li>
              Optional EPG: add XMLTV guide URL{" "}
              <span className="font-mono text-[12px] text-white/55">
                {hdhr.endpoints?.epg ?? `${portalBaseUrl}/hdhr/epg.xml`}
              </span>
            </li>
          </ol>

          {hdhr.channelCount > 10_000 ? (
            <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-100/90">
              Very large lineups can overwhelm Plex. Set{" "}
              <span className="font-mono text-[12px]">ZENDE_HDHR_MAX_CHANNELS</span> in Docker env
              to export a subset if setup hangs.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copy(hdhr.deviceAddress!)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-[13px] text-white/75 outline-none hover:bg-white/[0.06]"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy device address
            </button>
            {hdhr.endpoints?.epg ? (
              <button
                type="button"
                onClick={() => copy(hdhr.endpoints!.epg)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-[13px] text-white/75 outline-none hover:bg-white/[0.06]"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Copy EPG URL
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section
        className={cn(
          "rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 ring-1 ring-white/[0.04]",
        )}
        aria-labelledby="portal-keys-heading"
      >
        <h2
          id="portal-keys-heading"
          className="text-[18px] font-semibold text-white"
        >
          Portal API keys
        </h2>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-white/50">
          Each key is a long-lived <span className="text-white/70">username + password</span> pair
          (password is generated and stored hashed). Revoke a key anytime — it is independent of your
          web login session.
        </p>

        {authGate}

        {hint ? (
          <p className="mt-4 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-[13px] text-red-100/90">
            {hint}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-4 rounded-xl border border-white/[0.08] bg-black/25 p-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-3">
            <label className="block text-[13px] font-medium text-white/55">
              Label (optional)
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Living room TV"
                className="mt-1 w-full rounded-lg border border-white/[0.12] bg-black/40 px-3 py-2 text-[14px] text-white outline-none placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-white"
              />
            </label>
            <label className="block text-[13px] font-medium text-white/55">
              Portal username (optional — auto-generated if empty)
              <input
                value={portalUsernameCustom}
                onChange={(e) => setPortalUsernameCustom(e.target.value)}
                placeholder="my_tivimate_slot"
                className="mt-1 w-full rounded-lg border border-white/[0.12] bg-black/40 px-3 py-2 font-mono text-[13px] text-white outline-none placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-white"
              />
              <span className="mt-1 block text-[11px] text-white/38">
                3–48 characters: letters, digits, underscores, hyphen.
              </span>
            </label>
          </div>
          <button
            type="button"
            disabled={createBusy || (authEnabled && !user)}
            onClick={() => void onCreate()}
            className="shrink-0 outline-none disabled:opacity-40"
          >
            <ZenedeGlass variant="ctaPill">
              <span className="flex items-center gap-2 px-5 py-2.5 text-[15px] font-semibold text-zinc-950">
                {createBusy ? "Creating…" : "New portal key"}
              </span>
            </ZenedeGlass>
          </button>
        </div>

        {busy ? (
          <p className="mt-6 text-[14px] text-white/40">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-white/[0.12] bg-black/20 px-5 py-8 text-center text-[14px] text-white/40">
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
                  className="rounded-xl border border-white/[0.1] bg-black/30 px-4 py-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-white">
                        {r.label?.trim() || r.portalUsername}
                      </p>
                      <p className="mt-1 font-mono text-[13px] text-emerald-200/90">
                        {r.portalUsername}
                      </p>
                      {r.ownerUsername ? (
                        <p className="mt-1 text-[12px] text-white/38">
                          Owner: {r.ownerUsername}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[12px] text-white/35">
                        Created {new Date(r.createdAt).toLocaleString()}
                        {r.lastUsedAt
                          ? ` · Last used ${new Date(r.lastUsedAt).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onDelete(r.id)}
                      disabled={authEnabled && !user}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-[13px] font-medium text-red-200/95 outline-none hover:bg-red-500/15 focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Revoke
                    </button>
                  </div>
                  {portalBaseUrl ? (
                    <div className="mt-4 space-y-2 text-[12px] text-white/42">
                      <p className="text-white/55">Reference URLs (replace YOUR_PASSWORD):</p>
                      <div className="flex flex-col gap-2">
                        {[
                          ["Xtream API", xtreamTester],
                          ["M3U (get.php)", m3uTemplate],
                          ["XMLTV", xmltvTemplate],
                        ].map(([k, u]) => (
                          <div
                            key={k}
                            className="flex flex-col gap-1 rounded-lg border border-white/[0.06] bg-black/40 p-2 sm:flex-row sm:items-center sm:gap-2"
                          >
                            <span className="w-36 shrink-0 text-white/50">{k}</span>
                            <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-white/60">
                              {u}
                            </code>
                            <button
                              type="button"
                              onClick={() => copy(u)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/[0.1] px-2 py-1 text-[11px] text-white/70 outline-none hover:bg-white/[0.06]"
                            >
                              <Copy className="h-3 w-3" aria-hidden />
                              Copy
                            </button>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal
          aria-labelledby="reveal-key-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/[0.12] bg-zinc-950 p-6 shadow-xl">
            <h3 id="reveal-key-title" className="text-lg font-semibold text-white">
              Save this password now
            </h3>
            <p className="mt-2 text-[14px] text-white/55">
              It is not shown again. Use it as the Xtream / M3U password for this portal username.
            </p>
            <dl className="mt-4 space-y-3 text-[13px]">
              <div>
                <dt className="text-white/45">Portal username</dt>
                <dd className="mt-1 break-all font-mono text-emerald-200">{revealed.portalUsername}</dd>
              </div>
              <div>
                <dt className="text-white/45">Portal password</dt>
                <dd className="mt-1 break-all font-mono text-amber-200">{revealed.portalPassword}</dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  copy(`${revealed.portalUsername}\t${revealed.portalPassword}`)
                }
                className="rounded-lg bg-white/[0.1] px-4 py-2 text-[13px] text-white outline-none hover:bg-white/[0.14]"
              >
                Copy username + password
              </button>
              <button
                type="button"
                onClick={() => setRevealed(null)}
                className="rounded-lg bg-emerald-500/90 px-4 py-2 text-[13px] font-semibold text-zinc-950 outline-none hover:bg-emerald-400"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
