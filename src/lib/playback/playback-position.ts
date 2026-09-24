"use client";

import {
  syncPlaybackPositionStub,
  type PlaybackPositionSyncTarget,
} from "@/lib/playback/sync-playback-position";

const STORAGE_KEY = "zende.playback.position.v1";
const MAX_ENTRIES = 400;
const SAVE_INTERVAL_MS = 15_000;

/** Persist any scrub past this point. */
export const PLAYBACK_POSITION_MIN_SECONDS = 5;
/** Show continue / start-over once the viewer has watched at least this long. */
export const RESUME_PROMPT_MIN_SECONDS = 60;

type PositionEntry = {
  position: number;
  updatedAt: number;
};

type Store = Record<string, PositionEntry>;

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function getPlaybackPosition(url: string): number | null {
  const entry = readStore()[url];
  if (!entry || entry.position <= 0) return null;
  return entry.position;
}

/** Best saved position across local keys and an optional server resume value. */
export function resolvePlaybackPosition(
  keys: Array<string | null | undefined>,
  serverSeconds?: number | null,
): number | null {
  let best: number | null = null;
  if (
    serverSeconds != null &&
    Number.isFinite(serverSeconds) &&
    serverSeconds > 0
  ) {
    best = serverSeconds;
  }
  for (const key of keys) {
    if (!key) continue;
    const local = getPlaybackPosition(key);
    if (local != null && (best == null || local > best)) best = local;
  }
  return best;
}

export function shouldOfferResume(positionSeconds: number | null | undefined): boolean {
  return (
    positionSeconds != null &&
    Number.isFinite(positionSeconds) &&
    positionSeconds >= RESUME_PROMPT_MIN_SECONDS
  );
}

export function savePlaybackPosition(url: string, position: number) {
  if (!url || !Number.isFinite(position) || position < PLAYBACK_POSITION_MIN_SECONDS) return;
  const store = readStore();
  store[url] = { position, updatedAt: Date.now() };
  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (store[a]!.updatedAt) - (store[b]!.updatedAt))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete store[k]);
  }
  writeStore(store);
}

export function clearPlaybackPosition(url: string) {
  const store = readStore();
  if (!store[url]) return;
  delete store[url];
  writeStore(store);
}

export type PlaybackPositionSaver = ((position: number) => void) & {
  flush: (position: number) => void;
};

/** Call from watch UI — throttled position persistence with explicit exit/seek flushes. */
export function createPlaybackPositionSaver(
  target: PlaybackPositionSyncTarget & { positionKey?: string | null },
): PlaybackPositionSaver {
  let lastSave = 0;
  const persist = (position: number, force: boolean) => {
    if (!target.positionKey || (!target.url && !target.sessionId)) return;
    if (!Number.isFinite(position) || position < PLAYBACK_POSITION_MIN_SECONDS) return;
    const now = Date.now();
    if (!force && now - lastSave < SAVE_INTERVAL_MS) return;
    lastSave = now;
    savePlaybackPosition(target.positionKey, position);
    // Also mirror under the provider URL so movie/series pages can read progress.
    if (target.url && target.url !== target.positionKey) {
      savePlaybackPosition(target.url, position);
    }
    void syncPlaybackPositionStub(target, position, { keepalive: force });
  };
  const saver = ((position: number) => persist(position, false)) as PlaybackPositionSaver;
  saver.flush = (position: number) => persist(position, true);
  return saver;
}

/** Fraction watched (0–1) for continue UI — null if unknown. */
export function playbackProgressRatio(
  position: number | null,
  durationSeconds: number | undefined,
): number | null {
  if (position == null || !durationSeconds || durationSeconds <= 0) return null;
  const ratio = position / durationSeconds;
  if (ratio < 0.02 || ratio > 0.92) return null;
  return Math.min(1, ratio);
}
