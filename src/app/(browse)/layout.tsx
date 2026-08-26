"use client";

import { AppShell } from "@/components/layout/app-shell";
import { MobileBrowseTopBar } from "@/components/mobile/mobile-browse-top-bar";
import { TvTopBar } from "@/components/tv/tv-top-bar";

export default function BrowseLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AppShell>
      <div className="md:hidden">
        <MobileBrowseTopBar />
      </div>
      <div className="hidden md:block">
        <TvTopBar />
      </div>
      {children}
    </AppShell>
  );
}
