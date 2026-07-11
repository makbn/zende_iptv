"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Gamepad2, Monitor, Tv, X } from "lucide-react";

import { useAuth } from "@/features/auth/auth-context";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";

type RemoteCommand =
  | { type: "navigate"; payload: { href: string } }
  | { type: "togglePlay" | "play" | "pause"; payload?: Record<string, never> }
  | { type: "skip"; payload: { seconds: number } }
  | { type: "seekTo"; payload: { seconds: number } };

type RemoteSessionSummary = {
  sessionId: string;
  label: string;
  kind: "tv" | "desktop" | "other";
  pathname: string;
  lastSeenAt: number;
  createdAt: number;
};

type RemoteControlContextValue = {
  isMobileController: boolean;
  isTvTarget: boolean;
  sessions: RemoteSessionSummary[];
  activeSession: RemoteSessionSummary | null;
  remoteControlActive: boolean;
  sessionPickerOpen: boolean;
  enterRemoteMode: (sessionId?: string) => void;
  openSessionPicker: () => void;
  closeSessionPicker: () => void;
  exitRemoteMode: () => void;
  sendNavigate: (href: string) => Promise<boolean>;
  sendTogglePlay: () => Promise<boolean>;
  sendSkip: (seconds: number) => Promise<boolean>;
  sendSeekTo: (seconds: number) => Promise<boolean>;
  syncMobileToTv: () => void;
};

const RemoteControlContext = createContext<RemoteControlContextValue | null>(null);

export const REMOTE_COMMAND_EVENT = "zende:remote-command";

const TV_SESSION_KEY = "zende.remote.tvSessionId";
const ACTIVE_SESSION_KEY = "zende.remote.activeSessionId";
const DISMISSED_SESSION_KEY = "zende.remote.dismissedSessionId";

function isTvBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /bravia|smart-tv|smarttv|tizen|webos|web0s|roku|aft|appletv|crkey|hbbtv|netcast|viera|philips|android tv|googletv|firetv|aftb|aftm/i.test(
    navigator.userAgent,
  );
}

function isLikelyTvSurface(): boolean {
  if (typeof window === "undefined") return false;
  if (isTvBrowser()) return true;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse) return false;
  return window.matchMedia("(min-width: 1024px)").matches;
}

function isLikelyMobileController(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const mobileUa = /android|iphone|ipad|ipod|mobile|phone|tablet|silk/i.test(ua);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return mobileUa || (coarse && window.matchMedia("(max-width: 1024px)").matches);
}

function detectSessionKind(): "tv" | "desktop" | "other" {
  if (isTvBrowser() || isLikelyTvSurface()) return "tv";
  if (isLikelyMobileController()) return "other";
  return "desktop";
}

function buildSessionLabel(): string {
  const ua = navigator.userAgent;
  if (/tizen/i.test(ua)) return "Samsung TV";
  if (/webos|web0s/i.test(ua)) return "LG TV";
  if (/bravia/i.test(ua)) return "Sony TV";
  if (/roku/i.test(ua)) return "Roku";
  if (/aft|firetv/i.test(ua)) return "Fire TV";
  if (/appletv|tvos/i.test(ua)) return "Apple TV";
  if (/android tv|googletv/i.test(ua)) return "Android TV";
  if (/crkey/i.test(ua)) return "Chromecast";
  if (detectSessionKind() === "desktop") {
    const platform = navigator.platform?.trim();
    return platform ? `Desktop (${platform})` : "Desktop browser";
  }
  return "TV browser";
}

function remotePathname(path: string): string {
  const raw = path.split("#")[0] ?? path;
  const queryStart = raw.indexOf("?");
  return queryStart === -1 ? raw : raw.slice(0, queryStart);
}

function sanitizeRemoteHref(href: string): string {
  if (!href.startsWith("/")) return href;
  return remotePathname(href);
}

function remotePathsMatch(a: string, b: string): boolean {
  return remotePathname(a) === remotePathname(b);
}

function pathnameLabel(pathname: string): string {
  const path = remotePathname(pathname);
  if (path === "/" || path === "") return "Home";
  if (path.startsWith("/library")) return "Library";
  if (path.startsWith("/favorites")) return "Favorites";
  if (path.startsWith("/recordings")) return "Recordings";
  if (path.startsWith("/guide")) return "Guide";
  if (path.startsWith("/settings")) return "Settings";
  if (path.startsWith("/watch")) return "Playing";
  if (path.startsWith("/login")) return "Login";
  const segment = path.split("/").filter(Boolean).pop();
  return segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : path;
}

function formatLastSeen(ms: number): string {
  const delta = Date.now() - ms;
  if (delta < 15_000) return "Just now";
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
}

function preferSession(sessions: RemoteSessionSummary[]): RemoteSessionSummary | null {
  if (sessions.length === 0) return null;
  const tvs = sessions.filter((s) => s.kind === "tv");
  const pool = tvs.length > 0 ? tvs : sessions;
  return [...pool].sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0] ?? null;
}

function readStoredSessionId(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredSessionId(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function SessionKindIcon({
  kind,
  className,
}: {
  kind: RemoteSessionSummary["kind"];
  className?: string;
}) {
  if (kind === "tv") return <Tv className={className} aria-hidden />;
  if (kind === "desktop") return <Monitor className={className} aria-hidden />;
  return <Gamepad2 className={className} aria-hidden />;
}

export function RemoteControlProvider({ children }: { children: ReactNode }) {
  const { user, authEnabled, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sessions, setSessions] = useState<RemoteSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [tvSessionId, setTvSessionId] = useState<string | null>(null);
  const [isMobileController, setIsMobileController] = useState(false);
  const [isTvTarget, setIsTvTarget] = useState(false);
  const commandCursorRef = useRef(0);
  const lastLocalNavigateRef = useRef(0);
  const pendingRemotePathRef = useRef<string | null>(null);

  useEffect(() => {
    const updateSurface = () => {
      setIsMobileController(isLikelyMobileController());
      setIsTvTarget(isLikelyTvSurface());
    };
    updateSurface();
    window.addEventListener("resize", updateSurface);
    return () => window.removeEventListener("resize", updateSurface);
  }, []);

  const activeSession = useMemo(
    () => sessions.find((session) => session.sessionId === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );

  const refreshSessions = useCallback(async () => {
    if (!ready || !authEnabled || !user) {
      setSessions([]);
      return [];
    }
    const response = await zendeFetch("/api/remote/sessions", { cache: "no-store" });
    if (!response.ok) return [];
    const payload = (await response.json()) as { sessions?: RemoteSessionSummary[] };
    const next = Array.isArray(payload.sessions) ? payload.sessions : [];
    setSessions(next);

    if (isMobileController && !activeSessionId) {
      const preferred = preferSession(next);
      const dismissed = readStoredSessionId(DISMISSED_SESSION_KEY);
      if (preferred && dismissed !== preferred.sessionId) {
        setPromptOpen(true);
      }
    }

    return next;
  }, [activeSessionId, authEnabled, isMobileController, ready, user]);

  const sendCommand = useCallback(
    async (command: RemoteCommand) => {
      if (!activeSessionId) return false;
      const response = await zendeFetch(`/api/remote/sessions/${activeSessionId}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      return response.ok;
    },
    [activeSessionId],
  );

  const mirrorNavigate = useCallback(
    (href: string) => {
      if (!href.startsWith("/")) return;
      const target = href.split("#")[0] ?? href;
      if (remotePathsMatch(target, pathname)) return;
      lastLocalNavigateRef.current = Date.now();
      router.push(href);
    },
    [pathname, router],
  );

  const sendNavigate = useCallback(
    async (href: string) => {
      if (!activeSessionId) return false;
      const targetHref = sanitizeRemoteHref(href);
      pendingRemotePathRef.current = remotePathname(targetHref);
      const sent = await sendCommand({ type: "navigate", payload: { href: targetHref } });
      if (!sent) pendingRemotePathRef.current = null;
      return sent;
    },
    [activeSessionId, sendCommand],
  );

  const syncMobileToTv = useCallback(() => {
    // Deliberately no-op: avoid copying mobile/TV URL state (watch session IDs, etc.)
    // across devices. Remote should send user actions, not session-bound page URLs.
  }, []);

  const enterRemoteMode = useCallback(
    (sessionId?: string) => {
      const target =
        (sessionId ? sessions.find((s) => s.sessionId === sessionId) : null) ??
        (activeSessionId ? sessions.find((s) => s.sessionId === activeSessionId) : null) ??
        preferSession(sessions);
      if (!target) return;
      setActiveSessionId(target.sessionId);
      writeStoredSessionId(ACTIVE_SESSION_KEY, target.sessionId);
      writeStoredSessionId(DISMISSED_SESSION_KEY, null);
      setSessionPickerOpen(false);
      setPromptOpen(false);
    },
    [activeSessionId, sessions],
  );

  const openSessionPicker = useCallback(() => {
    void refreshSessions();
    setSessionPickerOpen(true);
  }, [refreshSessions]);

  const closeSessionPicker = useCallback(() => {
    setSessionPickerOpen(false);
  }, []);

  const exitRemoteMode = useCallback(() => {
    if (activeSessionId) {
      writeStoredSessionId(DISMISSED_SESSION_KEY, activeSessionId);
    }
    pendingRemotePathRef.current = null;
    setActiveSessionId(null);
    writeStoredSessionId(ACTIVE_SESSION_KEY, null);
    setSessionPickerOpen(false);
    setPromptOpen(false);
  }, [activeSessionId]);

  // TV target: register heartbeat and poll commands
  useEffect(() => {
    if (!ready || !authEnabled || !user || !isTvTarget) return;

    let cancelled = false;
    let sessionId = readStoredSessionId(TV_SESSION_KEY);

    const heartbeat = async () => {
      const currentPath =
        typeof window !== "undefined" ? window.location.pathname : "/";
      const response = await zendeFetch("/api/remote/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          label: buildSessionLabel(),
          kind: detectSessionKind(),
          pathname: currentPath,
        }),
      });
      if (!response.ok || cancelled) return;
      const payload = (await response.json()) as { sessionId?: string };
      if (payload.sessionId) {
        sessionId = payload.sessionId;
        setTvSessionId(payload.sessionId);
        writeStoredSessionId(TV_SESSION_KEY, payload.sessionId);
      }
    };

    const pollCommands = async () => {
      if (!sessionId) return;
      const response = await zendeFetch(
        `/api/remote/sessions/${sessionId}/commands?after=${commandCursorRef.current}`,
        { cache: "no-store" },
      );
      if (!response.ok || cancelled) return;
      const payload = (await response.json()) as {
        commandSeq?: number;
        commands?: RemoteCommand[];
      };
      const commands = Array.isArray(payload.commands) ? payload.commands : [];
      commandCursorRef.current =
        typeof payload.commandSeq === "number" ? payload.commandSeq : commandCursorRef.current;
      for (const command of commands) {
        if (command.type === "navigate") {
          const href = command.payload.href;
          if (href.startsWith("/")) window.location.assign(href);
          continue;
        }
        window.dispatchEvent(
          new CustomEvent(REMOTE_COMMAND_EVENT, { detail: command }),
        );
      }
    };

    void heartbeat();
    const heartbeatTimer = window.setInterval(() => void heartbeat(), 12_000);
    const commandTimer = window.setInterval(() => void pollCommands(), 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(heartbeatTimer);
      window.clearInterval(commandTimer);
    };
  }, [authEnabled, isTvTarget, ready, user]);

  // Mobile controller: poll available sessions (faster while controlling)
  useEffect(() => {
    if (!ready || !authEnabled || !user || !isMobileController) return;
    void refreshSessions();
    const interval = activeSessionId ? 2_000 : 5_000;
    const timer = window.setInterval(() => void refreshSessions(), interval);
    return () => window.clearInterval(timer);
  }, [activeSessionId, authEnabled, isMobileController, ready, refreshSessions, user]);

  // Restore active session from storage
  useEffect(() => {
    if (!isMobileController) return;
    const stored = readStoredSessionId(ACTIVE_SESSION_KEY);
    if (stored) setActiveSessionId(stored);
  }, [isMobileController]);

  // Keep active session valid when session list updates
  useEffect(() => {
    if (!activeSessionId) return;
    if (sessions.some((s) => s.sessionId === activeSessionId)) return;
    setActiveSessionId(null);
    writeStoredSessionId(ACTIVE_SESSION_KEY, null);
  }, [activeSessionId, sessions]);

  // Sync mobile UI when TV navigates independently (e.g. TV remote)
  useEffect(() => {
    if (!isMobileController || !activeSessionId || !activeSession?.pathname) return;
    const tvPath = activeSession.pathname;
    if (
      pendingRemotePathRef.current &&
      remotePathname(tvPath) === pendingRemotePathRef.current
    ) {
      pendingRemotePathRef.current = null;
    }
  }, [
    activeSession?.pathname,
    activeSessionId,
    isMobileController,
  ]);

  const value = useMemo<RemoteControlContextValue>(
    () => ({
      isMobileController,
      isTvTarget,
      sessions,
      activeSession,
      remoteControlActive: Boolean(activeSessionId),
      sessionPickerOpen,
      enterRemoteMode,
      openSessionPicker,
      closeSessionPicker,
      exitRemoteMode,
      sendNavigate,
      sendTogglePlay: () => sendCommand({ type: "togglePlay" }),
      sendSkip: (seconds) => sendCommand({ type: "skip", payload: { seconds } }),
      sendSeekTo: (seconds) => sendCommand({ type: "seekTo", payload: { seconds } }),
      syncMobileToTv,
    }),
    [
      activeSession,
      activeSessionId,
      closeSessionPicker,
      enterRemoteMode,
      exitRemoteMode,
      isMobileController,
      isTvTarget,
      openSessionPicker,
      sendCommand,
      sendNavigate,
      sessionPickerOpen,
      sessions,
      syncMobileToTv,
    ],
  );

  const tvPathLabel = activeSession ? pathnameLabel(activeSession.pathname) : null;
  const mobileOutOfSync = Boolean(
    activeSession && !remotePathsMatch(activeSession.pathname, pathname),
  );
  const preferredSession = preferSession(sessions);

  return (
    <RemoteControlContext.Provider value={value}>
      {children}
      {isMobileController && promptOpen && preferredSession && !activeSession && !sessionPickerOpen ? (
        <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[120] md:hidden">
          <div className="rounded-[26px] border border-white/[0.13] bg-black/86 p-4 text-white shadow-[0_24px_70px_-28px_rgba(0,0,0,0.95)] backdrop-blur-2xl ring-1 ring-white/[0.06]">
            <p className="zen-kicker">Remote control</p>
            <p className="mt-2 text-[18px] font-semibold tracking-[-0.04em]">
              Control {preferredSession.label}?
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/52">
              Use this phone to search, play, and control playback on your TV.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => enterRemoteMode(preferredSession.sessionId)}
                className="min-h-11 rounded-full bg-[var(--zen-frost)] px-4 text-[14px] font-semibold text-[var(--zen-void)]"
              >
                Control TV
              </button>
              <button
                type="button"
                onClick={() => {
                  writeStoredSessionId(DISMISSED_SESSION_KEY, preferredSession.sessionId);
                  setPromptOpen(false);
                }}
                className="min-h-11 rounded-full border border-white/[0.14] bg-white/[0.06] px-4 text-[14px] font-semibold text-white/78"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isMobileController && (activeSession || sessions.length > 0) && !sessionPickerOpen ? (
        <div className="fixed right-3 top-[calc(5.35rem+env(safe-area-inset-top))] z-[115] md:hidden">
          <div className="flex items-center gap-2 rounded-full border border-white/[0.13] bg-black/72 p-1.5 text-white shadow-2xl backdrop-blur-2xl">
            <button
              type="button"
              onClick={() =>
                activeSession ? exitRemoteMode() : openSessionPicker()
              }
              className={cn(
                "min-h-10 rounded-full px-3 text-[12px] font-semibold",
                activeSession
                  ? "bg-[var(--zen-signal)]/18 text-white"
                  : "bg-white/[0.08] text-white/76",
              )}
            >
              {activeSession ? "Exit TV control" : "Control TV"}
            </button>
          </div>
        </div>
      ) : null}
      {isMobileController && sessionPickerOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Choose device to control"
          onClick={closeSessionPicker}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12141a] p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Control a device</h2>
              <button
                type="button"
                onClick={closeSessionPicker}
                className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {sessions.length === 0 ? (
              <p className="py-6 text-center text-sm text-white/55">
                No devices online. Open Zende on your TV (same account) and try again.
              </p>
            ) : (
              <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
                {sessions.map((session) => {
                  const isActive = session.sessionId === activeSessionId;
                  return (
                    <li key={session.sessionId}>
                      <button
                        type="button"
                        onClick={() => enterRemoteMode(session.sessionId)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                          isActive
                            ? "border-sky-400/40 bg-sky-500/10"
                            : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]",
                        )}
                      >
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/70">
                          <SessionKindIcon kind={session.kind} className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">
                            {session.label}
                          </p>
                          <p className="truncate text-xs text-white/50">
                            {pathnameLabel(session.pathname)} · {formatLastSeen(session.lastSeenAt)}
                          </p>
                        </div>
                        {isActive ? (
                          <span className="shrink-0 text-xs font-medium text-sky-300">Active</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
      {isMobileController && activeSession && !sessionPickerOpen ? (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-[110] flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex max-w-md flex-col gap-2 rounded-2xl border border-white/12 bg-[#12141a]/95 px-3 py-2 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-2">
              <SessionKindIcon kind={activeSession.kind} className="size-4 shrink-0 text-sky-300" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white">
                  Controlling {activeSession.label}
                </p>
                <p className="truncate text-[11px] text-white/50">
                  TV on {tvPathLabel}
                  {mobileOutOfSync ? " · screen out of sync" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={openSessionPicker}
                className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                Switch
              </button>
              <button
                type="button"
                onClick={exitRemoteMode}
                className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                Exit
              </button>
            </div>
            {mobileOutOfSync ? (
              <button
                type="button"
                onClick={syncMobileToTv}
                className="rounded-lg bg-sky-500/20 px-3 py-2 text-xs font-medium text-sky-200 transition-colors hover:bg-sky-500/30"
              >
                Sync phone to {tvPathLabel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {isMobileController && !activeSession && !sessionPickerOpen && sessions.length > 0 ? (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-[110] flex justify-center px-4 pointer-events-none">
          <button
            type="button"
            onClick={openSessionPicker}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/12 bg-[#12141a]/95 px-4 py-2.5 text-sm font-medium text-white shadow-xl backdrop-blur-md transition-colors hover:bg-white/10"
          >
            <Tv className="size-4 text-sky-300" aria-hidden />
            Control TV
          </button>
        </div>
      ) : null}
    </RemoteControlContext.Provider>
  );
}

export function useRemoteControl() {
  return useContext(RemoteControlContext);
}
