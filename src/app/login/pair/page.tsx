"use client";

import { Input } from "@appica/ui-react/input";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";

import { Card } from "@appica/ui-react/card";
import { ThemeToggle } from "@/components/appica/theme-toggle";
import { ZendeLoadingState, ZendeSpinner } from "@/components/loading/zende-spinner";
import { Button } from "@appica/ui-react/button";
import { useAuth } from "@/features/auth/auth-context";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";

function PairLoginForm() {
  const searchParams = useSearchParams();
  const { ready, user, logout } = useAuth();
  const sessionId = searchParams.get("s")?.trim() ?? "";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const approveCurrentSession = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    setBusy(true);
    try {
      const res = await zendeFetch(
        `/api/auth/login/pair/${encodeURIComponent(sessionId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approveCurrentSession: true }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Could not approve TV sign-in.",
        );
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve TV sign-in.");
    } finally {
      setBusy(false);
    }
  }, [sessionId]);

  const submit = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/login/pair/${encodeURIComponent(sessionId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Sign-in failed.",
        );
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }, [sessionId, username, password]);

  if (!sessionId) {
    return (
      <div className="mx-auto max-w-[420px] text-center">
        <p className="text-[17px] font-semibold text-foreground-intense">Invalid link</p>
        <p className="mt-2 text-[15px] text-foreground-intense">
          Scan the QR code on your TV login screen to get a valid pairing link.
        </p>
        <Link href="/login" className="mt-6 inline-block text-[15px] text-foreground-intense underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-[420px] text-center">
        <p className="text-[17px] font-semibold text-success-strong">Signed in on TV</p>
        <p className="mt-2 text-[15px] leading-relaxed text-foreground-intense">
          You can close this page. Your TV should continue automatically.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full border border-border bg-background-muted px-6 text-[15px] font-semibold text-foreground-intense outline-none transition hover:bg-background-muted focus-visible:ring-2 focus-visible:ring-primary"
        >
          Go to Home
        </Link>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-[420px] text-center text-[15px] text-foreground-intense">
        Checking phone session…
      </div>
    );
  }

  if (user) {
    return (
      <div className="mx-auto w-full max-w-[440px]">
        <Card frame="solid" contentProps={{ className: "p-6" }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">TV sign-in</p>
          <h1 className="mt-2 text-[clamp(1.9rem,9vw,3rem)] font-semibold leading-[0.9] tracking-[-0.075em] text-foreground-intense">
            Sign in this TV?
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-foreground-intense">
            You’re already signed in on this phone as{" "}
            <span className="font-semibold text-foreground-intense">{user.username}</span>.
            Approve this request to sign in the TV with the same account.
          </p>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() => void approveCurrentSession()}
              variant="primary"
              size="lg"
              className="w-full"
            >
              {busy ? <><ZendeSpinner size="tiny" label="Approving sign in" /> Approving…</> : "Yes, sign in TV"}
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void logout()}
              size="lg"
              className="w-full"
            >
              Use different account
            </Button>
          </div>
          {error ? (
            <p className="mt-4 text-[14px] text-warning-strong" role="alert">
              {error}
            </p>
          ) : null}
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
        TV sign-in
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-foreground-intense mt-2">
        Enter on your phone
      </h1>
      <p className="text-sm text-foreground-muted mt-3">
        Type your username and password here — easier than using a TV remote.
      </p>

      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block">
          <span className="text-[13px] font-medium text-foreground-intense">Username</span>
          <Input
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={cn(
              "mt-1.5 h-[52px] w-full rounded-2xl border border-border bg-background px-4",
              "text-[16px] text-foreground-intense outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-foreground-intense">Password</span>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cn(
              "mt-1.5 h-[52px] w-full rounded-2xl border border-border bg-background px-4",
              "text-[16px] text-foreground-intense outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
          />
        </label>
        <Button
          type="submit"
          disabled={busy}
          variant="primary"
          size="lg"
          className="w-full"
        >
          {busy ? <><ZendeSpinner size="tiny" label="Signing in" /> Signing in…</> : "Sign in on TV"}
        </Button>
      </form>

      {error ? (
        <p className="mt-4 text-[14px] text-warning-strong" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function LoginPairPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-background px-4 py-8 text-foreground sm:px-6 sm:py-16">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Suspense
        fallback={
          <ZendeLoadingState className="mx-auto" size="large" label="Loading sign in…" />
        }
      >
        <PairLoginForm />
      </Suspense>
    </div>
  );
}
