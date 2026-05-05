"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import {
  INTEGRATION_KIND_LABEL,
  TvIntegrationWizardModal,
} from "@/components/tv/tv-integration-wizard-modal";
import type { StoredIntegration } from "@/lib/integrations/types";
import {
  loadIntegrations,
  removeIntegration,
  upsertIntegration,
} from "@/lib/integrations/storage";
import { cn } from "@/lib/utils";

const GUIDE = [
  {
    id: "plex",
    title: "Plex",
    body: [
      "Plex is a media server with optional Live TV & DVR when paired with a tuner or provider. Zenede is a browser IPTV client: it plays stream URLs from M3U-style catalogs and optional XMLTV guides — it does not embed the full Plex client.",
      "Typical workflow: export or generate an M3U that lists the channels you care about, load that list under Catalog in Zenede, and keep Plex running your library and tuners on the network. When official APIs or companion scripts are added, you will be able to sync metadata without retyping URLs.",
    ],
  },
  {
    id: "jellyfin",
    title: "Jellyfin",
    body: [
      "Jellyfin is a self-hosted media stack. Its Live TV section can use HDHomeRun, M3U tuners, or other sources depending on your plugins.",
      "Point Zenede at the same M3U/XMLTV endpoints you trust for live streams (Settings → Catalog). Jellyfin continues to handle libraries, users, and transcoding policies on the server while Zenede focuses on lean full-screen playback in the browser.",
    ],
  },
  {
    id: "emby",
    title: "Emby",
    body: [
      "Emby is closely related to Jellyfin in spirit: a server-backed library with live TV options when configured.",
      "Use Zenede for the lean IPTV watching surface; keep Emby as the administration and recording hub. Store Emby’s base URL in an integration entry so you remember which household or VPS this browser profile targets.",
    ],
  },
  {
    id: "generic",
    title: "Generic — standards-based",
    body: [
      "Most IPTV tooling speaks a small set of open formats:",
      "M3U / Extended M3U (EXTINF lines) for channel lists and stream URLs.",
      "XMLTV for electronic program guide (EPG) windows.",
      "HLS (m3u8) and progressive HTTP streams that the browser can open directly.",
      "Choose “Generic — IPTV standards” in the wizard when your app is not branded above but still exposes M3U/XMLTV or plain HTTPS streams. Paste stable URLs into the integration record and again under Catalog / EPG when you wire playback.",
    ],
  },
] as const;

export function TvSettingsIntegrationsPanel() {
  const [rows, setRows] = useState<StoredIntegration[]>(() => loadIntegrations());
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<StoredIntegration | null>(null);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.updatedAt - a.updatedAt),
    [rows],
  );

  const refresh = useCallback(() => {
    setRows(loadIntegrations());
  }, []);

  const openCreate = useCallback(() => {
    setEditing(null);
    setWizardOpen(true);
  }, []);

  const openEdit = useCallback((row: StoredIntegration) => {
    setEditing(row);
    setWizardOpen(true);
  }, []);

  const onSave = useCallback(
    (entry: StoredIntegration) => {
      upsertIntegration(entry);
      refresh();
    },
    [refresh],
  );

  const onRemove = useCallback(
    (id: string) => {
      if (!confirm("Remove this integration record from this browser?")) return;
      removeIntegration(id);
      refresh();
    },
    [refresh],
  );

  return (
    <div className="space-y-10">
      <section
        className={cn(
          "rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 ring-1 ring-white/[0.04]",
        )}
        aria-labelledby="integrations-guide-heading"
      >
        <h2
          id="integrations-guide-heading"
          className="text-[18px] font-semibold text-white"
        >
          How integrations work
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-white/50">
          Zenede stays a lightweight IPTV front-end. Plex, Jellyfin, Emby, and other apps
          usually remain the system of record for libraries, users, and tuners. The entries
          you save below are reminders and bookmarks for{" "}
          <span className="text-white/70">this device</span> — useful before deeper API
          bridges ship.
        </p>

        <div className="mt-8 space-y-6">
          {GUIDE.map((g) => (
            <article
              key={g.id}
              className="rounded-xl border border-white/[0.08] bg-black/25 px-5 py-4"
            >
              <h3 className="text-[16px] font-semibold text-white">{g.title}</h3>
              <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-white/48">
                {g.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        className={cn(
          "rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 ring-1 ring-white/[0.04]",
        )}
        aria-labelledby="integrations-saved-heading"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2
              id="integrations-saved-heading"
              className="text-[18px] font-semibold text-white"
            >
              Your integrations
            </h2>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/50">
              Run the wizard to pick an app type, then save URLs and notes. Edit or remove
              entries anytime — nothing is sent to Zenede’s server until you use features
              that explicitly fetch playlists.
            </p>
          </div>
          <button type="button" onClick={() => openCreate()} className="shrink-0 outline-none">
            <ZenedeGlass variant="ctaPill">
              <span className="flex items-center gap-2 px-5 py-2.5 text-[15px] font-semibold text-zinc-950">
                <Plus className="h-4 w-4" aria-hidden />
                New integration
              </span>
            </ZenedeGlass>
          </button>
        </div>

        {sorted.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-white/[0.12] bg-black/20 px-5 py-8 text-center text-[14px] text-white/40">
            No integrations yet — use{" "}
            <span className="text-white/60">New integration</span> to walk through the
            stepper (choose app → details → confirm).
          </p>
        ) : (
          <ul className="mt-8 space-y-3">
            {sorted.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border border-white/[0.1] bg-black/30 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">{row.name}</p>
                  <p className="mt-1 text-[13px] text-white/45">
                    {INTEGRATION_KIND_LABEL[row.kind]}
                    <span className="text-white/25"> · </span>
                    Updated {new Date(row.updatedAt).toLocaleString()}
                  </p>
                  {row.serverBaseUrl ? (
                    <p className="mt-2 truncate text-[12px] text-white/38" title={row.serverBaseUrl}>
                      {row.serverBaseUrl}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-[13px] font-medium text-white/85 outline-none hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(row.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-[13px] font-medium text-red-200/95 outline-none hover:bg-red-500/15 focus-visible:ring-2 focus-visible:ring-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <TvIntegrationWizardModal
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          setEditing(null);
        }}
        editing={editing}
        onSave={onSave}
      />
    </div>
  );
}
