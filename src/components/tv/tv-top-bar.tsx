"use client";

import { Button, buttonVariants } from "@appica/ui-react/button";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AppicaSearchDialog } from "@/components/appica/search-dialog";
import { ThemeToggle } from "@/components/appica/theme-toggle";
import { WatchTogetherDialog } from "@/components/tv/watch-together-dialog";
import { useAuth } from "@/features/auth/auth-context";
import { LayoutGrid, LogOut, Search, Settings, User } from "lucide-react";
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

function HeaderUserMenu() {
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
        <span className={cn(buttonVariants({ variant: "ghost", size: "icon-md" }), "opacity-60")}>
          <User aria-hidden />
        </span>
      </div>
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        onClick={onNavigateClick("/login")}
        className={buttonVariants({ variant: "ghost", size: "icon-md" })}
        aria-label="Sign in"
      >
        <User aria-hidden />
      </Link>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <Button variant="ghost"
        size="icon-md"
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={signingOut}
        aria-label={`Account menu (${user.username})`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="text-sm font-semibold" aria-hidden>{letter}</span>
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
            className={cn(
              "flex w-full items-center gap-2 px-3.5 py-3 text-left text-[14px] font-semibold outline-none transition-colors",
              "text-foreground-intense hover:bg-background-muted focus-visible:bg-background-muted",
            )}
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
            className={cn(
              "flex w-full items-center gap-2 px-3.5 py-3 text-left text-[14px] font-semibold outline-none transition-colors",
              "text-foreground-intense hover:bg-background-muted focus-visible:bg-background-muted disabled:opacity-50",
            )}
          >
            <LogOut className="size-4 shrink-0 opacity-80" aria-hidden />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
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
        "relative flex h-16 items-center border-b-2 border-transparent px-1 text-sm font-medium text-foreground-muted outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-foreground-intense text-foreground-intense"
          : "hover:text-foreground-intense",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <AppicaSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      <WatchTogetherDialog open={boardOpen} onClose={() => setBoardOpen(false)} />
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 border-b border-border bg-background",
        )}
      >
        <div
          className={cn(
            BROWSE_CONTAINER_CLASS,
            "relative",
          )}
        >
          <div
            className={cn(
              "bg-background",
            )}
          >
            <div
              data-tv-layout="horizontal"
              className={cn(
                "flex h-16 w-full items-center justify-between",
              )}
            >
              <Link
                data-tv-initial-focus
                href="/"
                onClick={onNavigateClick("/")}
                aria-label="Zende home"
                className="flex shrink-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {/* block + aspect-ratio avoids baseline clipping; removed overflow-hidden on chrome (was cropping) */}
                <img
                  src="/zende-logo.svg"
                  alt=""
                  width={225}
                  height={82}
                  className="block aspect-[225/82] h-auto w-8 shrink-0 object-contain object-center"
                  decoding="async"
                  fetchPriority="high"
                />
                <span className="text-lg font-semibold tracking-tight text-foreground-intense">
                  Zende
                </span>
                <span className="hidden text-xs text-foreground-muted md:inline">
                  Live
                </span>
              </Link>
              <nav
                className="absolute left-1/2 flex max-w-[calc(100vw-18rem)] -translate-x-1/2 items-center gap-6 overflow-x-auto **:[scrollbar-width:none]"
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
                <ThemeToggle />
                <Button variant="ghost"
                  size="icon-md"
                  type="button"
                  onClick={() => setBoardOpen(true)}
                  aria-label="Watch multiple channels"
                >
                  <LayoutGrid aria-hidden />
                </Button>
                <Button variant="ghost"
                  size="icon-md"
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Search channels"
                >
                  <Search aria-hidden />
                </Button>
                <HeaderUserMenu />
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
