"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }, [login, username, password, router, searchParams]);

  return (
    <div className="mx-auto flex min-h-[calc(100svh-6rem)] w-full max-w-[420px] flex-col justify-center motion-safe:animate-zen-shell-in motion-reduce:animate-none motion-reduce:opacity-100 sm:min-h-0">
      <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/45">
        Zenede
      </p>
      <h1 className="mt-3 text-[clamp(1.5rem,4vw,1.85rem)] font-semibold text-white">
        Sign in
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-white/48">
        Enter your account details to continue.
      </p>

      <form
        id="zenede-login"
        className="mt-8 space-y-4 sm:mt-10"
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
              "mt-1.5 h-[52px] w-full rounded-2xl border border-white/[0.12] bg-black/30 px-4 sm:h-12 sm:rounded-xl",
              "text-[16px] text-white outline-none focus-visible:ring-2 focus-visible:ring-white",
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
              "mt-1.5 h-[52px] w-full rounded-2xl border border-white/[0.12] bg-black/30 px-4 sm:h-12 sm:rounded-xl",
              "text-[16px] text-white outline-none focus-visible:ring-2 focus-visible:ring-white",
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
        <button
          type="submit"
          form="zenede-login"
          disabled={busy}
          className="outline-none disabled:opacity-50"
        >
          <ZenedeGlass variant="ctaPill" className="w-full sm:w-auto">
            <span className="flex min-h-[52px] items-center justify-center px-6 py-2.5 text-[15px] font-semibold text-zinc-950 sm:min-h-0">
              {busy ? "Signing in…" : "Continue"}
            </span>
          </ZenedeGlass>
        </button>
        <Link
          href="/"
          className="flex min-h-[48px] items-center justify-center rounded-2xl px-4 py-2 text-[15px] font-medium text-white/55 underline-offset-4 hover:text-white/85 hover:underline sm:min-h-0 sm:justify-start"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--tv-page-bg)] px-4 py-[max(2rem,env(safe-area-inset-top))] text-foreground sm:px-6 sm:py-16">
      <Suspense
        fallback={
          <div className="mx-auto text-[15px] text-white/50">Loading…</div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
