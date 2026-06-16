import type { M3uChannel } from "@/core/playlist/m3u-parse";
import { resolveLibraryContentType } from "@/lib/channels/content-type";

/** Owner id for manual rows when authentication is disabled (shared open mode). */
export const MANUAL_CHANNEL_GUEST_OWNER = "__guest__" as const;

export type ManualChannelsGate =
  | { authEnabled: false }
  | { authEnabled: true; user: { id: string; role: "ADMIN" | "USER" } };

export type StoredManualChannelEntry = {
  id: string;
  channel: M3uChannel;
  addedAt: number;
  /** Who created/imported this row; missing = legacy data (admin-only edits). */
  addedByUserId?: string;
};

export function effectiveOwnerForNewManualEntry(gate: ManualChannelsGate): string {
  if (!gate.authEnabled) return MANUAL_CHANNEL_GUEST_OWNER;
  return gate.user.id;
}

export function canModifyManualChannelEntry(
  entry: StoredManualChannelEntry,
  gate: ManualChannelsGate,
): boolean {
  if (!gate.authEnabled) return true;
  if (gate.user.role === "ADMIN") return true;
  const owner = entry.addedByUserId;
  if (!owner) return false;
  return owner === gate.user.id;
}

function trimOpt(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

/** Normalize channel fields for persistence and equality checks. */
export function normalizeManualChannel(channel: M3uChannel): M3uChannel {
  const duration = Number.isFinite(channel.duration) ? channel.duration : -1;
  const base: M3uChannel = {
    name: channel.name.trim(),
    url: channel.url.trim(),
    duration,
  };
  const tvgId = trimOpt(channel.tvgId);
  const tvgLogo = trimOpt(channel.tvgLogo);
  const tvgLanguage = trimOpt(channel.tvgLanguage);
  const groupTitle = trimOpt(channel.groupTitle);
  const description = trimOpt(channel.description);
  const withMeta: M3uChannel = {
    ...base,
    ...(tvgId ? { tvgId } : {}),
    ...(tvgLogo ? { tvgLogo } : {}),
    ...(tvgLanguage ? { tvgLanguage } : {}),
    ...(groupTitle ? { groupTitle } : {}),
    ...(description ? { description } : {}),
    ...(channel.contentType === "live" ||
    channel.contentType === "movie" ||
    channel.contentType === "series"
      ? { contentType: channel.contentType }
      : {}),
  };
  return {
    ...withMeta,
    contentType: resolveLibraryContentType(withMeta),
  };
}

export function manualChannelsEqual(a: M3uChannel, b: M3uChannel): boolean {
  return JSON.stringify(normalizeManualChannel(a)) === JSON.stringify(normalizeManualChannel(b));
}

/** Lenient parse for DB JSON (legacy rows may omit fields or use older shapes). */
export function parseManualEntriesLoose(raw: unknown): StoredManualChannelEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredManualChannelEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : null;
    if (!id) continue;
    const addedAt =
      typeof rec.addedAt === "number" && Number.isFinite(rec.addedAt)
        ? rec.addedAt
        : Date.now();
    const addedByUserId =
      typeof rec.addedByUserId === "string" && rec.addedByUserId.trim()
        ? rec.addedByUserId.trim()
        : undefined;
    const chRaw = rec.channel;
    if (!chRaw || typeof chRaw !== "object") continue;
    const c = chRaw as Record<string, unknown>;
    const name = typeof c.name === "string" ? c.name.trim() : "";
    const url = typeof c.url === "string" ? c.url.trim() : "";
    if (!name || !url) continue;
    const durationRaw = c.duration;
    const duration =
      typeof durationRaw === "number" && Number.isFinite(durationRaw)
        ? durationRaw
        : -1;
    const channel: M3uChannel = normalizeManualChannel({
      name,
      url,
      duration,
      ...(typeof c.tvgId === "string" ? { tvgId: c.tvgId } : {}),
      ...(typeof c.tvgLogo === "string" ? { tvgLogo: c.tvgLogo } : {}),
      ...(typeof c.tvgLanguage === "string" ? { tvgLanguage: c.tvgLanguage } : {}),
      ...(typeof c.groupTitle === "string" ? { groupTitle: c.groupTitle } : {}),
      ...(typeof c.description === "string" ? { description: c.description } : {}),
      ...(c.contentType === "live" || c.contentType === "movie" || c.contentType === "series"
        ? { contentType: c.contentType }
        : {}),
    });
    out.push({
      id,
      channel,
      addedAt,
      ...(addedByUserId ? { addedByUserId } : {}),
    });
  }
  return out;
}
