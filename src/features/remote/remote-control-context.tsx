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
import { useRouter } from "next/navigation";

import { useAuth } from "@/features/auth/auth-context";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";

type RemoteSessionSummary = {
  sessionId: string;
  label: string;
  lastSeenAt: number;
  createdAt: number;
};

type RemoteCommand =
  | { id: string; type: "navigate"; payload: { href: string }; createdAt: number }
  | { id: string; type: "togglePlay" | "play" | "pause"; createdAt: number }
  | { id: string; type: "skip"; payload: { seconds: number }; createdAt: number }
  | { id: string; type: "seekTo"; payload: { seconds: number }; createdAt: number };

type RemoteCommandInput =
  | { type: "navigate"; payload: { href: string } }
  | { type: "togglePlay" | "play" | "pause" }
  | { type: "skip"; payload: { seconds: number } }
  | { type: "seekTo"; payload: { seconds: number } };

type RemoteContextValue = {
  activeSession: RemoteSessionSummary | null;
  availableSessions: RemoteSessionSummary[];
  sendCommand: (command: RemoteCommandInput) => Promise<boolean>;
  sendNavigate: (href: string) => Promise<boolean>;
  exitRemoteMode: () => void;
  enterRemoteMode: (sessionId?: string) => void;
};

export const REMOTE_COMMAND_EVENT = "zende:remote-command";

const ACTIVE_REMOTE_STORAGE = "zenede.remote.activeSessionId";
const DISMISSED_REMOTE_STORAGE = "zenede.remote.dismissedSessionId";

const Ctx = createContext<RemoteContextValue | null>(null);

function isLikelyTvSurface(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const tvUa = /bravia|smart-tv|smarttv|tizen|webos|roku|aft|appletv|crkey/i.test(ua);
  if (tvUa) return true;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse) return false;
  return window.matchMedia("(min-width: 1024px)").matches;
}

function isLikelyMobileController(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const mobileUa =
    /android|iphone|ipad|ipod|mobile|phone|tablet|silk/i.test(ua);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return mobileUa || (coarse && window.matchMedia("(max-width: 1024px)").matches);
}

function tvLabel(): string {
  if (typeof navigator === "undefined") return "TV browser";
  const ua = navigator.userAgent;
  if (/bravia|smart-tv|smarttv|tizen|webos|roku|aft|appletv|crkey/i.test(ua)) {
    return "TV browser";
  }
  return "Large screen browser";
}

async function jsonOrEmpty<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

export function RemoteControlProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { ready, authEnabled, user } = useAuth();
  const [tvSessionId, setTvSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<RemoteSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [isMobileController, setIsMobileController] = useState(false);
  const [isTvSurface, setIsTvSurface] = useState(false);
  const commandCursorRef = useRef(0);

  useEffect(() => {
    setActiveSessionId(localStorage.getItem(ACTIVE_REMOTE_STORAGE));
    const update = () => {
      setIsMobileController(isLikelyMobileController());
      setIsTvSurface(isLikelyTvSurface());
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!ready || !authEnabled || !user || !isTvSurface) return;
    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const heartbeat = async () => {
      const res = await zendeFetch("/api/remote/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: tvSessionId,
          label: tvLabel(),
        }),
      });
      if (!res.ok || cancelled) return;
      const body = await jsonOrEmpty<{ sessionId?: string }>(res);
      if (body.sessionId) setTvSessionId(body.sessionId);
    };

    const poll = async () => {
      const sid = tvSessionId;
      if (!sid) return;
      const res = await zendeFetch(
        `/api/remote/sessions/${encodeURIComponent(sid)}/commands?after=${commandCursorRef.current}`,
      );
      if (!res.ok || cancelled) return;
      const body = await jsonOrEmpty<{
        commandSeq?: number;
        commands?: RemoteCommand[];
      }>(res);
      const commands = body.commands ?? [];
      commandCursorRef.current =
        typeof body.commandSeq === "number"
          ? body.commandSeq
          : commandCursorRef.current + commands.length;
      for (const command of commands) {
        if (command.type === "navigate") {
          router.push(command.payload.href);
        }
        window.dispatchEvent(
          new CustomEvent(REMOTE_COMMAND_EVENT, { detail: command }),
        );
      }
    };

    void heartbeat();
    heartbeatTimer = setInterval(() => void heartbeat(), 10_000);
    pollTimer = setInterval(() => void poll(), 1_000);
    return () => {
      cancelled = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [ready, authEnabled, user, isTvSurface, tvSessionId, router]);

  useEffect(() => {
    if (!ready || !authEnabled || !user || !isMobileController) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const refreshSessions = async () => {
      const res = await zendeFetch("/api/remote/sessions");
      if (!res.ok || cancelled) return;
      const body = await jsonOrEmpty<{ sessions?: RemoteSessionSummary[] }>(res);
      const next = body.sessions ?? [];
      setSessions(next);
      const storedActive = localStorage.getItem(ACTIVE_REMOTE_STORAGE);
      if (storedActive && !next.some((session) => session.sessionId === storedActive)) {
        localStorage.removeItem(ACTIVE_REMOTE_STORAGE);
        setActiveSessionId(null);
      }
      const first = next[0];
      const dismissed = localStorage.getItem(DISMISSED_REMOTE_STORAGE);
      if (!storedActive && first && dismissed !== first.sessionId) {
        setPromptOpen(true);
      }
    };

    void refreshSessions();
    timer = setInterval(() => void refreshSessions(), 5_000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [ready, authEnabled, user, isMobileController]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.sessionId === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  const enterRemoteMode = useCallback(
    (sessionId?: string) => {
      const sid = sessionId ?? sessions[0]?.sessionId;
      if (!sid) return;
      localStorage.setItem(ACTIVE_REMOTE_STORAGE, sid);
      localStorage.removeItem(DISMISSED_REMOTE_STORAGE);
      setActiveSessionId(sid);
      setPromptOpen(false);
    },
    [sessions],
  );

  const exitRemoteMode = useCallback(() => {
    if (activeSessionId) {
      localStorage.setItem(DISMISSED_REMOTE_STORAGE, activeSessionId);
    }
    localStorage.removeItem(ACTIVE_REMOTE_STORAGE);
    setActiveSessionId(null);
    setPromptOpen(false);
  }, [activeSessionId]);

  const sendCommand = useCallback(
    async (command: RemoteCommandInput): Promise<boolean> => {
      const sid = activeSessionId;
      if (!sid) return false;
      const res = await zendeFetch(
        `/api/remote/sessions/${encodeURIComponent(sid)}/commands`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        },
      );
      return res.ok;
    },
    [activeSessionId],
  );

  const sendNavigate = useCallback(
    (href: string) => sendCommand({ type: "navigate", payload: { href } }),
    [sendCommand],
  );

  const value = useMemo(
    () => ({
      activeSession,
      availableSessions: sessions,
      sendCommand,
      sendNavigate,
      exitRemoteMode,
      enterRemoteMode,
    }),
    [activeSession, sessions, sendCommand, sendNavigate, exitRemoteMode, enterRemoteMode],
  );

  const firstSession = sessions[0] ?? null;

  return (
    <Ctx.Provider value={value}>
      {children}
      {isMobileController && promptOpen && firstSession && !activeSession ? (
        <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[80] md:hidden">
          <div className="rounded-[26px] border border-white/[0.13] bg-black/86 p-4 text-white shadow-[0_24px_70px_-28px_rgba(0,0,0,0.95)] backdrop-blur-2xl ring-1 ring-white/[0.06]">
            <p className="zen-kicker">Remote control</p>
            <p className="mt-2 text-[18px] font-semibold tracking-[-0.04em]">
              Control {firstSession.label}?
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/52">
              Use this phone to search, play, and control playback on your TV.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => enterRemoteMode(firstSession.sessionId)}
                className="min-h-11 rounded-full bg-[var(--zen-frost)] px-4 text-[14px] font-semibold text-[var(--zen-void)]"
              >
                Control TV
              </button>
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem(DISMISSED_REMOTE_STORAGE, firstSession.sessionId);
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
      {isMobileController && (activeSession || sessions.length > 0) ? (
        <div className="fixed right-3 top-[calc(5.35rem+env(safe-area-inset-top))] z-[70] md:hidden">
          <div className="flex items-center gap-2 rounded-full border border-white/[0.13] bg-black/72 p-1.5 text-white shadow-2xl backdrop-blur-2xl">
            <button
              type="button"
              onClick={() =>
                activeSession ? exitRemoteMode() : enterRemoteMode(sessions[0]?.sessionId)
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
    </Ctx.Provider>
  );
}

export function useRemoteControl() {
  return useContext(Ctx);
}
