import { NextResponse } from "next/server";
import http from "node:http";
import https from "node:https";
import { z } from "zod";

import { parseM3u, type M3uChannel } from "@/core/playlist/m3u-parse";
import { withApiLogging } from "@/core/logging/api-log";
import { gateApiRequest } from "@/lib/auth/gate-api";
import type { ManualChannelsGate } from "@/lib/channels/manual-channels-policy";
import { persistManualChannelsBatch } from "@/lib/channels/persist-manual-channels";
import {
  fetchXtreamCategories,
  fetchXtreamStreams,
  xtreamCredentialsFromHostFields,
} from "@/lib/iptv/xtream-client";
import { saveXtreamPortalCredentials } from "@/lib/iptv/xtream-portal-store";
import type { XtreamCredentials } from "@/lib/iptv/xtream-types";
import type {
  XtreamLiveStream,
  XtreamSeriesItem,
  XtreamVodStream,
} from "@/lib/iptv/xtream-types";
import {
  buildXtreamLiveUrl,
  buildXtreamMovieUrl,
  buildXtreamSeriesContainerUrl,
} from "@/lib/iptv/xtream-url";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    url: z.string().url().optional(),
    xtream: z
      .object({
        host: z.string().min(1),
        username: z.string().min(1),
        password: z.string().min(1),
      })
      .optional(),
    /** When true (default), persist all parsed channels on the server — nothing is sent to the browser. */
    persist: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.url) || Boolean(v.xtream), {
    message: "Provide either url or xtream credentials.",
  });

function fetchPlaylistTextLenient(urlRaw: string): Promise<{ statusCode: number; text: string }> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(urlRaw);
    } catch {
      reject(new Error("Invalid URL"));
      return;
    }
    const client = parsed.protocol === "https:" ? https : http;
    const req = client.request(
      parsed,
      {
        method: "GET",
        headers: {
          "User-Agent": "Zende/0.1 (playlist import)",
          Accept: "audio/x-mpegurl, application/vnd.apple.mpegurl, text/plain, */*",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          resolve({
            statusCode: typeof res.statusCode === "number" ? res.statusCode : 0,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(120_000, () => {
      req.destroy(new Error("Timeout fetching playlist URL"));
    });
    req.end();
  });
}

type XtreamCreds = XtreamCredentials & { protocol: "http:" | "https:"; host: string };

function xtreamCredsFromFields(input: {
  host: string;
  username: string;
  password: string;
}): XtreamCreds | null {
  const creds = xtreamCredentialsFromHostFields(input);
  if (!creds) return null;
  const u = new URL(creds.serverUrl);
  return {
    ...creds,
    protocol: u.protocol === "https:" ? "https:" : "http:",
    host: u.host,
  };
}

function extractXtreamCredsFromPlaylistUrl(urlRaw: string): XtreamCreds | null {
  try {
    const u = new URL(urlRaw);
    const username = u.searchParams.get("username")?.trim() ?? "";
    const password = u.searchParams.get("password")?.trim() ?? "";
    if (!username || !password) return null;
    if (!u.hostname) return null;
    const protocol = u.protocol === "https:" ? "https:" : "http:";
    const serverUrl = `${protocol}//${u.host}`;
    return { serverUrl, protocol, host: u.host, username, password };
  } catch {
    return null;
  }
}

function safeName(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s || fallback;
}

async function buildChannelsFromXtreamApi(creds: XtreamCreds): Promise<M3uChannel[]> {
  const portal: XtreamCredentials = {
    serverUrl: creds.serverUrl,
    username: creds.username,
    password: creds.password,
  };

  const [liveCats, vodCats, seriesCats, liveRows, vodRows, seriesRows] = await Promise.all([
    fetchXtreamCategories(portal, "live"),
    fetchXtreamCategories(portal, "vod"),
    fetchXtreamCategories(portal, "series"),
    fetchXtreamStreams(portal, "live") as Promise<XtreamLiveStream[]>,
    fetchXtreamStreams(portal, "movie") as Promise<XtreamVodStream[]>,
    fetchXtreamStreams(portal, "series") as Promise<XtreamSeriesItem[]>,
  ]);

  const liveCatMap = new Map<string, string>();
  for (const c of liveCats) {
    const id = c.category_id.trim();
    if (!id) continue;
    liveCatMap.set(id, safeName(c.category_name, "Live"));
  }
  const vodCatMap = new Map<string, string>();
  for (const c of vodCats) {
    const id = c.category_id.trim();
    if (!id) continue;
    vodCatMap.set(id, safeName(c.category_name, "Movies"));
  }
  const seriesCatMap = new Map<string, string>();
  for (const c of seriesCats) {
    const id = c.category_id.trim();
    if (!id) continue;
    seriesCatMap.set(id, safeName(c.category_name, "Shows"));
  }

  const out: M3uChannel[] = [];

  for (const row of liveRows) {
    const streamId = `${row.stream_id ?? ""}`.trim();
    if (!streamId) continue;
    const categoryId = `${row.category_id ?? ""}`.trim();
    out.push({
      name: safeName(row.name, `Live ${streamId}`),
      url: buildXtreamLiveUrl(portal, streamId, "m3u8"),
      duration: -1,
      contentType: "live",
      ...(row.stream_icon ? { tvgLogo: row.stream_icon } : {}),
      ...(row.epg_channel_id ? { tvgId: row.epg_channel_id } : {}),
      ...(categoryId ? { groupTitle: liveCatMap.get(categoryId) ?? "Live" } : {}),
    });
  }

  for (const row of vodRows) {
    const streamId = `${row.stream_id ?? ""}`.trim();
    if (!streamId) continue;
    const categoryId = `${row.category_id ?? ""}`.trim();
    const ext =
      typeof row.container_extension === "string" && row.container_extension.trim()
        ? row.container_extension.trim()
        : "mp4";
    out.push({
      name: safeName(row.name, `Movie ${streamId}`),
      url: buildXtreamMovieUrl(portal, streamId, ext),
      duration: -1,
      contentType: "movie",
      ...(row.stream_icon ? { tvgLogo: row.stream_icon } : {}),
      ...(categoryId ? { groupTitle: vodCatMap.get(categoryId) ?? "Movies" } : {}),
    });
  }

  for (const row of seriesRows) {
    const seriesId = `${row.series_id ?? ""}`.trim();
    if (!seriesId) continue;
    const categoryId = `${row.category_id ?? ""}`.trim();
    out.push({
      name: safeName(row.name, `Series ${seriesId}`),
      // IPTVnator: series rows are containers — episodes come from get_series_info.
      url: buildXtreamSeriesContainerUrl(seriesId),
      duration: -1,
      contentType: "series",
      tvgId: `xtream-series:${seriesId}`,
      ...(row.cover ? { tvgLogo: row.cover } : {}),
      ...(categoryId ? { groupTitle: seriesCatMap.get(categoryId) ?? "Shows" } : {}),
    });
  }

  return out;
}

async function resolveImportChannels(parsedBody: z.infer<typeof bodySchema>): Promise<{
  channels: M3uChannel[];
  statusCode: number;
}> {
  let statusCode = 0;
  const creds =
    parsedBody.xtream
      ? xtreamCredsFromFields(parsedBody.xtream)
      : parsedBody.url
        ? extractXtreamCredsFromPlaylistUrl(parsedBody.url)
        : null;
  let channels: M3uChannel[] = [];

  if (creds) {
    channels = await buildChannelsFromXtreamApi(creds);
    await saveXtreamPortalCredentials({
      serverUrl: creds.serverUrl,
      username: creds.username,
      password: creds.password,
    });
  }

  if (channels.length === 0 && parsedBody.url) {
    let text = "";
    try {
      const upstream = await fetch(parsedBody.url, {
        headers: {
          "User-Agent": "Zende/0.1 (playlist import)",
          Accept: "audio/x-mpegurl, application/vnd.apple.mpegurl, text/plain, */*",
        },
      });
      statusCode = upstream.status;
      text = await upstream.text();
    } catch {
      const fallback = await fetchPlaylistTextLenient(parsedBody.url);
      statusCode = fallback.statusCode;
      text = fallback.text;
    }
    channels = parseM3u(text);
  }

  return { channels, statusCode };
}

/** Fetch a playlist / Xtream account server-side and persist every channel (no browser cap). */
export async function POST(request: Request) {
  return withApiLogging("api.playlists.import", request, async (log) => {
    const gate = await gateApiRequest(request);
    if ("response" in gate) return gate.response;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      log.warn("invalid json body");
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsedBody = bodySchema.safeParse(payload);
    if (!parsedBody.success) {
      log.warn("invalid import payload");
      return NextResponse.json({ error: "Invalid import payload" }, { status: 400 });
    }

    const shouldPersist = parsedBody.data.persist !== false;
    const g: ManualChannelsGate = gate.authEnabled
      ? { authEnabled: true, user: gate.user }
      : { authEnabled: false };

    const source = parsedBody.data.xtream ? "xtream" : "url";
    log.info("import start", { source, persist: shouldPersist });

    try {
      const started = Date.now();
      const { channels, statusCode } = await resolveImportChannels(parsedBody.data);

      const live = channels.filter((c) => c.contentType === "live").length;
      const movie = channels.filter((c) => c.contentType === "movie").length;
      const series = channels.filter((c) => c.contentType === "series").length;
      log.info("import parsed", {
        total: channels.length,
        live,
        movie,
        series,
        upstreamStatus: statusCode || undefined,
        elapsedMs: Date.now() - started,
      });

      if (channels.length === 0) {
        log.error("import produced zero channels", { upstreamStatus: statusCode });
        return NextResponse.json(
          {
            error:
              statusCode && statusCode !== 200
                ? `Upstream returned ${statusCode} and no channels were parsed.`
                : "No channels found in this playlist URL.",
          },
          { status: statusCode === 200 ? 422 : 502 },
        );
      }

      if (!shouldPersist) {
        return NextResponse.json({
          channels,
          count: channels.length,
          importedCount: channels.length,
          truncated: false,
        });
      }

      const { processed, skipped, total } = await persistManualChannelsBatch(channels, g);
      log.info("import persisted", {
        parsed: channels.length,
        processed,
        skipped,
        storeTotal: total,
        elapsedMs: Date.now() - started,
      });

      if (skipped > 0) {
        log.warn("import skipped rows", { skipped, parsed: channels.length });
      }

      return NextResponse.json({
        ok: true,
        persisted: true,
        count: channels.length,
        processed,
        skipped,
        storeTotal: total,
        truncated: false,
      });
    } catch (err) {
      log.error("import failed", {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      return NextResponse.json({ error: "Could not import playlist." }, { status: 502 });
    }
  });
}
