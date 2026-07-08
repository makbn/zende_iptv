"use client";

import type { ReactNode } from "react";

import { AuthGate, AuthProvider } from "@/features/auth/auth-context";
import { CatalogProvider } from "@/features/iptv/catalog-context";
import { UserDataSync } from "@/components/providers/user-data-sync";
import { BUILTIN_PLAYLIST_SOURCES } from "@/config/builtin-playlist-sources";

const catalogSource = BUILTIN_PLAYLIST_SOURCES[0]!;

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CatalogProvider source={catalogSource}>
        <UserDataSync />
        <AuthGate>{children}</AuthGate>
      </CatalogProvider>
    </AuthProvider>
  );
}
