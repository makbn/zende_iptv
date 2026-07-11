"use client";

import { syncPlaybackPositionStub } from "@/lib/playback/sync-playback-position";

const STORAGE_KEY = "zende.playback.position.v1";
const MAX_ENTRIES = 400;
const SAVE_INTERVAL_MS = 15_000;

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

export function savePlaybackPosition(url: string, position: number) {
  if (!url || !Number.isFinite(position) || position < 5) return;
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

/** Call from watch UI — throttled position persistence. */
export function createPlaybackPositionSaver(url: string | null) {
  let lastSave = 0;
  return (position: number) => {
    if (!url) return;
    const now = Date.now();
    if (now - lastSave < SAVE_INTERVAL_MS) return;
    lastSave = now;
    savePlaybackPosition(url, position);
    void syncPlaybackPositionStub(url, position);
  };
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
