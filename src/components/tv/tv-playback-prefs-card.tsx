"use client";

import { Checkbox } from "@appica/ui-react/checkbox";

import { useCallback, useEffect, useState } from "react";

import {
  readHdrToneMapPref,
  writeHdrToneMapPref,
} from "@/lib/playback/hdr-tone-map-pref";
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
  const [hdrToneMap, setHdrToneMap] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUnwrap(readUnwrapPublicCorsProxyUrlsPref());
    setHdrToneMap(readHdrToneMapPref());
    setMounted(true);
  }, []);

  const onToggleUnwrap = useCallback((next: boolean) => {
    setUnwrap(next);
    writeUnwrapPublicCorsProxyUrlsPref(next);
  }, []);

  const onToggleHdr = useCallback((next: boolean) => {
    setHdrToneMap(next);
    writeHdrToneMapPref(next);
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
        Playback &amp; relay
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-foreground-intense">
        Zende is primarily a relay: provider → your server → device. Prefer the lightest path
        so home hardware stays responsive. Heavier options are opt-in.
      </p>

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background px-4 py-3.5 transition-colors hover:border-border">
        <Checkbox
          className="mt-1 shrink-0"
          checked={unwrap}
          onCheckedChange={(checked) => onToggleUnwrap(checked === true)}
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

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background px-4 py-3.5 transition-colors hover:border-border">
        <Checkbox
          className="mt-1 shrink-0"
          checked={hdrToneMap}
          onCheckedChange={(checked) => onToggleHdr(checked === true)}
        />
        <span className="min-w-0">
          <span className="block text-[15px] font-medium text-foreground-intense">
            HDR color correction on compatibility remux (CPU)
          </span>
          <span className="mt-1 block text-[13px] leading-relaxed text-foreground-intense">
            Off by default. Only applies when a device cannot play progressive HEVC/MKV and the
            server already remuxes to H.264 HLS. Enabling runs a light Rec.709 color convert for
            HDR titles — helpful on some TVs, but uses extra CPU and can buffer on modest home
            servers. Leave off to stay as close to a pure relay as possible.
          </span>
        </span>
      </label>

      {hdrToneMap ? (
        <div className="mt-4 rounded-xl border border-warning bg-warning-subtle px-4 py-3 text-[13px] leading-relaxed text-warning-strong">
          HDR correction is on for this device. Restart playback after changing this so a fresh
          compatibility encode can start. Live HLS/MPEG-TS channels are unaffected.
        </div>
      ) : null}
    </section>
  );
}
