"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

const DRAFT_DEBOUNCE_MS = 280;

/**
 * Separates what the user is typing (`draftQuery`) from what drives catalog fetches
 * (`appliedQuery`). Prevents router.replace → searchParams feedback from overwriting
 * the input while typing fast.
 */
export function useLibrarySearch(inputRef?: RefObject<HTMLInputElement | null>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [draftQuery, setDraftQuery] = useState(() => searchParams.get("q") ?? "");
  const [appliedQuery, setAppliedQuery] = useState(() => searchParams.get("q") ?? "");
  const pendingUrlQuery = useRef<string | null>(null);
  const skipInitialUrlWrite = useRef(true);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setAppliedQuery(draftQuery);
    }, DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [draftQuery]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (skipInitialUrlWrite.current) {
        skipInitialUrlWrite.current = false;
        return;
      }
      const trimmed = appliedQuery.trim();
      const current = searchParams.get("q") ?? "";
      if (trimmed === current) return;
      pendingUrlQuery.current = trimmed;
      const params = new URLSearchParams();
      if (trimmed) params.set("q", trimmed);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 120);
    return () => window.clearTimeout(id);
  }, [appliedQuery, pathname, router, searchParams]);

  useEffect(() => {
    const fromUrl = searchParams.get("q") ?? "";
    const pending = pendingUrlQuery.current;
    if (pending !== null) {
      if (fromUrl === pending) {
        pendingUrlQuery.current = null;
        return;
      }
    }
    const input = inputRef?.current;
    if (input && document.activeElement === input) return;
    setDraftQuery(fromUrl);
    setAppliedQuery(fromUrl);
  }, [searchParams, inputRef]);

  const clearSearch = useCallback(() => {
    setDraftQuery("");
    setAppliedQuery("");
  }, []);

  const isSearchPending = draftQuery.trim() !== appliedQuery.trim();

  return {
    draftQuery,
    setDraftQuery,
    appliedQuery,
    clearSearch,
    isSearchPending,
  };
}
