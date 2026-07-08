"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType } from "react";
import {
  Heart,
  Home,
  LayoutGrid,
  LibraryBig,
  Search,
  Settings,
  User,
} from "lucide-react";

import { GlassSearchModal } from "@/components/glass/glass-search-modal";
import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { WatchTogetherDialog } from "@/components/tv/watch-together-dialog";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";

function avatarLetter(username: string | undefined): string {
  const value = username?.trim() ?? "";
  return value ? value.charAt(0).toUpperCase() : "?";
}

type MobileNavItem = {
  label: string;
  href: string;
  active: boolean;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

export function MobileBrowseTopBar() {
  const pathname = usePathname();
  const { user, authEnabled } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);

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
      label: "DVR",
      href: "/recordings",
      active: pathname === "/recordings" || pathname.startsWith("/recordings/"),
      icon: LayoutGrid,
    },
  ];

  return (
    <>
      <GlassSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <WatchTogetherDialog open={boardOpen} onClose={() => setBoardOpen(false)} />

      <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <ZenedeGlass
          variant="panelCompact"
          className="pointer-events-auto rounded-[24px] border-white/[0.1] bg-black/50 shadow-[0_18px_52px_-20px_rgba(0,0,0,0.85)] transition-[box-shadow,transform,border-color] duration-300 ease-out hover:border-white/[0.14] hover:shadow-[0_22px_56px_-18px_rgba(0,0,0,0.88)]"
        >
          <div className="flex h-14 items-center justify-between px-3">
            <Link
              href="/"
              aria-label="Zenede home"
              className="flex min-w-0 items-center gap-2 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local brand SVG */}
              <img
                src="/zenede-logo.svg"
                alt=""
                width={225}
                height={82}
                className="block aspect-[225/82] w-8 shrink-0 object-contain"
                decoding="async"
              />
              <span className="truncate text-[17px] font-semibold tracking-tight text-white">
                Zenede
              </span>
            </Link>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBoardOpen(true)}
                className="flex size-11 items-center justify-center rounded-2xl text-white/78 outline-none transition-colors active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
                aria-label="Watch multiple channels"
              >
                <LayoutGrid className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="flex size-11 items-center justify-center rounded-2xl text-white/78 outline-none transition-colors active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
                aria-label="Search channels"
              >
                <Search className="size-5" aria-hidden />
              </button>
              <Link
                href="/settings"
                className="flex size-11 items-center justify-center rounded-2xl text-white/78 outline-none transition-colors active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
                aria-label="Settings"
              >
                <Settings className="size-5" aria-hidden />
              </Link>
              <Link
                href={authEnabled && !user ? "/login" : "/settings"}
                className="flex size-11 items-center justify-center rounded-2xl bg-white/[0.07] text-[13px] font-semibold text-white/88 outline-none ring-1 ring-white/[0.09] transition-colors active:bg-white/12 focus-visible:ring-2 focus-visible:ring-white"
                aria-label={user ? `Account (${user.username})` : "Account"}
              >
                {user ? (
                  avatarLetter(user.username)
                ) : (
                  <User className="size-5" aria-hidden />
                )}
              </Link>
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
          className="rounded-[26px] border-white/[0.1] bg-black/58 shadow-[0_-18px_52px_-24px_rgba(0,0,0,0.9)]"
        >
          <div className="grid grid-cols-4 gap-1 p-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-[20px] px-1 text-[11px] font-semibold outline-none transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-white",
                    item.active
                      ? "bg-white/[0.13] text-white shadow-inner shadow-white/[0.04]"
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
