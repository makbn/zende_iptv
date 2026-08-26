"use client";

import { Input } from "@appica/ui-react/input";
import { Checkbox } from "@appica/ui-react/checkbox";

import { useCallback, useEffect, useState } from "react";

import {
  readUnwrapPublicCorsProxyUrlsPref,
  writeUnwrapPublicCorsProxyUrlsPref,
} from "@/lib/stream/unwrap-public-cors-proxy-pref";
import { cn } from "@/lib/utils";

/**
 * Catalog streams sometimes use a public CORS bridge (`https://proxy/http://real…/playlist.m3u8`).
 * Server-side playback can unwrap to the inner URL; this card toggles that behavior.
 */
export function TvPlaybackPrefsCard() {
  const [unwrap, setUnwrap] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUnwrap(readUnwrapPublicCorsProxyUrlsPref());
    setMounted(true);
  }, []);

  const onToggle = useCallback((next: boolean) => {
    setUnwrap(next);
    writeUnwrapPublicCorsProxyUrlsPref(next);
  }, []);

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-background-muted p-6 ring-1 ring-border",
        !mounted && "opacity-0",
        mounted && "opacity-100 transition-opacity duration-200",
      )}
      aria-labelledby="playback-prefs-heading"
    >
      <h2
        id="playback-prefs-heading"
        className="text-[18px] font-semibold text-foreground-intense"
      >
        Stream URL handling
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-foreground-intense">
        Some catalogs wrap the real playlist in a public CORS proxy (for example{" "}
        <span className="font-mono text-[13px] text-foreground-intense">
          https://cors-proxy…/http://…/playlist.m3u8
        </span>
        ). Zende fetches streams on the server, so that wrapper is usually unnecessary and can
        be stripped to the direct URL. Turn this off only if your server must load the wrapper
        URL itself.
      </p>

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background px-4 py-3.5 transition-colors hover:border-border">
        <Checkbox
          className="mt-1 shrink-0"
          checked={unwrap}
          onCheckedChange={(checked) => onToggle(checked === true)}
        />
        <span className="min-w-0">
          <span className="block text-[15px] font-medium text-foreground-intense">
            Unwrap public CORS-proxy URLs for server playback
          </span>
          <span className="mt-1 block text-[13px] leading-relaxed text-foreground-intense">
            When checked, the inner{" "}
            <span className="font-mono text-foreground-intense">http(s)://…</span> target is used for the
            stream session and proxy. VPN channel assignments still match the original catalog
            URL.
          </span>
        </span>
      </label>

      {!unwrap && (
        <div className="mt-4 rounded-xl border border-warning bg-warning-subtle px-4 py-3 text-[13px] leading-relaxed text-warning-strong">
          With unwrapping off, the server requests the exact URL from the catalog — including
          any public CORS proxy prefix.
        </div>
      )}
    </section>
  );
}
