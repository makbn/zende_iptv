"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Pencil, Trash2, X } from "lucide-react";

import { parseM3u } from "@/core/playlist/m3u-parse";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { ZendeGlass } from "@/components/glass/zende-glass";
import { useAuth } from "@/features/auth/auth-context";
import {
  canModifyManualChannelEntry,
  type ManualChannelsGate,
} from "@/lib/channels/manual-channels-policy";
import {
  refreshManualChannelsFromApi,
  isAllowedManualStreamUrl,
  type ManualChannelEntry,
} from "@/lib/channels/manual-channels-store";
import { notifyCatalogCleared } from "@/lib/channels/catalog-events";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";

function buildChannel(input: {
  name: string;
  url: string;
  groupTitle?: string;
  tvgLogo?: string;
  tvgLanguage?: string;
  tvgId?: string;
  description?: string;
}): M3uChannel | null {
  const name = input.name.trim();
  const url = input.url.trim();
  if (!name || !isAllowedManualStreamUrl(url)) return null;
  return {
    name,
    url,
    duration: -1 as const,
    ...(input.groupTitle?.trim()
      ? { groupTitle: input.groupTitle.trim() }
      : {}),
    ...(input.tvgLogo?.trim() ? { tvgLogo: input.tvgLogo.trim() } : {}),
    ...(input.tvgLanguage?.trim()
      ? { tvgLanguage: input.tvgLanguage.trim() }
      : {}),
    ...(input.tvgId?.trim() ? { tvgId: input.tvgId.trim() } : {}),
    ...(input.description?.trim()
      ? { description: input.description.trim() }
      : {}),
  };
}

function entryToGate(
  authEnabled: boolean,
  user: { id: string; role: "ADMIN" | "USER" } | null,
): ManualChannelsGate {
  if (!authEnabled) return { authEnabled: false };
  if (!user) return { authEnabled: true, user: { id: "__none__", role: "USER" } };
  return { authEnabled: true, user: { id: user.id, role: user.role } };
}

function canModifyEntry(
  entry: ManualChannelEntry,
  authEnabled: boolean,
  user: { id: string; role: "ADMIN" | "USER" } | null,
): boolean {
  return canModifyManualChannelEntry(
    {
      id: entry.id,
      channel: entry.channel,
      addedAt: entry.addedAt,
      addedByUserId: entry.addedByUserId,
    },
    entryToGate(authEnabled, user),
  );
}

export function TvManualChannelsSection() {
  const ENTRY_PAGE_SIZE = 150;
  const { authEnabled, user } = useAuth();
  const [entries, setEntries] = useState<ManualChannelEntry[]>([]);
  const [entriesTotal, setEntriesTotal] = useState(0);
  const [builtinChannelTotal, setBuiltinChannelTotal] = useState(0);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [logo, setLogo] = useState("");
  const [m3uPaste, setM3uPaste] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [xtreamHost, setXtreamHost] = useState("");
  const [xtreamUser, setXtreamUser] = useState("");
  const [xtreamPass, setXtreamPass] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [manageQuery, setManageQuery] = useState("");
  const [visibleManageCount, setVisibleManageCount] = useState(ENTRY_PAGE_SIZE);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const loadEntries = useCallback(async (query: string, limit: number) => {
    setLoadingEntries(true);
    try {
      const q = encodeURIComponent(query.trim());
      const res = await zendeFetch(
        `/api/channels/manual?mode=list&q=${q}&offset=0&limit=${limit}`,
      );
      const body = (await res.json().catch(() => ({}))) as {
        entries?: ManualChannelEntry[];
        total?: number;
      };
      if (res.ok) {
        setEntries(Array.isArray(body.entries) ? body.entries : []);
        setEntriesTotal(typeof body.total === "number" ? body.total : 0);
      }
    } finally {
      setLoadingEntries(false);
    }
  }, []);

  const loadInventoryCount = useCallback(async () => {
    try {
      const res = await zendeFetch("/api/channels/manual?mode=count");
      if (!res.ok) return;
      const body = (await res.json()) as {
        manualTotal?: number;
        builtinChannelTotal?: number;
        total?: number;
      };
      if (typeof body.manualTotal === "number") setEntriesTotal(body.manualTotal);
      else if (typeof body.total === "number") setEntriesTotal(body.total);
      if (typeof body.builtinChannelTotal === "number") {
        setBuiltinChannelTotal(body.builtinChannelTotal);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadInventoryCount();
  }, [loadInventoryCount]);

  useEffect(() => {
    if (!manageOpen) return;
    const q = manageQuery.trim();
    if (q.length < 2) {
      setEntries([]);
      return;
    }
    void loadEntries(q, visibleManageCount);
  }, [loadEntries, manageOpen, manageQuery, visibleManageCount]);

  const [editing, setEditing] = useState<ManualChannelEntry | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editGroup, setEditGroup] = useState("");
  const [editLogo, setEditLogo] = useState("");
  const [editLang, setEditLang] = useState("");
  const [editTvgId, setEditTvgId] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editHint, setEditHint] = useState<string | null>(null);

  const openEdit = useCallback((e: ManualChannelEntry) => {
    setEditing(e);
    const ch = e.channel;
    setEditName(ch.name);
    setEditUrl(ch.url);
    setEditGroup(ch.groupTitle ?? "");
    setEditLogo(ch.tvgLogo ?? "");
    setEditLang(ch.tvgLanguage ?? "");
    setEditTvgId(ch.tvgId ?? "");
    setEditDescription(ch.description ?? "");
    setEditHint(null);
  }, []);

  const closeEdit = useCallback(() => {
    setEditing(null);
    setEditHint(null);
  }, []);

  const onSaveEdit = useCallback(async () => {
    if (!editing) return;
    setEditHint(null);
    const ch = buildChannel({
      name: editName,
      url: editUrl,
      groupTitle: editGroup,
      tvgLogo: editLogo,
      tvgLanguage: editLang,
      tvgId: editTvgId,
      description: editDescription,
    });
    if (!ch) {
      setEditHint("Enter a channel name and a valid http(s) stream URL.");
      return;
    }
    await zendeFetch("/api/channels/manual", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editing.id, channel: ch }),
    });
    await loadEntries(manageQuery, visibleManageCount);
    await refreshManualChannelsFromApi();
    setHint(`Updated “${ch.name}”.`);
    closeEdit();
    window.setTimeout(() => setHint(null), 3200);
  }, [
    editing,
    editName,
    editUrl,
    editGroup,
    editLogo,
    editLang,
    editTvgId,
    editDescription,
    closeEdit,
    loadEntries,
    manageQuery,
    visibleManageCount,
  ]);

  const clearForm = useCallback(() => {
    setName("");
    setUrl("");
    setGroupTitle("");
    setLogo("");
  }, []);

  const onAddOne = useCallback(() => {
    setHint(null);
    const ch = buildChannel({ name, url, groupTitle, tvgLogo: logo });
    if (!ch) {
      setHint("Enter a channel name and a valid http(s) stream URL.");
      return;
    }
    void zendeFetch("/api/channels/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: ch }),
    }).then(async () => {
      await loadEntries(manageQuery, visibleManageCount);
      await refreshManualChannelsFromApi();
    });
    setHint(`Added “${ch.name}”.`);
    clearForm();
    window.setTimeout(() => setHint(null), 3200);
  }, [name, url, groupTitle, logo, clearForm]);

  const onImportM3u = useCallback(async () => {
    setHint(null);
    const text = m3uPaste.trim();
    if (!text) {
      setHint("Paste M3U text first.");
      return;
    }
    const parsed = parseM3u(text);
    if (parsed.length === 0) {
      setHint("No channels found — check that the text looks like an M3U playlist.");
      return;
    }
    let skipped = 0;
    const valid = parsed.filter((ch) => {
      const ok = isAllowedManualStreamUrl(ch.url);
      if (!ok) skipped++;
      return ok;
    });
    const res = await zendeFetch("/api/channels/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channels: valid }),
    });
    const body = (await res.json().catch(() => ({}))) as { processed?: number };
    const processed = typeof body.processed === "number" ? body.processed : 0;
    await loadEntries(manageQuery, visibleManageCount);
    await refreshManualChannelsFromApi();
    setM3uPaste("");
    setHint(
      processed > 0
        ? `Added or updated ${processed} channel${processed === 1 ? "" : "s"} from the paste.${
            skipped > 0 ? ` Skipped ${skipped} invalid URL${skipped === 1 ? "" : "s"}.` : ""
          }`
        : skipped > 0
          ? `No valid stream URLs found (${skipped} skipped).`
          : "Nothing imported.",
    );
    window.setTimeout(() => setHint(null), 4500);
  }, [loadEntries, m3uPaste, manageQuery, visibleManageCount]);

  const importFromUrl = useCallback(
    async (rawUrl: string) => {
      setHint("Importing… this can take a minute for large IPTV lists.");
      const url = rawUrl.trim();
      if (!url) {
        setHint("Enter a playlist URL first.");
        return;
      }
      try {
        const res = await zendeFetch("/api/playlists/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, persist: true }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          count?: number;
          processed?: number;
          skipped?: number;
          storeTotal?: number;
        };
        if (!res.ok) {
          setHint(body.error ?? "Could not import from that URL.");
          return;
        }
        const processed = typeof body.processed === "number" ? body.processed : 0;
        const total = typeof body.count === "number" ? body.count : processed;
        const skipped = typeof body.skipped === "number" ? body.skipped : 0;
        await loadInventoryCount();
        await refreshManualChannelsFromApi();
        notifyCatalogCleared();
        setHint(
          `Imported ${processed.toLocaleString()} of ${total.toLocaleString()} channels on the server.${
            skipped > 0 ? ` Skipped ${skipped.toLocaleString()} invalid URL${skipped === 1 ? "" : "s"}.` : ""
          }`,
        );
        window.setTimeout(() => setHint(null), 6000);
      } catch {
        setHint("Could not import from that URL.");
      }
    },
    [loadInventoryCount],
  );

  const onImportPlaylistUrl = useCallback(async () => {
    await importFromUrl(playlistUrl);
    setPlaylistUrl("");
  }, [importFromUrl, playlistUrl]);

  const onRemoveAllImported = useCallback(async () => {
    const ok = window.confirm(
      "Remove ALL channels from this server?\n\nThis deletes:\n• Your imported live channels, movies, and shows\n• The cached World channel index catalog\n\nThis cannot be undone. You can re-add the world index or re-import Xtream afterward.",
    );
    if (!ok) return;
    setClearingAll(true);
    setHint(null);
    try {
      const res = await zendeFetch("/api/channels/manual", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, confirm: "REMOVE_ALL_IMPORTED" }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        removed?: number;
        manualRemoved?: number;
        builtinChannelsCleared?: number;
        remaining?: number;
        error?: string;
      };
      if (!res.ok) {
        setHint(body.error ?? "Could not remove channels.");
        return;
      }
      const manualRemoved =
        typeof body.manualRemoved === "number" ? body.manualRemoved : 0;
      const builtinCleared =
        typeof body.builtinChannelsCleared === "number"
          ? body.builtinChannelsCleared
          : 0;
      setEntries([]);
      setEntriesTotal(0);
      setBuiltinChannelTotal(0);
      setSelectedEntryId(null);
      setManageOpen(false);
      setManageQuery("");
      await refreshManualChannelsFromApi();
      notifyCatalogCleared();
      await loadInventoryCount();
      setHint(
        manualRemoved + builtinCleared > 0
          ? `Removed ${manualRemoved.toLocaleString()} imported item${manualRemoved === 1 ? "" : "s"} and cleared ${builtinCleared.toLocaleString()} world-index channel${builtinCleared === 1 ? "" : "s"}.`
          : "Nothing was removed.",
      );
      window.setTimeout(() => setHint(null), 4500);
    } catch {
      setHint("Could not remove channels.");
    } finally {
      setClearingAll(false);
    }
  }, [loadInventoryCount]);

  const onImportXtream = useCallback(async () => {
    const host = xtreamHost.trim();
    const username = xtreamUser.trim();
    const password = xtreamPass.trim();
    if (!host || !username || !password) {
      setHint("Enter Xtream host, username, and password.");
      return;
    }
    setHint("Importing from Xtream… large lists are saved entirely on the server.");
    try {
      const res = await zendeFetch("/api/playlists/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xtream: { host, username, password }, persist: true }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        count?: number;
        processed?: number;
        skipped?: number;
      };
      if (!res.ok) {
        setHint(body.error ?? "Could not import Xtream playlist.");
        return;
      }
      const processed = typeof body.processed === "number" ? body.processed : 0;
      const total = typeof body.count === "number" ? body.count : processed;
      const skipped = typeof body.skipped === "number" ? body.skipped : 0;
      await loadInventoryCount();
      await refreshManualChannelsFromApi();
      notifyCatalogCleared();
      setHint(
        `Imported ${processed.toLocaleString()} of ${total.toLocaleString()} items (live, movies, shows) on the server.${
          skipped > 0 ? ` Skipped ${skipped.toLocaleString()} invalid URL${skipped === 1 ? "" : "s"}.` : ""
        }`,
      );
      window.setTimeout(() => setHint(null), 6000);
    } catch {
      setHint("Could not import Xtream playlist.");
    }
  }, [loadInventoryCount, xtreamHost, xtreamPass, xtreamUser]);

  useEffect(() => {
    setVisibleManageCount(ENTRY_PAGE_SIZE);
    setSelectedEntryId(null);
  }, [manageQuery]);

  const visibleEntries = entries;
  const hasMoreManage = entriesTotal > visibleEntries.length;
  const selectedEntry = useMemo(
    () => visibleEntries.find((e) => e.id === selectedEntryId) ?? null,
    [selectedEntryId, visibleEntries],
  );

  const inputClass = cn(
    "mt-1.5 h-11 w-full rounded-xl border border-white/[0.12] bg-black/30 px-4",
    "text-[15px] text-white placeholder:text-white/35",
    "outline-none ring-offset-[var(--tv-page-bg)] focus-visible:ring-2 focus-visible:ring-white",
  );

  return (
    <section
      className={cn(
        "rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 ring-1 ring-white/[0.04]",
      )}
      aria-labelledby="manual-channels-heading"
    >
      <h2
        id="manual-channels-heading"
        className="text-[18px] font-semibold text-white"
      >
        Your streams
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-white/50">
        Add channels by URL — they show up everywhere alongside the built-in catalog:
        Home, Library, search, and Watch. When sign-in is enabled, each channel is
        owned by whoever added or imported it; admins can edit any channel.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={clearingAll || (entriesTotal === 0 && builtinChannelTotal === 0)}
          onClick={() => void onRemoveAllImported()}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl border border-red-400/35 bg-red-500/10 px-4 py-2.5",
            "text-[14px] font-semibold text-red-200/95 outline-none transition-colors",
            "hover:bg-red-500/18 focus-visible:ring-2 focus-visible:ring-red-300/60",
            "disabled:cursor-not-allowed disabled:opacity-45",
          )}
        >
          <Trash2 className="size-4" aria-hidden />
          {clearingAll ? "Removing…" : "Remove all channels"}
        </button>
        {entriesTotal > 0 || builtinChannelTotal > 0 ? (
          <span className="text-[13px] text-white/40">
            {entriesTotal > 0
              ? `${entriesTotal.toLocaleString()} imported`
              : "No imports"}
            {builtinChannelTotal > 0
              ? ` · ${builtinChannelTotal.toLocaleString()} world index`
              : ""}
          </span>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-[13px] font-medium text-white/55">Channel name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Local news HD"
            autoComplete="off"
            className={inputClass}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[13px] font-medium text-white/55">Stream URL</span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            autoComplete="off"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-white/55">Group (optional)</span>
          <input
            type="text"
            value={groupTitle}
            onChange={(e) => setGroupTitle(e.target.value)}
            placeholder="e.g. Local"
            autoComplete="off"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-white/55">Logo URL (optional)</span>
          <input
            type="url"
            value={logo}
            onChange={(e) => setLogo(e.target.value)}
            placeholder="https://…"
            autoComplete="off"
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onAddOne()}
          className="outline-none transition-transform active:scale-[0.99] motion-reduce:transform-none"
        >
          <ZendeGlass variant="ctaPill">
            <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-zinc-950">
              Add channel
            </span>
          </ZendeGlass>
        </button>
      </div>

      <div className="mt-8 border-t border-white/[0.08] pt-8">
        <h3 className="text-[15px] font-semibold text-white/90">
          Import from playlist URL
        </h3>
        <p className="mt-1 text-[14px] leading-relaxed text-white/45">
          Paste a remote M3U/M3U8 URL and Zende imports channels server-side.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="url"
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder="http(s)://.../playlist.m3u8"
            className={cn(inputClass, "mt-0 min-w-[320px] flex-1")}
          />
          <button
            type="button"
            onClick={() => void onImportPlaylistUrl()}
            className="outline-none transition-transform active:scale-[0.99] motion-reduce:transform-none"
          >
            <ZendeGlass variant="heroSecondary" className="inline-block">
              <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-white">
                Import URL
              </span>
            </ZendeGlass>
          </button>
        </div>

        <h3 className="mt-8 text-[15px] font-semibold text-white/90">
          Import from Xtream credentials
        </h3>
        <p className="mt-1 text-[14px] leading-relaxed text-white/45">
          Enter server host, username, and password. Zende builds the
          <code className="mx-1 text-white/70">get.php</code> URL automatically.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <input
            type="text"
            value={xtreamHost}
            onChange={(e) => setXtreamHost(e.target.value)}
            placeholder="http://example.com"
            className={cn(inputClass, "mt-0")}
          />
          <input
            type="text"
            value={xtreamUser}
            onChange={(e) => setXtreamUser(e.target.value)}
            placeholder="Username"
            className={cn(inputClass, "mt-0")}
          />
          <input
            type="text"
            value={xtreamPass}
            onChange={(e) => setXtreamPass(e.target.value)}
            placeholder="Password"
            className={cn(inputClass, "mt-0")}
          />
        </div>
        <button
          type="button"
          onClick={() => void onImportXtream()}
          className="mt-3 outline-none transition-transform active:scale-[0.99] motion-reduce:transform-none"
        >
          <ZendeGlass variant="heroSecondary" className="inline-block">
            <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-white">
              Import Xtream playlist
            </span>
          </ZendeGlass>
        </button>

        <h3 className="mt-8 text-[15px] font-semibold text-white/90">
          Import from M3U
        </h3>
        <p className="mt-1 text-[14px] leading-relaxed text-white/45">
          Paste a snippet from any compatible playlist file — multiple channels at once.
        </p>
        <textarea
          value={m3uPaste}
          onChange={(e) => setM3uPaste(e.target.value)}
          rows={5}
          placeholder={"#EXTINF:-1,Example\nhttps://example.com/stream.m3u8"}
          className={cn(
            "mt-3 w-full resize-y rounded-xl border border-white/[0.12] bg-black/30 px-4 py-3",
            "font-mono text-[13px] leading-relaxed text-white placeholder:text-white/30",
            "outline-none ring-offset-[var(--tv-page-bg)] focus-visible:ring-2 focus-visible:ring-white",
          )}
        />
        <button
          type="button"
          onClick={() => onImportM3u()}
          className="mt-3 outline-none transition-transform active:scale-[0.99] motion-reduce:transform-none"
        >
          <ZendeGlass variant="heroSecondary" className="inline-block">
            <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-white">
              Import pasted channels
            </span>
          </ZendeGlass>
        </button>
      </div>

      {hint ? (
        <p
          className={cn(
            "mt-4 text-[14px]",
            hint.startsWith("Added") ||
              hint.startsWith("Imported") ||
              hint.startsWith("Updated")
              ? "text-emerald-400/95"
              : "text-amber-300/95",
          )}
          role="status"
        >
          {hint}
        </p>
      ) : null}

      {entries.length > 0 || entriesTotal > 0 || manageOpen ? (
        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[15px] font-semibold text-white/90">
              Channel manager
            </h3>
            <button
              type="button"
              onClick={() => setManageOpen((v) => !v)}
              className="rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 py-2 text-[13px] font-medium text-white/80 outline-none hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white"
            >
              {manageOpen ? "Hide manager" : "Search & manage channels"}
            </button>
          </div>

          {manageOpen ? (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  type="text"
                  value={manageQuery}
                  onChange={(e) => setManageQuery(e.target.value)}
                  placeholder="Type at least 2 chars: name, URL, group, language..."
                  className={cn(inputClass, "mt-0 min-w-[280px] flex-1")}
                />
                {manageQuery ? (
                  <button
                    type="button"
                    onClick={() => setManageQuery("")}
                    className="rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 py-2 text-[13px] font-medium text-white/75 outline-none hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              {selectedEntry ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[12px] text-white/45">
                    Selected: <span className="text-white/80">{selectedEntry.channel.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => openEdit(selectedEntry)}
                    className="rounded-xl border border-white/[0.12] bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-white/80 outline-none hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white"
                  >
                    Edit selected
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void zendeFetch("/api/channels/manual", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: selectedEntry.id }),
                      }).then(async () => {
                        await loadEntries(manageQuery, visibleManageCount);
                        await refreshManualChannelsFromApi();
                        setSelectedEntryId(null);
                      })
                    }
                    className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-[12px] font-medium text-red-100 outline-none hover:bg-red-500/20 focus-visible:ring-2 focus-visible:ring-red-300"
                  >
                    Remove selected
                  </button>
                </div>
              ) : null}

              {manageQuery.trim().length < 2 ? (
                <p className="mt-3 text-[13px] text-white/45">
                  Enter at least 2 characters to search channels.
                </p>
              ) : null}

              {loadingEntries ? (
                <p className="mt-3 text-[13px] text-white/45">Searching…</p>
              ) : null}

              {manageQuery.trim().length >= 2 ? (
                <>
                  <p className="mt-3 text-[12px] text-white/40">
                    Results: {visibleEntries.length.toLocaleString()} / {entriesTotal.toLocaleString()}
                  </p>
                  <ul className="mt-2 space-y-2" aria-label="Manual channel search results">
                    {visibleEntries.map((e) => {
                      const mod = canModifyEntry(e, authEnabled, user);
                      const selected = e.id === selectedEntryId;
                      return (
                        <li
                          key={e.id}
                          className={cn(
                            "flex items-start gap-3 rounded-xl border px-4 py-3",
                            selected
                              ? "border-white/[0.24] bg-white/[0.09]"
                              : "border-white/[0.08] bg-black/25",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedEntryId(e.id)}
                            className="mt-0.5 rounded-md border border-white/[0.2] bg-white/[0.06] px-2 py-1 text-[11px] text-white/75 outline-none hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white"
                            aria-label={`Select ${e.channel.name}`}
                          >
                            {selected ? "Selected" : "Select"}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-medium text-white">
                              {e.channel.name}
                            </p>
                            <p className="mt-0.5 truncate font-mono text-[12px] text-white/45">
                              {e.channel.url}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-white/38">
                              {e.channel.groupTitle ? <span>{e.channel.groupTitle}</span> : null}
                              {e.channel.tvgLanguage ? (
                                <span>Lang: {e.channel.tvgLanguage}</span>
                              ) : null}
                            </div>
                          </div>
                          {!mod ? (
                            <span className="px-2 py-1 text-[11px] text-white/35">
                              Added by another user
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  {entriesTotal === 0 && !loadingEntries ? (
                    <p className="mt-3 text-[13px] text-white/45">No channels match that search.</p>
                  ) : null}
                  {hasMoreManage ? (
                    <button
                      type="button"
                      onClick={() => setVisibleManageCount((n) => n + ENTRY_PAGE_SIZE)}
                      className="mt-3 rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 py-2 text-[13px] font-medium text-white/80 outline-none hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white"
                    >
                      Load more ({Math.min(ENTRY_PAGE_SIZE, entriesTotal - visibleEntries.length)} more)
                    </button>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <p className="mt-8 text-[14px] text-white/38">
          No personal streams yet — add one above or import from M3U.
        </p>
      )}

      {editing ? (
        <div
          className={cn(
            "fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center",
            "motion-safe:animate-[glass-backdrop-in_0.25s_ease-out_both] motion-reduce:animate-none motion-reduce:opacity-100",
          )}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-manual-channel-title"
        >
          <div
            className={cn(
              "max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/[0.12] bg-[var(--tv-page-bg)] p-6 shadow-2xl",
              "motion-safe:animate-[glass-modal-pop_0.36s_cubic-bezier(0.16,1,0.3,1)_both]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <h3
                id="edit-manual-channel-title"
                className="text-[17px] font-semibold text-white"
              >
                Edit channel
              </h3>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-lg p-2 text-white/55 outline-none transition-colors hover:bg-white/10 hover:text-white active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="block">
                <span className="text-[13px] font-medium text-white/55">Name</span>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={inputClass}
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-medium text-white/55">Stream URL</span>
                <input
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className={inputClass}
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-medium text-white/55">Logo URL</span>
                <input
                  type="url"
                  value={editLogo}
                  onChange={(e) => setEditLogo(e.target.value)}
                  className={inputClass}
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-medium text-white/55">Group</span>
                <input
                  type="text"
                  value={editGroup}
                  onChange={(e) => setEditGroup(e.target.value)}
                  className={inputClass}
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-medium text-white/55">Language</span>
                <input
                  type="text"
                  value={editLang}
                  onChange={(e) => setEditLang(e.target.value)}
                  placeholder="e.g. English"
                  className={inputClass}
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-medium text-white/55">TVG ID</span>
                <input
                  type="text"
                  value={editTvgId}
                  onChange={(e) => setEditTvgId(e.target.value)}
                  className={inputClass}
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-medium text-white/55">Description</span>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className={cn(
                    "mt-1.5 w-full resize-y rounded-xl border border-white/[0.12] bg-black/30 px-4 py-3",
                    "text-[15px] text-white placeholder:text-white/35",
                    "outline-none ring-offset-[var(--tv-page-bg)] focus-visible:ring-2 focus-visible:ring-white",
                  )}
                  autoComplete="off"
                />
              </label>
            </div>

            {editHint ? (
              <p className="mt-3 text-[14px] text-amber-300/95" role="status">
                {editHint}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-xl px-4 py-2.5 text-[15px] font-medium text-white/70 outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white active:bg-white/10 motion-reduce:transition-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSaveEdit}
                className="outline-none transition-transform active:scale-[0.99] motion-reduce:transform-none"
              >
                <ZendeGlass variant="ctaPill">
                  <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-zinc-950">
                    Save changes
                  </span>
                </ZendeGlass>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
