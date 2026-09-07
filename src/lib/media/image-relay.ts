import "server-only";

import { NextResponse } from "next/server";

import { createServerLogger } from "@/core/logging/server";
import {
  loadCachedImage,
  readCachedImage,
  type CachedImage,
  type ImageCacheKind,
} from "@/lib/media/image-cache";
import { validateRemoteMediaUrl } from "@/lib/media/remote-media-security";

const MAX_REDIRECTS = 5;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const REMOTE_FETCH_ATTEMPTS = 2;
const log = createServerLogger("lib.media.image-relay");

function decodePayload(encoded: string): { kind: ImageCacheKind; url: string } | null {
  if (!encoded || encoded.length > 12_000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const separator = decoded.indexOf("\0");
    if (separator < 1) return null;
    const kind = decoded.slice(0, separator);
    const url = decoded.slice(separator + 1).trim();
    if (kind !== "logo" && kind !== "poster" && kind !== "thumbnail") return null;
    if (!url || url.length > 8192) return null;
    return { kind, url };
  } catch {
    return null;
  }
}

function sniffImageType(body: Uint8Array): string | null {
  if (body.length >= 8 && body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47) return "image/png";
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "image/jpeg";
  const head = new TextDecoder().decode(body.subarray(0, Math.min(body.length, 512))).trimStart();
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) return "image/gif";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "image/webp";
  if (/^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) throw new Error("Remote image is too large.");
  if (!response.body) throw new Error("Remote image had no body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel("image relay limit exceeded");
        throw new Error("Remote image is too large.");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function loadRemoteImage(rawUrl: string): Promise<Omit<CachedImage, "expiresAt">> {
  let current = await validateRemoteMediaUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response | null = null;
    let lastError: unknown;
    for (let attempt = 1; attempt <= REMOTE_FETCH_ATTEMPTS; attempt++) {
      try {
        const candidate = await fetch(current, {
          redirect: "manual",
          cache: "no-store",
          headers: {
            Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "User-Agent": "Zende/0.1 (same-origin media relay)",
          },
          signal: AbortSignal.timeout(15_000),
        });
        if (candidate.status < 500 && candidate.status !== 429) {
          response = candidate;
          break;
        }
        lastError = new Error(`Remote image returned ${candidate.status}.`);
        candidate.body?.cancel().catch(() => {});
      } catch (error) {
        lastError = error;
      }
      if (attempt < REMOTE_FETCH_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
      }
    }
    if (!response) {
      throw lastError instanceof Error ? lastError : new Error("Remote image fetch failed.");
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      response.body?.cancel().catch(() => {});
      if (!location || hop === MAX_REDIRECTS) throw new Error("Remote image redirect failed.");
      current = await validateRemoteMediaUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok) throw new Error(`Remote image returned ${response.status}.`);
    const body = await readBoundedBody(response);
    const headerType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    const contentType = headerType?.startsWith("image/") ? headerType : sniffImageType(body);
    if (!contentType) throw new Error("Remote response was not an image.");
    return { body, contentType };
  }
  throw new Error("Too many remote image redirects.");
}

/** Download an image into the same persistent cache used by the browser relay. */
export async function primeRemoteImageCache(
  kind: ImageCacheKind,
  rawUrl?: string | null,
): Promise<void> {
  const url = rawUrl?.trim();
  if (!url || readCachedImage(kind, url)) return;
  try {
    await loadCachedImage(kind, url, () => loadRemoteImage(url));
  } catch (error) {
    let remoteHost = "invalid";
    try {
      remoteHost = new URL(url).hostname;
    } catch {
      /* keep invalid */
    }
    log.warn("image cache prewarm failed", {
      kind,
      remoteHost,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function imageResponse(image: CachedImage, cacheState: "HIT" | "MISS" | "COALESCED", kind: ImageCacheKind): NextResponse {
  const body = image.body.buffer.slice(image.body.byteOffset, image.body.byteOffset + image.body.byteLength) as ArrayBuffer;
  const browserMaxAge = kind === "thumbnail" ? 6 * 60 * 60 : 24 * 60 * 60;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.body.byteLength),
      "Cache-Control": `public, max-age=${browserMaxAge}, stale-while-revalidate=604800`,
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
      "X-Zende-Media-Cache": cacheState,
      "X-Zende-Media-Kind": kind,
    },
  });
}

export async function relayImageFromEncodedPath(encoded: string): Promise<Response> {
  const payload = decodePayload(encoded);
  if (!payload) {
    return NextResponse.json(
      { error: "A valid encoded media URL is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const hit = readCachedImage(payload.kind, payload.url);
  if (hit) return imageResponse(hit, "HIT", payload.kind);
  try {
    const loaded = await loadCachedImage(payload.kind, payload.url, () => loadRemoteImage(payload.url));
    return imageResponse(loaded.image, loaded.state, payload.kind);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const badRequest = /not allowed|Only HTTP|Invalid URL|valid URL|private media/i.test(message);
    let remoteHost = "invalid";
    try {
      remoteHost = new URL(payload.url).hostname;
    } catch {
      /* keep invalid */
    }
    log.warn("image relay failed", { kind: payload.kind, remoteHost, badRequest, message });
    return NextResponse.json(
      { error: badRequest ? "Media URL is not allowed." : "Remote image could not be loaded." },
      { status: badRequest ? 400 : 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
