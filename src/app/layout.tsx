import type { Metadata } from "next";
import { Suspense } from "react";

import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { FullPageLoadOverlay } from "@/components/loading/full-page-load-overlay";
import { ZendeLoadingState } from "@/components/loading/zende-spinner";
import { WatchBrowseOriginTracker } from "@/lib/navigation/watch-browse-origin";
import { ThemeProvider } from "@appica/ui-react/providers/theme-provider";

export const metadata: Metadata = {
  title: "Zende",
  description:
    "A polished IPTV dashboard for live channels, movies, series, and recordings.",
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
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <ThemeProvider defaultTheme="system" enableSystem disableTransitionOnChange>
          <FullPageLoadOverlay />
          <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center bg-background">
              <ZendeLoadingState size="full" label="Loading Zende" />
            </div>
          }
        >
          <AppProviders>
            <WatchBrowseOriginTracker />
            {children}
          </AppProviders>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
