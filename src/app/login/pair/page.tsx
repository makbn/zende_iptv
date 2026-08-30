"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";

import { Card } from "@appica/ui-react/card";
import { ThemeToggle } from "@/components/appica/theme-toggle";
import { ZendeLoadingState, ZendeSpinner } from "@/components/loading/zende-spinner";
import { Button } from "@appica/ui-react/button";
import { useAuth } from "@/features/auth/auth-context";
import { zendeFetch } from "@/lib/auth/zende-fetch";

function PairLoginForm() {
  const searchParams = useSearchParams();
  const { ready, user, logout } = useAuth();
  const sessionId = searchParams.get("s")?.trim() ?? "";
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

  const pairPath = `/login/pair?s=${encodeURIComponent(sessionId)}`;

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
        TV sign-in
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-foreground-intense mt-2">
        Sign in on your phone
      </h1>
      <p className="text-sm text-foreground-muted mt-3">
        Sign in to your Zende account first. You’ll return here to explicitly approve the TV.
      </p>

      <Link
        href={`/login?next=${encodeURIComponent(pairPath)}`}
        className="mt-8 inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary"
      >
        Sign in to Zende
      </Link>

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
