"use client";

import { useEffect, useRef } from "react";

import { useAuth } from "@/features/auth/auth-context";
import { hydrateFavoritesFromServer } from "@/lib/favorites/favorites-store";
import { hydrateHistoryFromServer } from "@/lib/watch/viewing-stats";

/**
 * Fetches favorites and viewing history from the server once auth is ready,
 * seeding localStorage so all components see up-to-date cross-device data.
 * Re-runs on login (user identity change).
 */
export function UserDataSync() {
  const { ready, user, authEnabled } = useAuth();
  const lastSyncKey = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (user === null) {
      lastSyncKey.current = null;
      return;
    }
    // key: user id when auth enabled, "guest" when auth disabled
    const key = authEnabled ? (user?.id ?? null) : "guest";
    if (key === null) return; // auth enabled but not logged in yet
    if (key === lastSyncKey.current) return;
    lastSyncKey.current = key;
    void Promise.all([
      hydrateFavoritesFromServer(),
      hydrateHistoryFromServer(),
    ]);
  }, [ready, user, authEnabled]);

  return null;
}
