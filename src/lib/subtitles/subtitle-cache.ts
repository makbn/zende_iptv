import "server-only";

import { randomBytes } from "node:crypto";

import { subtitleTextToVtt } from "@/lib/subtitles/srt-to-vtt";

type CachedSubtitle = {
  vtt: string;
  label: string;
  language: string;
  expiresAt: number;
};

const CACHE = new Map<string, CachedSubtitle>();
const TTL_MS = 6 * 60 * 60 * 1000;

function pruneCache() {
  const now = Date.now();
  for (const [key, value] of CACHE) {
    if (value.expiresAt <= now) CACHE.delete(key);
  }
}

export function storeSubtitleVtt(input: {
  label: string;
  language: string;
  text: string;
  fileName?: string;
}): string {
  pruneCache();
  const id = randomBytes(12).toString("hex");
  const vtt = subtitleTextToVtt(input.text, input.fileName);
  CACHE.set(id, {
    vtt,
    label: input.label,
    language: input.language,
    expiresAt: Date.now() + TTL_MS,
  });
  return id;
}

export function readSubtitleVtt(id: string): CachedSubtitle | null {
  pruneCache();
  const hit = CACHE.get(id);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    CACHE.delete(id);
    return null;
  }
  return hit;
}
