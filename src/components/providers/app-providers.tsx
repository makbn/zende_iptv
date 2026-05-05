"use client";

import type { ReactNode } from "react";

import { AuthGate, AuthProvider } from "@/features/auth/auth-context";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>{children}</AuthGate>
    </AuthProvider>
  );
}
