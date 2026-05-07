"use client";

import type { ReactNode } from "react";

import { AuthGate, AuthProvider } from "@/features/auth/auth-context";
import { UserDataSync } from "@/components/providers/user-data-sync";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <UserDataSync />
      <AuthGate>{children}</AuthGate>
    </AuthProvider>
  );
}
