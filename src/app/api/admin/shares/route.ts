import { randomBytes } from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/gate-api";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const playbackSchema = z.object({
  contentKind: z.enum(["live", "movie", "episode"]).optional(),
  guideProviderId: z.string().max(128).optional(),
  guideTvgId: z.string().max(512).optional(),
  durationSeconds: z.number().positive().optional(),
  seriesId: z.string().max(128).optional(),
  seriesTitle: z.string().max(512).optional(),
  season: z.string().max(16).optional(),
  episodeNum: z.string().max(16).optional(),
  episodeTitle: z.string().max(512).optional(),
  episodeIndex: z.number().int().min(0).optional(),
  searchTitle: z.string().max(512).optional(),
  year: z.string().max(8).optional(),
  imdbId: z.string().max(32).optional(),
});

const itemSchema = z.object({
  id: z.string().min(1).max(160),
  title: z.string().min(1).max(512),
  subtitle: z.string().max(512).optional(),
  url: z.string().url().max(8192).refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Only http(s) streams can be shared."),
  playback: playbackSchema.optional(),
});

const bodySchema = z.object({
  kind: z.enum(["live", "movie", "episode", "series"]),
  title: z.string().trim().min(1).max(512),
  logo: z.string().max(8192).optional(),
  group: z.string().max(512).optional(),
  description: z.string().max(2000).optional(),
  items: z.array(itemSchema).min(1).max(2500),
  expiresAt: z.iso.datetime(),
}).superRefine((value, ctx) => {
  if (value.kind !== "series" && value.items.length !== 1) {
    ctx.addIssue({
      code: "custom",
      path: ["items"],
      message: "A single-media share must contain exactly one stream.",
    });
  }
});

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "The share details are invalid.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const expiresAt = new Date(parsed.data.expiresAt);
  const now = Date.now();
  if (expiresAt.getTime() <= now + 30_000) {
    return NextResponse.json(
      { error: "Expiry must be at least one minute from now." },
      { status: 400 },
    );
  }
  if (expiresAt.getTime() > now + 365 * 24 * 60 * 60 * 1000) {
    return NextResponse.json(
      { error: "Share links can expire at most one year from now." },
      { status: 400 },
    );
  }

  const { kind, title, logo, group, description, items } = parsed.data;
  const payload = { kind, title, logo, group, description, items };
  const token = randomBytes(24).toString("base64url");
  await prisma.mediaShare.create({
    data: {
      token,
      kind: payload.kind,
      title: payload.title,
      logo: payload.logo?.trim() || null,
      payloadJson: JSON.stringify(payload),
      createdByUserId: admin.user.id,
      expiresAt,
    },
  });

  return NextResponse.json(
    {
      token,
      path: `/share/${token}`,
      expiresAt: expiresAt.toISOString(),
    },
    { status: 201 },
  );
}
