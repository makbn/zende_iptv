"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Trash2 } from "lucide-react";

import { parseM3u } from "@/core/playlist/m3u-parse";
import {
  isAllowedManualStreamUrl,
  listManualChannelEntries,
  removeManualChannelEntry,
  subscribeManualChannels,
  upsertManualChannel,
} from "@/lib/channels/manual-channels-store";
import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { cn } from "@/lib/utils";

function buildChannel(input: {
  name: string;
  url: string;
  groupTitle?: string;
  tvgLogo?: string;
}) {
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
  };
}

export function TvManualChannelsSection() {
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
        Home, Library, search, and Watch. Stored only on this device.
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
            className={cn(
              "mt-1.5 h-11 w-full rounded-xl border border-white/[0.12] bg-black/30 px-4",
              "text-[15px] text-white placeholder:text-white/35",
              "outline-none ring-offset-[var(--tv-page-bg)] focus-visible:ring-2 focus-visible:ring-white",
            )}
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
            className={cn(
              "mt-1.5 h-11 w-full rounded-xl border border-white/[0.12] bg-black/30 px-4",
              "text-[15px] text-white placeholder:text-white/35",
              "outline-none ring-offset-[var(--tv-page-bg)] focus-visible:ring-2 focus-visible:ring-white",
            )}
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
            className={cn(
              "mt-1.5 h-11 w-full rounded-xl border border-white/[0.12] bg-black/30 px-4",
              "text-[15px] text-white placeholder:text-white/35",
              "outline-none ring-offset-[var(--tv-page-bg)] focus-visible:ring-2 focus-visible:ring-white",
            )}
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
            className={cn(
              "mt-1.5 h-11 w-full rounded-xl border border-white/[0.12] bg-black/30 px-4",
              "text-[15px] text-white placeholder:text-white/35",
              "outline-none ring-offset-[var(--tv-page-bg)] focus-visible:ring-2 focus-visible:ring-white",
            )}
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
            hint.startsWith("Added") || hint.startsWith("Imported")
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
            {entries.map((e) => (
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
                  {e.channel.groupTitle ? (
                    <p className="mt-1 text-[12px] text-white/38">
                      {e.channel.groupTitle}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => removeManualChannelEntry(e.id)}
                  className="shrink-0 rounded-lg p-2 text-white/55 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
                  aria-label={`Remove ${e.channel.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-8 text-[14px] text-white/38">
          No personal streams yet — add one above or import from M3U.
        </p>
      )}
    </section>
  );
}
