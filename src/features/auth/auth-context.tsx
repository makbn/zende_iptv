"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  clearStoredTokens,
  setStoredTokens,
} from "@/lib/auth/zende-fetch";
import { Z_ACCESS, Z_REFRESH } from "@/lib/auth/token-storage-keys";
import { ZenedeLogoWave } from "@/components/loading/zenede-logo-wave";

export type AuthUser = {
  id: string;
  username: string;
  role: "ADMIN" | "USER";
  isBootstrapAdmin: boolean;
};

type AuthContextValue = {
  ready: boolean;
  authEnabled: boolean;
  user: AuthUser | null;
  userCount: number;
  canBootstrap: boolean;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: (username: string, password: string) => Promise<void>;
};

const Ctx = createContext<AuthContextValue | null>(null);

/** Empty bodies and non-JSON error pages must not throw (e.g. proxy / dev hiccups). */
async function safeParseJson<T>(res: Response): Promise<T | undefined> {
  const text = await res.text();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userCount, setUserCount] = useState(0);
  const [canBootstrap, setCanBootstrap] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const access =
        typeof window !== "undefined" ? localStorage.getItem(Z_ACCESS) : null;
      const refreshTok =
        typeof window !== "undefined" ? localStorage.getItem(Z_REFRESH) : null;

      const meHeaders: HeadersInit = {};
      if (access) meHeaders.Authorization = `Bearer ${access}`;

      const [statusRes, meRes] = await Promise.all([
        fetch("/api/auth/status"),
        fetch("/api/auth/me", { headers: meHeaders }),
      ]);

      const status = await safeParseJson<{
        authEnabled?: boolean;
        userCount?: number;
        canBootstrap?: boolean;
      }>(statusRes);
      const authEnabledFromStatus = Boolean(status?.authEnabled);
      setAuthEnabled(authEnabledFromStatus);
      const uc =
        typeof status?.userCount === "number" ? status.userCount : 0;
      setUserCount(uc);
      setCanBootstrap(
        typeof status?.canBootstrap === "boolean"
          ? status.canBootstrap
          : uc === 0,
      );

      let parsed = await safeParseJson<{
        authEnabled?: boolean;
        user?: AuthUser | null;
      }>(meRes);
      let data: { user: AuthUser | null } = {
        user: parsed?.user ?? null,
      };

      if (authEnabledFromStatus && !data.user && refreshTok) {
        const r2 = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: refreshTok }),
        });
        if (r2.ok) {
          const t = await safeParseJson<{
            accessToken?: string;
            refreshToken?: string;
          }>(r2);
          if (t?.accessToken && t?.refreshToken) {
            setStoredTokens(t.accessToken, t.refreshToken);
            const res3 = await fetch("/api/auth/me", {
              headers: { Authorization: `Bearer ${t.accessToken}` },
            });
            parsed = await safeParseJson<{
              authEnabled?: boolean;
              user?: AuthUser | null;
            }>(res3);
            data = {
              user: parsed?.user ?? null,
            };
          }
        }
      }

      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data?.error === "string" ? data.error : "Login failed.",
      );
    }
    if (data.accessToken && data.refreshToken) {
      setStoredTokens(data.accessToken, data.refreshToken);
    }
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    const access = localStorage.getItem(Z_ACCESS);
    if (access) headers.Authorization = `Bearer ${access}`;
    await fetch("/api/auth/logout", {
      method: "POST",
      headers,
      body: JSON.stringify({
        refreshToken: localStorage.getItem(Z_REFRESH) ?? undefined,
      }),
    }).catch(() => {});
    clearStoredTokens();
    setUser(null);
    await refresh();
  }, [refresh]);

  const bootstrap = useCallback(
    async (username: string, password: string) => {
      const res = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Could not create administrator.",
        );
      }
      if (data.accessToken && data.refreshToken) {
        setStoredTokens(data.accessToken, data.refreshToken);
      }
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({
      ready,
      authEnabled,
      user,
      userCount,
      canBootstrap,
      refresh,
      login,
      logout,
      bootstrap,
    }),
    [
      ready,
      authEnabled,
      user,
      userCount,
      canBootstrap,
      refresh,
      login,
      logout,
      bootstrap,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth requires AuthProvider");
  return v;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, authEnabled, user } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!authEnabled) return;
    if (!user) return;
    if (pathname !== "/login") return;
    const next = searchParams.get("next");
    router.replace(next && next.startsWith("/") ? next : "/");
  }, [ready, authEnabled, user, pathname, router, searchParams]);

  useEffect(() => {
    if (!ready) return;
    if (!authEnabled) return;
    if (user) return;
    if (pathname === "/login") return;
    const next = pathname + (searchParams?.toString() ? `?${searchParams}` : "");
    router.replace(`/login?next=${encodeURIComponent(next || "/")}`);
  }, [ready, authEnabled, user, pathname, router, searchParams]);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--tv-page-bg)] text-white/50">
        <ZenedeLogoWave size="md" />
        <p className="sr-only">Loading</p>
      </div>
    );
  }

  if (authEnabled && !user && pathname !== "/login") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--tv-page-bg)] text-white/50">
        <ZenedeLogoWave size="sm" />
        <p className="text-[15px]">Redirecting…</p>
      </div>
    );
  }

  return <>{children}</>;
}
