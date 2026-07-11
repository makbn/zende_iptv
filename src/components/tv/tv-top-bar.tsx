"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { GlassSearchModal } from "@/components/glass/glass-search-modal";
import { WatchTogetherDialog } from "@/components/tv/watch-together-dialog";
import { ZendeGlass } from "@/components/glass/zende-glass";
import { useAuth } from "@/features/auth/auth-context";
import { LayoutGrid, LogOut, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { BROWSE_CONTAINER_CLASS } from "@/components/layout/browse-page-shell";
import { useRemoteNavigation } from "@/lib/navigation/use-remote-navigation";

export {
  BROWSE_TOP_PAD as TV_BROWSE_TOP_PAD_CLASS,
  BROWSE_STICKY_TOP as TV_BROWSE_STICKY_TOP_CLASS,
} from "@/components/layout/browse-page-shell";

function avatarLetter(username: string | undefined): string {
  const t = username?.trim() ?? "";
  if (!t) return "?";
  return t.charAt(0).toUpperCase();
}

function HeaderUserMenu({ compact }: { compact: boolean }) {
  const { user, authEnabled, logout } = useAuth();
  const { onNavigateClick } = useRemoteNavigation();
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
        <ZendeGlass variant="iconChip" className="size-9 opacity-60">
          <span className="flex size-9 items-center justify-center text-white/55">
            <User size={18} strokeWidth={2.25} aria-hidden />
          </span>
        </ZendeGlass>
      </div>
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        onClick={onNavigateClick("/login")}
        className="group relative outline-none"
        aria-label="Sign in"
      >
        <ZendeGlass variant="iconChip" className="size-9 opacity-80">
          <span className="flex size-9 items-center justify-center text-white/70 transition-colors group-hover:text-white">
            <User size={18} strokeWidth={2.25} aria-hidden />
          </span>
        </ZendeGlass>
      </Link>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={signingOut}
        className="group zen-focus-ring relative rounded-full outline-none disabled:opacity-60"
        aria-label={`Account menu (${user.username})`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <ZendeGlass variant="iconChip" className="size-10">
          <span
            className={cn(
              "flex size-10 items-center justify-center text-[13px] font-semibold text-white/95 transition-colors group-hover:text-white group-focus-visible:text-white",
              compact && "text-[12px]",
            )}
            aria-hidden
          >
            {letter}
          </span>
        </ZendeGlass>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className={cn(
            "absolute right-0 top-[calc(100%+10px)] z-[60] min-w-[12.5rem] overflow-hidden rounded-[22px]",
            "border border-white/[0.13] bg-black/82 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.88)]",
            "backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/[0.06]",
          )}
        >
          <p className="border-b border-white/[0.08] px-3.5 py-3 text-[12px] leading-relaxed text-white/48">
            Signed in as{" "}
            <span className="font-medium text-white/90">{user.username}</span>
          </p>
          <Link
            href="/settings"
            role="menuitem"
            onClick={(event) => {
              onNavigateClick("/settings")(event);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 px-3.5 py-3 text-left text-[14px] font-semibold outline-none transition-colors",
              "text-white/85 hover:bg-white/[0.09] focus-visible:bg-white/[0.09]",
            )}
          >
            <Settings className="size-4 shrink-0 opacity-80" aria-hidden />
            Settings
          </Link>
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
              "flex w-full items-center gap-2 px-3.5 py-3 text-left text-[14px] font-semibold outline-none transition-colors",
              "text-white/85 hover:bg-white/[0.09] focus-visible:bg-white/[0.09] disabled:opacity-50",
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

export function TvTopBar() {
  const pathname = usePathname();
  const { onNavigateClick } = useRemoteNavigation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);

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
      const nextScrollY = window.scrollY || document.documentElement.scrollTop;
      const previousScrollY = lastScrollYRef.current;
      const delta = nextScrollY - previousScrollY;

      setScrollY(nextScrollY);
      if (nextScrollY < 24) {
        setHeaderVisible(true);
      } else if (delta > 6) {
        setHeaderVisible(false);
      } else if (delta < -4) {
        setHeaderVisible(true);
      }
      lastScrollYRef.current = nextScrollY;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /** 0 = top of page, 1 = fully “scrolled” look */
  const scrollT = Math.min(1, scrollY / 72);
  const compact = scrollY > 8;
  const navVisible = headerVisible || searchOpen || boardOpen;

  const homeActive = pathname === "/";
  const libraryActive =
    pathname === "/library" || pathname.startsWith("/library/");
  const favoritesActive =
    pathname === "/favorites" || pathname.startsWith("/favorites/");
  const guideActive = pathname === "/guide" || pathname.startsWith("/guide/");
  const recordingsActive =
    pathname === "/recordings" || pathname.startsWith("/recordings/");

  const navLink = (
    label: string,
    active: boolean,
    href: string,
    id?: string,
  ) => (
    <Link
      key={id ?? href}
      href={href}
      onClick={onNavigateClick(href)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative rounded-full px-3.5 py-2 text-[14px] font-semibold outline-none transition-[color,transform,background-color,box-shadow] duration-300",
        "focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-black/80",
        active
          ? "bg-white/[0.12] text-white shadow-inner shadow-white/[0.04]"
          : "text-white/48 hover:bg-white/[0.06] hover:text-white/82",
        compact && active && "scale-[1.015]",
      )}
    >
      {active ? (
        <span className="absolute inset-x-4 -bottom-px h-px bg-gradient-to-r from-transparent via-[var(--zen-signal)] to-transparent" />
      ) : null}
      {label}
    </Link>
  );

  return (
    <>
      <GlassSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <WatchTogetherDialog open={boardOpen} onClose={() => setBoardOpen(false)} />
      <header
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-50 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          navVisible ? "translate-y-0 opacity-100" : "-translate-y-[calc(100%+1rem)] opacity-0",
        )}
      >
        <div
          className={cn(
            BROWSE_CONTAINER_CLASS,
            "pointer-events-auto transition-[padding-top] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            compact ? "pt-2" : "pt-3 sm:pt-4",
          )}
        >
          <div
            className={cn(
              "border border-white/[0.13] bg-black/48 ring-1 ring-white/[0.07]",
              "backdrop-blur-xl supports-[backdrop-filter]:bg-black/38",
              "transition-[border-radius,box-shadow,transform,background-color,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
              compact
                ? "rounded-[1.25rem] shadow-[0_16px_54px_-18px_rgba(0,0,0,0.78)]"
                : "rounded-[1.85rem] shadow-[0_24px_72px_-28px_rgba(0,0,0,0.72)]",
            )}
            style={{
              transform: `scale(${1 - scrollT * 0.012}) translateY(${scrollT * -1}px)`,
            }}
          >
            <div
              className={cn(
                "flex w-full items-center justify-between transition-[height,padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                compact ? "h-[50px] px-3 sm:px-5" : "h-[58px] px-4 sm:px-5 lg:px-6",
              )}
            >
              <Link
                href="/"
                onClick={onNavigateClick("/")}
                aria-label="Zende home"
                className="zen-focus-ring flex shrink-0 items-center gap-2 rounded-full outline-none transition-opacity duration-300 hover:opacity-95 sm:gap-2.5"
              >
                {/* block + aspect-ratio avoids baseline clipping; removed overflow-hidden on chrome (was cropping) */}
                <img
                  src="/zende-logo.svg"
                  alt=""
                  width={225}
                  height={82}
                  className="block aspect-[225/82] h-auto w-9 max-h-none shrink-0 object-contain object-center drop-shadow-[0_0_18px_rgba(56,217,255,0.22)]"
                  decoding="async"
                  fetchPriority="high"
                />
                <span className="text-[18px] font-semibold tracking-[-0.04em] text-white">
                  Zende
                </span>
                <span className="zen-kicker hidden md:inline">
                  Live
                </span>
              </Link>
              <nav
                className="absolute left-1/2 flex max-w-[calc(100vw-11rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full border border-white/[0.07] bg-white/[0.035] p-1 md:gap-1 [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: "none" }}
                aria-label="Main"
              >
                {navLink("Home", homeActive, "/", "nav-home")}
                {navLink("Library", libraryActive, "/library", "nav-library")}
                {navLink("Favorites", favoritesActive, "/favorites", "nav-favorites")}
                {navLink("Guide", guideActive, "/guide", "nav-guide")}
                {navLink("Recordings", recordingsActive, "/recordings", "nav-recordings")}
              </nav>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBoardOpen(true)}
                  className="group zen-focus-ring relative rounded-full outline-none"
                  aria-label="Watch multiple channels"
                >
                  <ZendeGlass variant="iconChip" className="size-10">
                    <span className="flex size-10 items-center justify-center text-white/78 transition-colors group-hover:text-white">
                      <LayoutGrid size={18} strokeWidth={2.25} aria-hidden />
                    </span>
                  </ZendeGlass>
                </button>
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="group zen-focus-ring relative rounded-full outline-none"
                  aria-label="Search channels"
                >
                  <ZendeGlass variant="iconChip" className="size-10">
                    <span className="flex size-10 items-center justify-center text-white/78 transition-colors group-hover:text-white">
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
                  </ZendeGlass>
                </button>
                <HeaderUserMenu compact={compact} />
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
