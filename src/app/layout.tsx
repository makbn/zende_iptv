import type { Metadata } from "next";
import { Suspense } from "react";

import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { FullPageLoadOverlay } from "@/components/loading/full-page-load-overlay";
import { ZendeLoadingState } from "@/components/loading/zende-spinner";
import { WatchBrowseOriginTracker } from "@/lib/navigation/watch-browse-origin";

export const metadata: Metadata = {
  title: "Zende",
  description:
    "IPTV streaming with Apple TV–style UI, resilient playback, and APIs for companion apps.",
  icons: {
    icon: [{ url: "/zende-logo.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full">
      <body className="flex min-h-full flex-col">
        <FullPageLoadOverlay />
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center bg-[var(--tv-page-bg)]">
              <ZendeLoadingState size="full" label="Loading Zende" />
            </div>
          }
        >
          <AppProviders>
            <WatchBrowseOriginTracker />
            {children}
          </AppProviders>
        </Suspense>
      </body>
    </html>
  );
}
