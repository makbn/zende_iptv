"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Clapperboard,
  Heart,
  Home,
  LayoutGrid,
  LibraryBig,
  LogOut,
  Radio,
  Search,
  Settings,
  User,
} from "lucide-react";

import { GlassSearchModal } from "@/components/glass/glass-search-modal";
import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { WatchTogetherDialog } from "@/components/tv/watch-together-dialog";
import { useAuth } from "@/features/auth/auth-context";
import { useRemoteNavigation } from "@/lib/navigation/use-remote-navigation";
import { cn } from "@/lib/utils";

function avatarLetter(username: string | undefined): string {
  const value = username?.trim() ?? "";
  return value ? value.charAt(0).toUpperCase() : "?";
}

function MobileUserMenu() {
  const { user, authEnabled, logout } = useAuth();
  const { onNavigateClick } = useRemoteNavigation();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!authEnabled) {
    return (
      <div
        className="zen-focus-ring flex size-11 items-center justify-center rounded-full bg-white/[0.06] text-white/45 outline-none ring-1 ring-white/[0.08]"
        aria-hidden
        title="Sign-in disabled"
      >
        <User className="size-5" aria-hidden />
      </div>
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="zen-focus-ring flex size-11 items-center justify-center rounded-full bg-white/[0.09] text-white/78 outline-none ring-1 ring-white/[0.11] transition-colors active:bg-white/14"
        aria-label="Sign in"
      >
        <User className="size-5" aria-hidden />
      </Link>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        disabled={signingOut}
        onClick={() => setOpen((value) => !value)}
        className="zen-focus-ring flex size-11 items-center justify-center rounded-full bg-white/[0.09] text-[13px] font-semibold text-white/88 outline-none ring-1 ring-white/[0.11] transition-colors active:bg-white/14 disabled:opacity-60"
        aria-label={`Account menu (${user.username})`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {avatarLetter(user.username)}
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className={cn(
            "absolute right-0 top-[calc(100%+10px)] z-[60] min-w-[12.5rem] overflow-hidden rounded-[22px]",
            "border border-white/[0.13] bg-black/86 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.9)]",
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
            className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-[14px] font-semibold text-white/85 outline-none transition-colors hover:bg-white/[0.09] focus-visible:bg-white/[0.09]"
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
            className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-[14px] font-semibold text-white/85 outline-none transition-colors hover:bg-white/[0.09] focus-visible:bg-white/[0.09] disabled:opacity-50"
          >
            <LogOut className="size-4 shrink-0 opacity-80" aria-hidden />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

type MobileNavItem = {
  label: string;
  href: string;
  active: boolean;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

export function MobileBrowseTopBar() {
  const pathname = usePathname();
  const { onNavigateClick } = useRemoteNavigation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const nextScrollY = window.scrollY || document.documentElement.scrollTop;
      const previousScrollY = lastScrollYRef.current;
      const delta = nextScrollY - previousScrollY;

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

  const navItems: MobileNavItem[] = [
    {
      label: "Home",
      href: "/",
      active: pathname === "/",
      icon: Home,
    },
    {
      label: "Library",
      href: "/library",
      active: pathname === "/library" || pathname.startsWith("/library/"),
      icon: LibraryBig,
    },
    {
      label: "Favorites",
      href: "/favorites",
      active: pathname === "/favorites" || pathname.startsWith("/favorites/"),
      icon: Heart,
    },
    {
      label: "Guide",
      href: "/guide",
      active: pathname === "/guide" || pathname.startsWith("/guide/"),
      icon: Radio,
    },
    {
      label: "Recordings",
      href: "/recordings",
      active: pathname === "/recordings" || pathname.startsWith("/recordings/"),
      icon: Clapperboard,
    },
  ];

  return (
    <>
      <GlassSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <WatchTogetherDialog open={boardOpen} onClose={() => setBoardOpen(false)} />

      <header
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]",
          "transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          headerVisible || searchOpen || boardOpen
            ? "translate-y-0 opacity-100"
            : "-translate-y-[calc(100%+1rem)] opacity-0",
        )}
      >
        <ZenedeGlass
          variant="panelCompact"
          className="pointer-events-auto rounded-[26px] border-white/[0.12] bg-black/54 shadow-[0_20px_64px_-26px_rgba(0,0,0,0.9)] transition-[box-shadow,transform,border-color] duration-300 ease-out hover:border-white/[0.16]"
        >
          <div className="flex h-[60px] items-center justify-between px-3">
            <Link
              href="/"
              onClick={onNavigateClick("/")}
              aria-label="Zenede home"
              className="zen-focus-ring flex min-w-0 items-center gap-2 rounded-full outline-none"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local brand SVG */}
              <img
                src="/zenede-logo.svg"
                alt=""
                width={225}
                height={82}
                className="block aspect-[225/82] w-9 shrink-0 object-contain drop-shadow-[0_0_16px_rgba(56,217,255,0.22)]"
                decoding="async"
              />
              <span className="truncate text-[18px] font-semibold tracking-[-0.04em] text-white">
                Zenede
              </span>
            </Link>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBoardOpen(true)}
                className="zen-focus-ring flex size-11 items-center justify-center rounded-full text-white/78 outline-none transition-colors active:bg-white/10"
                aria-label="Multi-view"
              >
                <LayoutGrid className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="zen-focus-ring flex size-11 items-center justify-center rounded-full text-white/78 outline-none transition-colors active:bg-white/10"
                aria-label="Search channels"
              >
                <Search className="size-5" aria-hidden />
              </button>
              <MobileUserMenu />
            </div>
          </div>
        </ZenedeGlass>
      </header>

      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
      >
        <ZenedeGlass
          variant="panelCompact"
          className="rounded-[30px] border-white/[0.12] bg-black/62 shadow-[0_-20px_64px_-28px_rgba(0,0,0,0.95)]"
        >
          <div className="grid grid-cols-5 gap-1.5 p-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigateClick(item.href)}
                  aria-current={item.active ? "page" : undefined}
                  className={cn(
                    "zen-focus-ring flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[23px] px-1 text-[11px] font-semibold outline-none transition-[color,background-color,transform]",
                    item.active
                      ? "bg-white/[0.14] text-white shadow-inner shadow-white/[0.05]"
                      : "text-white/48 active:bg-white/[0.08] active:text-white/85",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </ZenedeGlass>
      </nav>
    </>
  );
}
