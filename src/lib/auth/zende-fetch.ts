"use client";

import { Z_ACCESS, Z_REFRESH } from "@/lib/auth/token-storage-keys";

function getAccess(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(Z_ACCESS);
}

function getRefresh(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(Z_REFRESH);
}

export function setStoredTokens(access: string, refresh: string): void {
  localStorage.setItem(Z_ACCESS, access);
  localStorage.setItem(Z_REFRESH, refresh);
}

export function clearStoredTokens(): void {
  localStorage.removeItem(Z_ACCESS);
  localStorage.removeItem(Z_REFRESH);
}

/**
 * Adds Bearer access token and refreshes once on 401 when authentication is enabled.
 */
export async function zendeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const access = getAccess();
  if (access) headers.set("Authorization", `Bearer ${access}`);

  const res = await fetch(input, { ...init, headers });

  if (res.status !== 401) return res;

  const refresh = getRefresh();
  if (!refresh) return res;

  const r2 = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refresh }),
  });

  if (!r2.ok) {
    clearStoredTokens();
    return res;
  }

  const tokens = (await r2.json()) as {
    accessToken?: string;
    refreshToken?: string;
  };
  if (!tokens.accessToken || !tokens.refreshToken) {
    clearStoredTokens();
    return res;
  }

  setStoredTokens(tokens.accessToken, tokens.refreshToken);
  headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  return fetch(input, { ...init, headers });
}
