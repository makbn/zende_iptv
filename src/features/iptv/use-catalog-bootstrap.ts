"use client";

import { useEffect } from "react";

import type { BuiltinPlaylistSource } from "@/config/builtin-playlist-sources";
import { useCatalogContext } from "@/features/iptv/catalog-context";

export type UseCatalogBootstrapOptions = {
  /** Download full catalog JSON when this screen mounts (favorites, recordings). */
  ensureFull?: boolean;
};

export function useCatalogBootstrap(
  _source: BuiltinPlaylistSource,
  options?: UseCatalogBootstrapOptions,
) {
  const { ensureFullCatalog } = useCatalogContext();

  useEffect(() => {
    if (!options?.ensureFull) return;
    void ensureFullCatalog();
  }, [options?.ensureFull, ensureFullCatalog]);

  return useCatalogContext();
}
