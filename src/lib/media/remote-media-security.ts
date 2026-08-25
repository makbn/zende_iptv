import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPublicIpv4(address: string): boolean {
  const p = address.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b, c] = p as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export function isPublicMediaAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family !== 6) return false;
  const lower = address.toLowerCase();
  const mapped = /(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)?.[1];
  if (mapped) return isPublicIpv4(mapped);
  if (lower === "::" || lower === "::1") return false;
  if (/^(?:fc|fd)/.test(lower)) return false;
  if (/^fe[89ab]/.test(lower)) return false;
  if (/^2001:db8:/.test(lower)) return false;
  return true;
}

/** Validate every resolved address before the backend opens an external media connection. */
export async function validateRemoteMediaUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP(S) media URLs are supported.");
  }
  if (url.username || url.password) {
    throw new Error("Credentials are not allowed in media relay URLs.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !hostname ||
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Private media hosts are not allowed.");
  }

  if (isIP(hostname)) {
    if (!isPublicMediaAddress(hostname)) throw new Error("Private media addresses are not allowed.");
    return url;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((row) => !isPublicMediaAddress(row.address))) {
    throw new Error("Media host resolved to a private address.");
  }
  return url;
}

