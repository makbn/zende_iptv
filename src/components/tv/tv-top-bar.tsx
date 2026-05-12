"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { GlassSearchModal } from "@/components/glass/glass-search-modal";
import { WatchTogetherDialog } from "@/components/tv/watch-together-dialog";
import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { useAuth } from "@/features/auth/auth-context";
import { LayoutGrid, LogOut, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";

function avatarLetter(username: string | undefined): string {
  const t = username?.trim() ?? "";
  if (!t) return "?";
  return t.charAt(0).toUpperCase();
}

function HeaderUserMenu({ compact }: { compact: boolean }) {
  const { user, authEnabled, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const letter = avatarLetter(user?.username);

  if (!authEnabled) {
    return (
      <div
        className="relative outline-none"
        title="Sign-in disabled"
        aria-hidden
      >
        <ZenedeGlass variant="iconChip" className="size-9 opacity-60">
          <span className="flex size-9 items-center justify-center text-white/55">
            <User size={18} strokeWidth={2.25} aria-hidden />
          </span>
        </ZenedeGlass>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative outline-none" aria-hidden>
        <ZenedeGlass variant="iconChip" className="size-9 opacity-60">
          <span className="flex size-9 items-center justify-center text-white/55">
            <User size={18} strokeWidth={2.25} aria-hidden />
          </span>
        </ZenedeGlass>
      </div>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={signingOut}
        className="group relative outline-none disabled:opacity-60"
        aria-label={`Account menu (${user.username})`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <ZenedeGlass variant="iconChip" className="size-9">
          <span
            className={cn(
              "flex size-9 items-center justify-center text-[13px] font-semibold text-white/95 transition-colors group-hover:text-white group-focus-visible:text-white",
              compact && "text-[12px]",
            )}
            aria-hidden
          >
            {letter}
          </span>
        </ZenedeGlass>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className={cn(
            "absolute right-0 top-[calc(100%+8px)] z-[60] min-w-[11.5rem] overflow-hidden rounded-xl",
            "border border-white/[0.12] bg-black/85 shadow-[0_20px_48px_-16px_rgba(0,0,0,0.75)]",
            "backdrop-blur-xl backdrop-saturate-150 ring-1 ring-white/[0.06]",
          )}
        >
          <p className="border-b border-white/[0.08] px-3 py-2 text-[12px] text-white/45">
            Signed in as{" "}
            <span className="font-medium text-white/90">{user.username}</span>
          </p>
          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              void logout().finally(() => {
                setSigningOut(false);
                setOpen(false);
              });
            }}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] font-medium outline-none transition-colors",
              "text-white/85 hover:bg-white/[0.08] focus-visible:bg-white/[0.08] disabled:opacity-50",
            )}
          >
            <LogOut className="size-4 shrink-0 opacity-80" aria-hidden />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Vertical clearance for page content below the floating nav (Tailwind `pt-20` / `top-20`). */
export const TV_BROWSE_TOP_PAD_CLASS = "pt-20";
export const TV_BROWSE_STICKY_TOP_CLASS = "top-20";

export function TvTopBar() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setScrollY(window.scrollY || document.documentElement.scrollTop);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /** 0 = top of page, 1 = fully “scrolled” look */
  const scrollT = Math.min(1, scrollY / 72);
  const compact = scrollY > 8;

  const homeActive = pathname === "/";
  const libraryActive = pathname === "/library";
  const favoritesActive = pathname === "/favorites";
  const recordingsActive = pathname === "/recordings";

  const navLink = (
    label: string,
    active: boolean,
    href: string,
    id?: string,
  ) => (
    <Link
      key={id ?? href}
      href={href}
      className={cn(
        "rounded-lg px-3 py-1.5 text-[15px] font-medium outline-none transition-[color,transform] duration-300",
        "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/80",
        active ? "text-white" : "text-white/45 hover:text-white/75",
        compact && active && "scale-[1.02]",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <GlassSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <WatchTogetherDialog open={boardOpen} onClose={() => setBoardOpen(false)} />
      <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
        <div
          className={cn(
            "pointer-events-auto mx-auto max-w-[min(100%-1.25rem,1920px)] transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:max-w-[min(100%-2rem,1920px)]",
            compact ? "px-2.5 pt-2 sm:px-3" : "px-3 pt-3 sm:px-4 sm:pt-4",
          )}
        >
          <div
            className={cn(
              "border border-white/[0.12] bg-black/45 ring-1 ring-white/[0.06]",
              "backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-black/35",
              "transition-[border-radius,box-shadow,transform,background-color,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
              compact
                ? "rounded-[1.125rem] shadow-[0_14px_44px_-10px_rgba(0,0,0,0.62)]"
                : "rounded-[1.65rem] shadow-[0_20px_56px_-18px_rgba(0,0,0,0.48)]",
            )}
            style={{
              transform: `scale(${1 - scrollT * 0.012}) translateY(${scrollT * -1}px)`,
            }}
          >
            <div
              className={cn(
                "mx-auto flex max-w-[1920px] items-center justify-between transition-[height,padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                compact ? "h-[48px] px-3 sm:px-5" : "h-[52px] px-4 sm:px-6 lg:px-8 xl:px-10",
              )}
            >
              <Link
                href="/"
                aria-label="Zenede home"
                className="flex shrink-0 items-center gap-2 outline-none transition-opacity duration-300 hover:opacity-95 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent sm:gap-2.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local brand SVG */}
                {/* block + aspect-ratio avoids baseline clipping; removed overflow-hidden on chrome (was cropping) */}
                <img
                  src="/zenede-logo.svg"
                  alt=""
                  width={225}
                  height={82}
                  className="block aspect-[225/82] h-auto w-8 max-h-none shrink-0 object-contain object-center"
                  decoding="async"
                  fetchPriority="high"
                />
                <span className="text-[17px] font-semibold tracking-tight text-white">
                  Zenede
                </span>
                <span className="hidden text-[13px] font-medium tracking-wide text-white/35 md:inline">
                  IPTV
                </span>
              </Link>
              <nav
                className="absolute left-1/2 flex max-w-[calc(100vw-10rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto md:gap-1 [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: "none" }}
                aria-label="Main"
              >
                {navLink("Home", homeActive, "/", "nav-home")}
                {navLink("Library", libraryActive, "/library", "nav-library")}
                {navLink("Favorites", favoritesActive, "/favorites", "nav-favorites")}
                {navLink("Recordings", recordingsActive, "/recordings", "nav-recordings")}
              </nav>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBoardOpen(true)}
                  className="group relative outline-none"
                  aria-label="Watch multiple channels"
                >
                  <ZenedeGlass variant="iconChip" className="size-9">
                    <span className="flex size-9 items-center justify-center text-white/80 transition-colors group-hover:text-white">
                      <LayoutGrid size={18} strokeWidth={2.25} aria-hidden />
                    </span>
                  </ZenedeGlass>
                </button>
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="group relative outline-none"
                  aria-label="Search channels"
                >
                  <ZenedeGlass variant="iconChip" className="size-9">
                    <span className="flex size-9 items-center justify-center text-white/80 transition-colors group-hover:text-white">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.25"
                        strokeLinecap="round"
                        aria-hidden
                      >
                        <circle cx="11" cy="11" r="7.25" />
                        <path d="m20 20-4.2-4.2" />
                      </svg>
                    </span>
                  </ZenedeGlass>
                </button>
                <Link
                  href="/settings"
                  className="group relative outline-none"
                  aria-label="Settings"
                >
                  <ZenedeGlass variant="iconChip" className="size-9">
                    <span className="flex size-9 items-center justify-center text-white/80 transition-colors group-hover:text-white">
                      <Settings size={18} strokeWidth={2.25} aria-hidden />
                    </span>
                  </ZenedeGlass>
                </Link>
                <HeaderUserMenu compact={compact} />
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
