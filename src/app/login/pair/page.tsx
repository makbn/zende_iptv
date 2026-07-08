"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
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
        <p className="text-[17px] font-semibold text-white">Invalid link</p>
        <p className="mt-2 text-[15px] text-white/50">
          Scan the QR code on your TV login screen to get a valid pairing link.
        </p>
        <Link href="/login" className="mt-6 inline-block text-[15px] text-white/70 underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-[420px] text-center">
        <p className="text-[17px] font-semibold text-emerald-300">Signed in on TV</p>
        <p className="mt-2 text-[15px] leading-relaxed text-white/55">
          You can close this page. Your TV should continue automatically.
        </p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-[420px] text-center text-[15px] text-white/50">
        Checking phone session…
      </div>
    );
  }

  if (user) {
    return (
      <div className="mx-auto w-full max-w-[440px]">
        <ZenedeGlass
          variant="panel"
          className="rounded-[30px] border-white/[0.12] bg-white/[0.055] p-5 sm:p-6"
        >
          <p className="zen-kicker">TV sign-in</p>
          <h1 className="mt-2 text-[clamp(1.9rem,9vw,3rem)] font-semibold leading-[0.9] tracking-[-0.075em] text-white">
            Sign in this TV?
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-white/56">
            You’re already signed in on this phone as{" "}
            <span className="font-semibold text-white/90">{user.username}</span>.
            Approve this request to sign in the TV with the same account.
          </p>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void approveCurrentSession()}
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)] disabled:opacity-50"
            >
              <ZenedeGlass variant="ctaPill" className="w-full">
                <span className="flex min-h-[52px] items-center justify-center px-6 text-[15px] font-semibold text-[var(--zen-void)]">
                  {busy ? "Approving…" : "Yes, sign in TV"}
                </span>
              </ZenedeGlass>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void logout()}
              className="min-h-[52px] rounded-full border border-white/[0.14] bg-white/[0.06] px-6 text-[15px] font-semibold text-white/84 outline-none hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)] disabled:opacity-50"
            >
              Use different account
            </button>
          </div>
          {error ? (
            <p className="mt-4 text-[14px] text-amber-300/95" role="alert">
              {error}
            </p>
          ) : null}
        </ZenedeGlass>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <p className="zen-kicker">
        TV sign-in
      </p>
      <h1 className="zen-page-title mt-2">
        Enter on your phone
      </h1>
      <p className="zen-body-muted mt-3">
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
          <span className="text-[13px] font-medium text-white/55">Username</span>
          <input
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={cn(
              "mt-1.5 h-[52px] w-full rounded-2xl border border-white/[0.12] bg-black/35 px-4",
              "text-[16px] text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]",
            )}
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-white/55">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cn(
              "mt-1.5 h-[52px] w-full rounded-2xl border border-white/[0.12] bg-black/35 px-4",
              "text-[16px] text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]",
            )}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)] disabled:opacity-50"
        >
          <ZenedeGlass variant="ctaPill" className="w-full">
            <span className="flex min-h-[52px] items-center justify-center px-6 text-[15px] font-semibold text-[var(--zen-void)]">
              {busy ? "Signing in…" : "Sign in on TV"}
            </span>
          </ZenedeGlass>
        </button>
      </form>

      {error ? (
        <p className="mt-4 text-[14px] text-amber-300/95" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function LoginPairPage() {
  return (
    <div className="zen-page-bg flex min-h-screen flex-col px-4 py-[max(2rem,env(safe-area-inset-top))] text-foreground sm:px-6 sm:py-16">
      <Suspense
        fallback={
          <div className="mx-auto text-[15px] text-white/50">Loading…</div>
        }
      >
        <PairLoginForm />
      </Suspense>
    </div>
  );
}
