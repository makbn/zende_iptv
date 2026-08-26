"use client";

import { Button } from "@appica/ui-react/button";

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
  TvMinimal,
  User,
} from "lucide-react";

import { AppicaSearchDialog } from "@/components/appica/search-dialog";
import { ThemeToggle } from "@/components/appica/theme-toggle";
import { Card } from "@appica/ui-react/card";
import { WatchTogetherDialog } from "@/components/tv/watch-together-dialog";
import { useAuth } from "@/features/auth/auth-context";
import { useRemoteControl } from "@/features/remote/remote-control-context";
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
        className="focus-visible:ring-2 focus-visible:ring-ring flex size-11 items-center justify-center rounded-full bg-background-muted text-foreground-intense outline-none ring-1 ring-border"
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
        className="focus-visible:ring-2 focus-visible:ring-ring flex size-11 items-center justify-center rounded-full bg-background-muted text-foreground-intense outline-none ring-1 ring-border transition-colors active:bg-background-muted"
        aria-label="Sign in"
      >
        <User className="size-5" aria-hidden />
      </Link>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <Button variant="ghost"
        type="button"
        disabled={signingOut}
        onClick={() => setOpen((value) => !value)}
        className="focus-visible:ring-2 focus-visible:ring-ring flex size-11 items-center justify-center rounded-full bg-background-muted text-[13px] font-semibold text-foreground-intense outline-none ring-1 ring-border transition-colors active:bg-background-muted disabled:opacity-60"
        aria-label={`Account menu (${user.username})`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {avatarLetter(user.username)}
      </Button>
      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className={cn(
            "absolute right-0 top-[calc(100%+10px)] z-[60] min-w-[12.5rem] overflow-hidden rounded-lg",
            "border border-border bg-background shadow-lg",
            "backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-border",
          )}
        >
          <p className="border-b border-border px-3.5 py-3 text-[12px] leading-relaxed text-foreground-intense">
            Signed in as{" "}
            <span className="font-medium text-foreground-intense">{user.username}</span>
          </p>
          <Link
            href="/settings"
            role="menuitem"
            onClick={(event) => {
              onNavigateClick("/settings")(event);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-[14px] font-semibold text-foreground-intense outline-none transition-colors hover:bg-background-muted focus-visible:bg-background-muted"
          >
            <Settings className="size-4 shrink-0 opacity-80" aria-hidden />
            Settings
          </Link>
          <Button variant="ghost"
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
            className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-[14px] font-semibold text-foreground-intense outline-none transition-colors hover:bg-background-muted focus-visible:bg-background-muted disabled:opacity-50"
          >
            <LogOut className="size-4 shrink-0 opacity-80" aria-hidden />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
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
  const remote = useRemoteControl();
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
      <AppicaSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      <WatchTogetherDialog open={boardOpen} onClose={() => setBoardOpen(false)} />

      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background">
          <div className="flex h-16 items-center justify-between px-4">
            <Link
              href="/"
              onClick={onNavigateClick("/")}
              aria-label="Zende home"
              className="flex min-w-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local brand SVG */}
              <img
                src="/zende-logo.svg"
                alt=""
                width={225}
                height={82}
                className="block aspect-[225/82] w-8 shrink-0 object-contain"
                decoding="async"
              />
              <span className="truncate text-lg font-semibold tracking-tight text-foreground-intense">
                Zende
              </span>
            </Link>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="ghost"
                size="icon-md"
                type="button"
                onClick={() => setBoardOpen(true)}
                aria-label="Multi-view"
              >
                <LayoutGrid className="size-5" aria-hidden />
              </Button>
              <Button variant="ghost"
                size="icon-md"
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search channels"
              >
                <Search className="size-5" aria-hidden />
              </Button>
              <MobileUserMenu />
            </div>
          </div>
      </header>

      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
      >
        <Card frame="solid">
          <div className="grid grid-cols-6 gap-1 p-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigateClick(item.href)}
                  aria-current={item.active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg px-1 text-xs font-semibold tracking-tight outline-none transition-[color,background-color,transform] focus-visible:ring-2 focus-visible:ring-ring",
                    item.active
                      ? "bg-background-muted text-foreground-intense"
                      : "text-foreground-intense active:bg-background-muted active:text-foreground-intense",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              );
            })}
            <Button variant="ghost"
              type="button"
              onClick={() => void remote?.requestRemoteControlToggle()}
              aria-pressed={remote?.remoteControlActive ?? false}
              aria-label={
                remote?.remoteControlActive
                  ? "Disable TV remote control"
                  : "Enable TV remote control"
              }
              className={cn(
                "flex min-h-14 min-w-0 w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg px-1 text-xs font-semibold tracking-tight outline-none transition-[color,background-color,transform] focus-visible:ring-2 focus-visible:ring-ring",
                remote?.remoteControlActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground-intense active:bg-background-muted active:text-foreground-intense",
              )}
            >
              <TvMinimal className="size-5" aria-hidden />
              <span className="max-w-full truncate">{remote?.remoteControlActive ? "Remote on" : "Remote"}</span>
            </Button>
          </div>
        </Card>
      </nav>
    </>
  );
}
