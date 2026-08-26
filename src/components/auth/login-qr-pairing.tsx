"use client";

import { Button } from "@appica/ui-react/button";

import QRCode from "react-qr-code";
import { useEffect, useRef, useState } from "react";

import { Card } from "@appica/ui-react/card";
import { ZendeSpinner } from "@/components/loading/zende-spinner";
import { setStoredTokens } from "@/lib/auth/zende-fetch";

type Props = {
  onComplete: (tokens: { accessToken: string; refreshToken: string }) => void;
};

export function LoginQrPairing({ onComplete }: Props) {
  const [pairUrl, setPairUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "waiting" | "expired" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const start = async () => {
      try {
        const res = await fetch("/api/auth/login/pair", { method: "POST" });
        const data = (await res.json().catch(() => ({}))) as {
          sessionId?: string;
          error?: string;
        };
        if (!res.ok || !data.sessionId) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Could not start QR login.",
          );
        }
        if (cancelled) return;

        sessionIdRef.current = data.sessionId;
        const origin = window.location.origin;
        const next = new URLSearchParams(window.location.search).get("next");
        const pair = new URL(`/login/pair`, origin);
        pair.searchParams.set("s", data.sessionId);
        if (next?.startsWith("/")) {
          pair.searchParams.set("next", next);
        }
        setPairUrl(pair.href);
        setStatus("waiting");

        pollTimer = setInterval(() => {
          void (async () => {
            const sid = sessionIdRef.current;
            if (!sid || cancelled) return;
            const poll = await fetch(
              `/api/auth/login/pair/${encodeURIComponent(sid)}`,
            );
            const body = (await poll.json().catch(() => ({}))) as {
              status?: string;
              accessToken?: string;
              refreshToken?: string;
            };
            if (cancelled) return;
            if (body.status === "expired") {
              setStatus("expired");
              if (pollTimer) clearInterval(pollTimer);
              return;
            }
            if (
              body.status === "complete" &&
              body.accessToken &&
              body.refreshToken
            ) {
              if (pollTimer) clearInterval(pollTimer);
              setStoredTokens(body.accessToken, body.refreshToken);
              onCompleteRef.current({
                accessToken: body.accessToken,
                refreshToken: body.refreshToken,
              });
            }
          })();
        }, 2000);
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError(e instanceof Error ? e.message : "QR login unavailable.");
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  const refresh = () => {
    window.location.reload();
  };

  return (
    <Card
      frame="solid"
      className="mt-8"
      contentProps={{ className: "p-6" }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
        Sign in with phone
      </p>
      <p className="text-sm text-foreground-muted mt-2">
        Scan with your phone. If you’re already signed in, just approve the TV;
        otherwise enter your username and password on mobile.
      </p>

      <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="rounded-lg bg-background-muted p-3 shadow-lg sm:p-4">
          {pairUrl && status !== "error" ? (
            <QRCode value={pairUrl} size={240} level="M" />
          ) : (
            <div className="flex h-[240px] w-[240px] items-center justify-center text-[13px] text-foreground-muted">
              {status === "loading" ? <ZendeSpinner size="large" label="Preparing QR sign in" /> : "Unavailable"}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          {status === "waiting" ? (
            <p className="text-[14px] text-foreground-intense">
              Waiting for your phone…
            </p>
          ) : null}
          {status === "expired" ? (
            <>
              <p className="text-[14px] text-warning-strong">QR code expired.</p>
              <Button variant="ghost"
                type="button"
                onClick={refresh}
                className="mt-2 text-[14px] font-semibold text-primary-strong underline underline-offset-2"
              >
                Generate new code
              </Button>
            </>
          ) : null}
          {error ? (
            <p className="text-[14px] text-warning-strong" role="alert">
              {error}
            </p>
          ) : null}
          {pairUrl ? (
            <p className="mt-3 break-all text-[11px] text-foreground-intense sm:text-[12px]">
              {pairUrl}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
