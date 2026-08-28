"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Toaster, ToastProvider } from "@appica/ui-react/toast";

import { AuthGate, AuthProvider } from "@/features/auth/auth-context";
import { CatalogProvider } from "@/features/iptv/catalog-context";
import { RemoteControlProvider } from "@/features/remote/remote-control-context";
import { UserDataSync } from "@/components/providers/user-data-sync";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";

const catalogSource = BUILTIN_PLAYLIST_SOURCES[0]!;

function AppToaster() {
  const [fullscreenContainer, setFullscreenContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const syncContainer = () => {
      const webkitDocument = document as Document & { webkitFullscreenElement?: Element | null };
      const target = document.fullscreenElement ?? webkitDocument.webkitFullscreenElement ?? null;
      setFullscreenContainer(target instanceof HTMLElement ? target : null);
    };
    document.addEventListener("fullscreenchange", syncContainer);
    document.addEventListener("webkitfullscreenchange", syncContainer);
    return () => {
      document.removeEventListener("fullscreenchange", syncContainer);
      document.removeEventListener("webkitfullscreenchange", syncContainer);
    };
  }, []);

  return (
    <Toaster
      position="top-right"
      progress
      timeout={8000}
      {...(fullscreenContainer ? { container: fullscreenContainer } : {})}
    />
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider timeout={8000}>
      <AuthProvider>
        <CatalogProvider source={catalogSource}>
          <UserDataSync />
          <RemoteControlProvider>
            <AuthGate>{children}</AuthGate>
          </RemoteControlProvider>
        </CatalogProvider>
      </AuthProvider>
      <AppToaster />
    </ToastProvider>
  );
}
