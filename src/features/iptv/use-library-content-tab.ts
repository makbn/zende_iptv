"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { LibraryContentTab } from "@/features/iptv/use-library-catalog";

const VALID_TABS = new Set<LibraryContentTab>(["all", "live", "movie", "series"]);

function tabFromParam(value: string | null): LibraryContentTab {
  if (value && VALID_TABS.has(value as LibraryContentTab)) {
    return value as LibraryContentTab;
  }
  return "all";
}

/** Sync library content tab with `?tab=` in the URL (e.g. back from show detail). */
export function useLibraryContentTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [contentTab, setContentTabState] = useState<LibraryContentTab>(() =>
    tabFromParam(searchParams.get("tab")),
  );

  useEffect(() => {
    setContentTabState(tabFromParam(searchParams.get("tab")));
  }, [searchParams]);

  const setContentTab = useCallback(
    (tab: LibraryContentTab) => {
      setContentTabState(tab);
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "all") params.delete("tab");
      else params.set("tab", tab);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { contentTab, setContentTab };
}
