"use client";

import { Button } from "@appica/ui-react/button";

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
import { Gamepad2, Monitor, Tv, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/features/auth/auth-context";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { AppicaConfirmDialog } from "@/components/appica/confirm-dialog";
import { MobileRemotePlayerController } from "@/components/remote/mobile-remote-player-controller";
import { sanitizeRemoteHref } from "@/lib/navigation/remote-href";
import { createWatchUrl } from "@/lib/navigation/watch-url";
import type {
  RemoteCommandInput,
  RemotePlayableChannel,
  RemotePlaybackState,
  RemoteSessionSummary,
} from "@/lib/remote/remote-control-types";

type RemoteControlContextValue = {
  isMobileController: boolean;
  isTvTarget: boolean;
  activeSession: RemoteSessionSummary | null;
  remoteControlActive: boolean;
  requestRemoteControlToggle: () => Promise<void>;
  showRemoteController: () => void;
  sendNavigate: (href: string) => Promise<boolean>;
  sendPlayChannel: (channel: RemotePlayableChannel) => Promise<boolean>;
  sendTogglePlay: () => Promise<boolean>;
  sendSkip: (seconds: number) => Promise<boolean>;
  sendSeekTo: (seconds: number) => Promise<boolean>;
  reportTargetPlayback: (playback: RemotePlaybackState | null) => void;
};

const RemoteControlContext = createContext<RemoteControlContextValue | null>(null);

export const REMOTE_COMMAND_EVENT = "zende:remote-command";

const TV_SESSION_KEY = "zende.remote.tvSessionId";

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
  const router = useRouter();
  const mobilePathname = usePathname();
  const { user, authEnabled, ready } = useAuth();
  const [sessions, setSessions] = useState<RemoteSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  const [pendingEnableSessionId, setPendingEnableSessionId] = useState<string | null>(null);
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);
  const [isMobileController, setIsMobileController] = useState(false);
  const [isTvTarget, setIsTvTarget] = useState(false);
  const [controllerOpen, setControllerOpen] = useState(false);
  const [pendingPlaybackTitle, setPendingPlaybackTitle] = useState<string | null>(null);
  const commandCursorRef = useRef(0);
  const pendingRemotePathRef = useRef<string | null>(null);
  const targetPlaybackRef = useRef<RemotePlaybackState | null>(null);
  const lastControllerPlaybackIdRef = useRef<string | null>(null);

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

    return next;
  }, [authEnabled, ready, user]);

  const sendCommand = useCallback(
    async (command: RemoteCommandInput) => {
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

  const sendNavigate = useCallback(
    async (href: string) => {
      if (!activeSessionId) return false;
      const targetHref = sanitizeRemoteHref(href);
      if (!targetHref) return false;
      pendingRemotePathRef.current = remotePathname(targetHref);
      const sent = await sendCommand({ type: "navigate", payload: { href: targetHref } });
      if (!sent) pendingRemotePathRef.current = null;
      return sent;
    },
    [activeSessionId, sendCommand],
  );

  const sendPlayChannel = useCallback(
    async (channel: RemotePlayableChannel) => {
      if (!activeSessionId) return false;
      setPendingPlaybackTitle(channel.name);
      setControllerOpen(true);
      const sent = await sendCommand({ type: "playMedia", payload: { channel } });
      if (!sent) setPendingPlaybackTitle(null);
      return sent;
    },
    [activeSessionId, sendCommand],
  );

  const enterRemoteMode = useCallback(
    (sessionId: string) => {
      const target =
        sessions.find((session) => session.sessionId === sessionId) ?? null;
      if (!target) return;
      setActiveSessionId(target.sessionId);
      setControllerOpen(true);
      setSessionPickerOpen(false);
      setPendingEnableSessionId(null);
    },
    [sessions],
  );

  const closeSessionPicker = useCallback(() => {
    setSessionPickerOpen(false);
  }, []);

  const exitRemoteMode = useCallback(() => {
    pendingRemotePathRef.current = null;
    setActiveSessionId(null);
    setSessionPickerOpen(false);
    setDisableConfirmOpen(false);
    setControllerOpen(false);
    setPendingPlaybackTitle(null);
  }, []);

  const requestRemoteControlToggle = useCallback(async () => {
    if (activeSessionId) {
      setControllerOpen(true);
      return;
    }

    const available = await refreshSessions();
    if (available.length === 1) {
      setPendingEnableSessionId(available[0]!.sessionId);
      return;
    }
    setSessionPickerOpen(true);
  }, [activeSessionId, refreshSessions]);

  // TV target: register heartbeat and poll commands
  useEffect(() => {
    if (!ready || !authEnabled || !user || !isTvTarget) return;

    let cancelled = false;
    let sessionId = readStoredSessionId(TV_SESSION_KEY);

    const heartbeat = async () => {
      const currentPath = typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/";
      if (!remotePathname(currentPath).startsWith("/watch")) {
        targetPlaybackRef.current = null;
      }
      const response = await zendeFetch("/api/remote/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          label: buildSessionLabel(),
          kind: detectSessionKind(),
          pathname: currentPath,
          playback: targetPlaybackRef.current,
        }),
      });
      if (!response.ok || cancelled) return;
      const payload = (await response.json()) as { sessionId?: string };
      if (payload.sessionId) {
        if (payload.sessionId !== sessionId) commandCursorRef.current = 0;
        sessionId = payload.sessionId;
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
        commands?: RemoteCommandInput[];
      };
      const commands = Array.isArray(payload.commands) ? payload.commands : [];
      commandCursorRef.current =
        typeof payload.commandSeq === "number" ? payload.commandSeq : commandCursorRef.current;
      for (const command of commands) {
        if (command.type === "navigate") {
          const href = sanitizeRemoteHref(command.payload.href);
          if (href) window.location.assign(href);
          continue;
        }
        if (command.type === "playMedia") {
          try {
            const href = await createWatchUrl(command.payload.channel);
            window.location.assign(href);
          } catch {
            // The controller will keep the pending state and can retry by selecting again.
          }
          continue;
        }
        window.dispatchEvent(
          new CustomEvent(REMOTE_COMMAND_EVENT, { detail: command }),
        );
      }
    };

    void heartbeat();
    const heartbeatTimer = window.setInterval(() => void heartbeat(), 1_500);
    const commandTimer = window.setInterval(() => void pollCommands(), 750);
    return () => {
      cancelled = true;
      window.clearInterval(heartbeatTimer);
      window.clearInterval(commandTimer);
    };
  }, [authEnabled, isTvTarget, ready, user]);

  // Mobile controller: poll available sessions (faster while controlling)
  useEffect(() => {
    if (!ready || !authEnabled || !user || !isMobileController) return;
    queueMicrotask(() => void refreshSessions());
    const interval = activeSessionId ? 2_000 : 5_000;
    const timer = window.setInterval(() => void refreshSessions(), interval);
    return () => window.clearInterval(timer);
  }, [activeSessionId, authEnabled, isMobileController, ready, refreshSessions, user]);

  // Keep active session valid when session list updates
  useEffect(() => {
    if (!activeSessionId) return;
    if (sessions.some((s) => s.sessionId === activeSessionId)) return;
    queueMicrotask(() => setActiveSessionId(null));
  }, [activeSessionId, sessions]);

  // Keep phone and TV browsing in sync, but keep playback on the TV and show
  // the controller on the phone instead of navigating the phone to /watch.
  useEffect(() => {
    if (!isMobileController || !activeSessionId || !activeSession?.pathname) return;
    const tvHref = sanitizeRemoteHref(activeSession.pathname);
    if (!tvHref) return;
    const tvPath = remotePathname(tvHref);
    if (pendingRemotePathRef.current) {
      if (tvPath === pendingRemotePathRef.current) {
        pendingRemotePathRef.current = null;
      } else {
        return;
      }
    }
    if (tvPath.startsWith("/watch")) {
      const playbackId = activeSession.playback?.playbackId ?? null;
      if (playbackId && playbackId !== lastControllerPlaybackIdRef.current) {
        lastControllerPlaybackIdRef.current = playbackId;
        queueMicrotask(() => setControllerOpen(true));
      }
      return;
    }
    if (remotePathname(mobilePathname) !== tvPath) {
      router.push(tvHref);
    }
  }, [
    activeSession?.playback,
    activeSession?.pathname,
    activeSessionId,
    isMobileController,
    mobilePathname,
    router,
  ]);

  const reportTargetPlayback = useCallback((playback: RemotePlaybackState | null) => {
    targetPlaybackRef.current = playback;
  }, []);

  const value = useMemo<RemoteControlContextValue>(
    () => ({
      isMobileController,
      isTvTarget,
      activeSession,
      remoteControlActive: Boolean(activeSessionId),
      requestRemoteControlToggle,
      showRemoteController: () => setControllerOpen(true),
      sendNavigate,
      sendPlayChannel,
      sendTogglePlay: () => sendCommand({ type: "togglePlay" }),
      sendSkip: (seconds) => sendCommand({ type: "skip", payload: { seconds } }),
      sendSeekTo: (seconds) => sendCommand({ type: "seekTo", payload: { seconds } }),
      reportTargetPlayback,
    }),
    [
      activeSession,
      activeSessionId,
      isMobileController,
      isTvTarget,
      requestRemoteControlToggle,
      reportTargetPlayback,
      sendCommand,
      sendNavigate,
      sendPlayChannel,
    ],
  );
  const pendingEnableSession = pendingEnableSessionId
    ? sessions.find((session) => session.sessionId === pendingEnableSessionId) ?? null
    : null;

  return (
    <RemoteControlContext.Provider value={value}>
      {children}
      {isMobileController && activeSession ? (
        <MobileRemotePlayerController
          open={controllerOpen}
          deviceLabel={activeSession.label}
          devicePath={pathnameLabel(activeSession.pathname)}
          playback={activeSession.playback}
          pendingTitle={pendingPlaybackTitle}
          onClose={() => setControllerOpen(false)}
          onTogglePlay={() => void sendCommand({ type: "togglePlay" })}
          onSkip={(seconds) => void sendCommand({ type: "skip", payload: { seconds } })}
          onSeek={(seconds) => void sendCommand({ type: "seekTo", payload: { seconds } })}
          onDisconnect={() => {
            setControllerOpen(false);
            setDisableConfirmOpen(true);
          }}
        />
      ) : null}
      {isMobileController && sessionPickerOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-background p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Choose device to control"
          onClick={closeSessionPicker}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-background p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground-intense">Control a device</h2>
              <Button variant="ghost"
                type="button"
                onClick={closeSessionPicker}
                className="rounded-lg p-2 text-foreground-intense transition-colors hover:bg-background-muted hover:text-foreground-intense"
                aria-label="Close"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
            {sessions.length === 0 ? (
              <p className="py-6 text-center text-sm text-foreground-intense">
                No devices online. Open Zende on your TV (same account) and try again.
              </p>
            ) : (
              <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
                {sessions.map((session) => {
                  return (
                    <li key={session.sessionId}>
                      <Button variant="ghost"
                        type="button"
                        onClick={() => {
                          setSessionPickerOpen(false);
                          setPendingEnableSessionId(session.sessionId);
                        }}
                        className="flex w-full items-center gap-3 rounded-xl border border-border bg-background-muted px-3 py-3 text-left transition-colors hover:bg-background-muted"
                      >
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background-muted text-foreground-intense">
                          <SessionKindIcon kind={session.kind} className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground-intense">
                            {session.label}
                          </p>
                          <p className="truncate text-xs text-foreground-intense">
                            {pathnameLabel(session.pathname)} · {formatLastSeen(session.lastSeenAt)}
                          </p>
                        </div>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
      <AppicaConfirmDialog
        open={Boolean(isMobileController && pendingEnableSession)}
        title={`Control ${pendingEnableSession?.label ?? "this device"}?`}
        description="Navigation, search, and playback controls will be sent to this device until you disable Remote."
        confirmLabel="Enable Remote"
        onCancel={() => setPendingEnableSessionId(null)}
        onConfirm={() => {
          if (pendingEnableSession) enterRemoteMode(pendingEnableSession.sessionId);
        }}
      />
      <AppicaConfirmDialog
        open={Boolean(isMobileController && disableConfirmOpen && activeSession)}
        title={`Stop controlling ${activeSession?.label ?? "this device"}?`}
        description="Your phone will return to normal local navigation."
        confirmLabel="Disable Remote"
        cancelLabel="Keep enabled"
        destructive
        onCancel={() => setDisableConfirmOpen(false)}
        onConfirm={exitRemoteMode}
      />
    </RemoteControlContext.Provider>
  );
}

export function useRemoteControl() {
  return useContext(RemoteControlContext);
}
