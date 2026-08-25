import "server-only";

import { compare, hash } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import type { NextResponse } from "next/server";

import { getJwtSecretBytes } from "@/lib/auth/jwt-secret";
import { prisma } from "@/lib/db/prisma";

const ROW_ID = 1;
export const PARENTAL_UNLOCK_COOKIE = "zende_parental_unlock";

export type ParentalPolicy = {
  enabled: boolean;
  hiddenPatterns: string[];
  hasPin: boolean;
  version: string;
};

type ParentalChannelLike = {
  name?: string | null;
  groupTitle?: string | null;
};

const BUILT_IN_ADULT_PHRASES = [
  "adul"+"t",
  "adu"+"lts",
  "po"+"rn",
  "po"+"rno",
  "por"+"nog"+"raphy",
  "xx",
  "xxx",
  "ero"+"tic",
  "ero"+"tica",
  "play"+"boy",
  "hust"+"ler",
  "braz"+"zers",
  "red "+"light",
  "red"+"light",
  "x "+"rated",
  "se"+"x",
  "se"+"xy",
  "har"+"dcore",
  "nu"+"de",
  "nu"+"des",
  "nau"+"ghty",
  "pent"+"house",
  "private tv",
  "babe"+"station",
  "onl"+"yfans",
  "18"+" plus",
  "21 "+"plus",
];

type StoredParentalPolicy = ParentalPolicy & { pinHash: string | null };

type AuthenticatedGate =
  | { authEnabled: false }
  | { authEnabled: true; user: { id: string; role: "ADMIN" | "USER" } };

export function normalizeParentalPatterns(patterns: string[]): string[] {
  return [
    ...new Set(
      patterns
        .map((pattern) => pattern.normalize("NFKC").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function parsePatternsJson(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeParentalPatterns(
      parsed.filter((item): item is string => typeof item === "string"),
    );
  } catch {
    return [];
  }
}

export async function loadParentalPolicy(): Promise<StoredParentalPolicy> {
  const row = await prisma.parentalControlSettings.upsert({
    where: { id: ROW_ID },
    create: { id: ROW_ID },
    update: {},
    select: {
      enabled: true,
      patternsJson: true,
      pinHash: true,
      updatedAt: true,
    },
  });

  const hiddenPatterns = parsePatternsJson(row.patternsJson);
  return {
    enabled: row.enabled,
    hiddenPatterns,
    hasPin: Boolean(row.pinHash),
    pinHash: row.pinHash,
    version: row.updatedAt.getTime().toString(36),
  };
}

export async function saveParentalPolicy(input: {
  enabled: boolean;
  hiddenPatterns: string[];
  pin?: string | null;
}): Promise<ParentalPolicy> {
  const hiddenPatterns = normalizeParentalPatterns(input.hiddenPatterns);
  const data: {
    enabled: boolean;
    patternsJson: string;
    pinHash?: string | null;
  } = {
    enabled: input.enabled,
    patternsJson: JSON.stringify(hiddenPatterns),
  };

  if (input.pin !== undefined) {
    const pin = input.pin?.trim() ?? "";
    data.pinHash = pin ? await hash(pin, 12) : null;
  }

  await prisma.parentalControlSettings.upsert({
    where: { id: ROW_ID },
    create: { id: ROW_ID, ...data },
    update: data,
  });
  const saved = await loadParentalPolicy();
  return publicParentalPolicy(saved);
}

export function publicParentalPolicy(policy: StoredParentalPolicy): ParentalPolicy {
  return {
    enabled: policy.enabled,
    hiddenPatterns: policy.hiddenPatterns,
    hasPin: policy.hasPin,
    version: policy.version,
  };
}

export function isParentalPolicyActive(policy: ParentalPolicy): boolean {
  return policy.enabled && policy.hiddenPatterns.length > 0;
}

export function isChannelParentalBlocked(
  channel: ParentalChannelLike,
  hiddenPatterns: string[],
): boolean {
  if (hiddenPatterns.length === 0) return false;
  const haystack = `${channel.name ?? ""}\n${channel.groupTitle ?? ""}`
    .normalize("NFKC")
    .toLowerCase();
  return (
    hiddenPatterns.some((pattern) => haystack.includes(pattern)) ||
    isAdultContentChannel(channel)
  );
}

/** Conservative built-in safety net used whenever the global parental filter is active. */
export function isAdultContentChannel(channel: ParentalChannelLike): boolean {
  const words = `${channel.name ?? ""}\n${channel.groupTitle ?? ""}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!words) return false;

  const padded = ` ${words} `;
  if (BUILT_IN_ADULT_PHRASES.some((phrase) => padded.includes(` ${phrase} `))) {
    return true;
  }
  return /(?:^|\s)(?:18\+|\+18|21\+|\+21)(?:\s|$)/.test(words);
}

export function filterParentalChannels<T extends ParentalChannelLike>(
  channels: T[],
  hiddenPatterns: string[],
): T[] {
  if (hiddenPatterns.length === 0) return channels;
  return channels.filter(
    (channel) => !isChannelParentalBlocked(channel, hiddenPatterns),
  );
}

function cookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function subjectForGate(gate: AuthenticatedGate): string {
  return gate.authEnabled ? gate.user.id : "__guest__";
}

async function hasValidUnlockCookie(
  request: Request,
  subject: string,
  policyVersion: string,
): Promise<boolean> {
  const token = cookieValue(request, PARENTAL_UNLOCK_COOKIE);
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getJwtSecretBytes(), {
      algorithms: ["HS256"],
    });
    return (
      payload.typ === "parental-unlock" &&
      payload.sub === subject &&
      payload.policyVersion === policyVersion
    );
  } catch {
    return false;
  }
}

export async function resolveParentalAccess(
  request: Request,
  gate: AuthenticatedGate,
): Promise<{
  policy: ParentalPolicy;
  unlocked: boolean;
  blockedPatterns: string[];
  subject: string;
}> {
  const stored = await loadParentalPolicy();
  const policy = publicParentalPolicy(stored);
  const subject = subjectForGate(gate);
  const active = isParentalPolicyActive(policy);
  const unlocked =
    !active || (await hasValidUnlockCookie(request, subject, policy.version));
  return {
    policy,
    unlocked,
    blockedPatterns: unlocked ? [] : policy.hiddenPatterns,
    subject,
  };
}

export async function verifyParentalPin(pin: string): Promise<boolean> {
  const policy = await loadParentalPolicy();
  if (!policy.pinHash) return true;
  return compare(pin.trim(), policy.pinHash);
}

export async function issueParentalUnlockCookie(
  response: NextResponse,
  input: { subject: string; policyVersion: string },
): Promise<void> {
  const token = await new SignJWT({
    typ: "parental-unlock",
    policyVersion: input.policyVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.subject)
    .setIssuedAt()
    .sign(getJwtSecretBytes());

  response.cookies.set(PARENTAL_UNLOCK_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export function clearParentalUnlockCookie(response: NextResponse): void {
  response.cookies.set(PARENTAL_UNLOCK_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
