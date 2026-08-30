"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState, useSyncExternalStore } from "react";

import { LoginQrPairing } from "@/components/auth/login-qr-pairing";
import { ThemeToggle } from "@/components/appica/theme-toggle";
import { ZendeLoadingState, ZendeSpinner } from "@/components/loading/zende-spinner";
import { Button, buttonVariants } from "@appica/ui-react/button";
import { Input } from "@appica/ui-react/input";
import { useAuth } from "@/features/auth/auth-context";
import { isTvEnvironment } from "@/lib/tv/tv-environment";

function subscribeToTvMode(): () => void {
  return () => undefined;
}

function getTvModeSnapshot(): boolean {
  return isTvEnvironment();
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tvMode = useSyncExternalStore(
    subscribeToTvMode,
    getTvModeSnapshot,
    () => false,
  );

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
    <div className="mx-auto flex min-h-[calc(100svh-6rem)] w-full max-w-[520px] flex-col justify-center motion-reduce:animate-none motion-reduce:opacity-100 sm:min-h-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
        Zende
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-foreground-intense mt-2">
        Sign in
      </h1>
      <p className="text-sm text-foreground-muted mt-3">
        {tvMode
          ? "Scan the QR code with a phone already signed in to Zende."
          : "Enter your account details to continue, or scan the QR code with your phone."}
      </p>

      <LoginQrPairing onComplete={() => void onQrComplete()} />

      {!tvMode ? (
        <>
          <div className="relative my-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-background-muted" />
            <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-foreground-intense">
              or type here
            </span>
            <div className="h-px flex-1 bg-background-muted" />
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
              <span className="text-[13px] font-medium text-foreground-intense">Username</span>
              <Input
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                inputSize="lg"
                className="mt-1.5 w-full"
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
                inputSize="lg"
                className="mt-1.5 w-full"
              />
            </label>
          </form>

          {error ? (
            <p className="mt-4 text-[14px] text-warning-strong" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
            <Button
              type="submit"
              form="zende-login"
              disabled={busy}
              variant="primary"
              size="lg"
            >
              {busy ? <><ZendeSpinner size="tiny" label="Signing in" /> Signing in…</> : "Continue"}
            </Button>
            <Link
              href="/"
              className={buttonVariants({ variant: "secondary", size: "lg" })}
            >
              Cancel
            </Link>
          </div>
        </>
      ) : (
        <Link
          href="/"
          className={buttonVariants({ variant: "secondary", size: "lg", className: "mt-8 self-start" })}
        >
          Cancel
        </Link>
      )}
    </div>
  );
}

export default function LoginPage() {
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
        <LoginForm />
      </Suspense>
    </div>
  );
}
