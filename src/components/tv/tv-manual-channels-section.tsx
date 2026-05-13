"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Pencil, Trash2, X } from "lucide-react";

import { parseM3u } from "@/core/playlist/m3u-parse";
import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { useAuth } from "@/features/auth/auth-context";
import {
  canModifyManualChannelEntry,
  type ManualChannelsGate,
} from "@/lib/channels/manual-channels-policy";
import {
  isAllowedManualStreamUrl,
  listManualChannelEntries,
  removeManualChannelEntry,
  subscribeManualChannels,
  updateManualChannelEntry,
  upsertManualChannel,
  type ManualChannelEntry,
} from "@/lib/channels/manual-channels-store";
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
  const { authEnabled, user } = useAuth();
  const [epoch, setEpoch] = useState(0);
  useEffect(
    () => subscribeManualChannels(() => setEpoch((n) => n + 1)),
    [],
  );

  const entries = useMemo(
    () => listManualChannelEntries(),
    [epoch],
  );

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [logo, setLogo] = useState("");
  const [m3uPaste, setM3uPaste] = useState("");
  const [hint, setHint] = useState<string | null>(null);

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

  const onSaveEdit = useCallback(() => {
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
    updateManualChannelEntry(editing.id, ch);
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
    upsertManualChannel(ch);
    setHint(`Added “${ch.name}”.`);
    clearForm();
    window.setTimeout(() => setHint(null), 3200);
  }, [name, url, groupTitle, logo, clearForm]);

  const onImportM3u = useCallback(() => {
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
    let processed = 0;
    let skipped = 0;
    for (const ch of parsed) {
      if (!isAllowedManualStreamUrl(ch.url)) {
        skipped++;
        continue;
      }
      upsertManualChannel(ch);
      processed++;
    }
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
  }, [m3uPaste]);

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
        <button type="button" onClick={() => onAddOne()} className="outline-none">
          <ZenedeGlass variant="ctaPill">
            <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-zinc-950">
              Add channel
            </span>
          </ZenedeGlass>
        </button>
      </div>

      <div className="mt-8 border-t border-white/[0.08] pt-8">
        <h3 className="text-[15px] font-semibold text-white/90">
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
          className="mt-3 outline-none"
        >
          <ZenedeGlass variant="heroSecondary" className="inline-block">
            <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-white">
              Import pasted channels
            </span>
          </ZenedeGlass>
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

      {entries.length > 0 ? (
        <div className="mt-8">
          <h3 className="text-[15px] font-semibold text-white/90">
            Added channels ({entries.length})
          </h3>
          <ul className="mt-3 space-y-2" aria-label="Your added channels">
            {entries.map((e) => {
              const mod = canModifyEntry(e, authEnabled, user);
              return (
                <li
                  key={e.id}
                  className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3"
                >
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
                      {e.channel.description ? (
                        <span className="line-clamp-2 max-w-full text-white/45">
                          {e.channel.description}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {mod ? (
                      <button
                        type="button"
                        onClick={() => openEdit(e)}
                        className="rounded-lg p-2 text-white/55 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
                        aria-label={`Edit ${e.channel.name}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                    ) : null}
                    {mod ? (
                      <button
                        type="button"
                        onClick={() => removeManualChannelEntry(e.id)}
                        className="rounded-lg p-2 text-white/55 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
                        aria-label={`Remove ${e.channel.name}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : (
                      <span className="px-2 py-1 text-[11px] text-white/35">
                        Added by another user
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-8 text-[14px] text-white/38">
          No personal streams yet — add one above or import from M3U.
        </p>
      )}

      {editing ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-manual-channel-title"
        >
          <div
            className={cn(
              "max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/[0.12] bg-[var(--tv-page-bg)] p-6 shadow-2xl",
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
                className="rounded-lg p-2 text-white/55 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
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
                className="rounded-xl px-4 py-2.5 text-[15px] font-medium text-white/70 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
              >
                Cancel
              </button>
              <button type="button" onClick={onSaveEdit} className="outline-none">
                <ZenedeGlass variant="ctaPill">
                  <span className="flex items-center px-5 py-2.5 text-[15px] font-semibold text-zinc-950">
                    Save changes
                  </span>
                </ZenedeGlass>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
