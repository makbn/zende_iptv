"use client";

import { BrowseChrome } from "@/components/glass/browse-chrome";
import { TvTopBar } from "@/components/tv/tv-top-bar";

export default function BrowseLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <BrowseChrome>
      <TvTopBar />
      {children}
    </BrowseChrome>
  );
}
