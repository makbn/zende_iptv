"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";

import { LoginQrPairing } from "@/components/auth/login-qr-pairing";
import { ZendeLoadingState, ZendeSpinner } from "@/components/loading/zende-spinner";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const redirectAfterLogin = useCallback(() => {
    const next = searchParams.get("next");
    router.replace(next && next.startsWith("/") ? next : "/");
  }, [router, searchParams]);

  const submit = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
      redirectAfterLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }, [login, username, password, redirectAfterLogin]);

  const onQrComplete = useCallback(async () => {
    await refresh();
    redirectAfterLogin();
  }, [refresh, redirectAfterLogin]);

  return (
    <div className="mx-auto flex min-h-[calc(100svh-6rem)] w-full max-w-[520px] flex-col justify-center motion-safe:animate-zen-shell-in motion-reduce:animate-none motion-reduce:opacity-100 sm:min-h-0">
      <p className="zen-kicker">
        Zende
      </p>
      <h1 className="zen-page-title mt-2">
        Sign in
      </h1>
      <p className="zen-body-muted mt-3">
        Enter your account details to continue, or scan the QR code with your phone.
      </p>

      <LoginQrPairing onComplete={() => void onQrComplete()} />

      <div className="relative my-8 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-white/35">
          or type here
        </span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <form
        id="zende-login"
        className="space-y-4"
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
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={cn(
              "mt-1.5 h-[52px] w-full rounded-2xl border border-white/[0.12] bg-black/35 px-4 sm:h-12",
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
              "mt-1.5 h-[52px] w-full rounded-2xl border border-white/[0.12] bg-black/35 px-4 sm:h-12",
              "text-[16px] text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)]",
            )}
          />
        </label>
      </form>

      {error ? (
        <p className="mt-4 text-[14px] text-amber-300/95" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
        <Button
          type="submit"
          form="zende-login"
          disabled={busy}
          variant="success"
          size="lg"
        >
          {busy ? <><ZendeSpinner size="tiny" label="Signing in" /> Signing in…</> : "Continue"}
        </Button>
        <Link
          href="/"
          className={buttonVariants({ variant: "normal", size: "lg" })}
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="zen-page-bg flex min-h-screen flex-col px-4 py-[max(2rem,env(safe-area-inset-top))] text-foreground sm:px-6 sm:py-16">
      <Suspense
        fallback={
          <ZendeLoadingState className="mx-auto" size="large" label="Loading sign in…" />
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
