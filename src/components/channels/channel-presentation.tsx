"use client";

import { useState } from "react";

import { ChannelResolutionBadge } from "@/components/tv/channel-resolution-badge";
import { ChannelYearBadge } from "@/components/tv/channel-year-badge";
import {
  channelArtBadgeLabel,
  type ParsedChannelLabel,
} from "@/lib/channel/channel-label";
import type { LibraryContentType } from "@/lib/channels/content-type";
import { cn } from "@/lib/utils";

export function gradientFromChannelName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h + name.charCodeAt(i) * (i + 1)) % 360;
  }
  return `linear-gradient(145deg, oklch(0.35 0.12 ${h}) 0%, oklch(0.18 0.06 ${(h + 40) % 360}) 100%)`;
}

/** Hide playlist placeholders when there is no useful group label. */
export function sanitizeGroupTitle(groupTitle?: string): string | null {
  const raw = groupTitle?.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "undefined" || lower === "unknown" || lower === "n/a" || lower === "na") {
    return null;
  }
  return raw;
}

type ChannelLogoProps = {
  name: string;
  logoUrl?: string | null;
  className?: string;
  eager?: boolean;
  fit?: "contain" | "cover";
  aspect?: "video" | "fill";
};

export function ChannelLogo({
  name,
  logoUrl,
  className,
  eager = false,
  fit = "contain",
  aspect = "video",
}: ChannelLogoProps) {
  const [failed, setFailed] = useState(false);
  const showLogo = Boolean(logoUrl?.trim()) && !failed;

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl bg-white/[0.04]",
        aspect === "video" && "aspect-video",
        className,
      )}
    >
      {showLogo ? (
        <img
          src={logoUrl!}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className={cn(
            "absolute inset-0 h-full w-full",
            fit === "cover" ? "object-cover p-0" : "object-contain p-2",
          )}
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center p-3 text-center text-[13px] font-semibold leading-tight text-white/90"
          style={{ background: gradientFromChannelName(name) }}
          aria-hidden
        >
          {name.slice(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  );
}

export function ChannelArtBadge({
  parsed,
  contentType,
  className,
}: {
  parsed: ParsedChannelLabel;
  contentType: LibraryContentType;
  className?: string;
}) {
  const label = channelArtBadgeLabel(parsed, contentType);
  if (!label) return null;
  if (contentType !== "live" && parsed.yearLabel) {
    return <ChannelYearBadge label={label} className={className} />;
  }
  return <ChannelResolutionBadge label={label} className={className} />;
}
