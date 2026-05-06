"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { ChannelResolutionBadge } from "@/components/tv/channel-resolution-badge";
import { parseChannelLabel } from "@/lib/channel/channel-label";
import type { ViewingEntry } from "@/lib/watch/viewing-stats";
import { cn } from "@/lib/utils";

const MAX_HALF_SPAN = 4;
/** Up to this many tiles we use an equal-width grid that spans the dock — feels intentional on tvOS-style layouts. */
const DISTRIBUTED_STRIP_MAX = 11;

/** Neighbors in the frequent ring (matches `/watch` prev/next navigation). */
export function ringNeighborEntries(
  ring: ViewingEntry[],
  currentUrl: string | null,
): { prev: ViewingEntry | null; next: ViewingEntry | null } {
  if (!currentUrl || ring.length === 0) {
    return { prev: null, next: null };
  }
  let idx = ring.findIndex((e) => e.url === currentUrl);
  if (idx < 0) {
    return {
      prev: ring[ring.length - 1] ?? null,
      next: ring[0] ?? null,
    };
  }
  const n = ring.length;
  return {
    prev: ring[(idx - 1 + n) % n] ?? null,
    next: ring[(idx + 1) % n] ?? null,
  };
}

function hueFromString(s: string): number {
  let h = 216;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33 + s.charCodeAt(i) * 17) % 360;
  }
  return h;
}

function ChannelArt({
  displayName,
  logoUrl,
  emphasis,
  layout,
  resolutionLabel,
}: {
  displayName: string;
  logoUrl?: string;
  emphasis: "now" | "neighbor";
  layout: "sheet" | "rail";
  resolutionLabel?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showLogo = Boolean(logoUrl) && !broken;
  const initial = displayName.trim().slice(0, 1).toUpperCase() || "?";
  const hue = useMemo(() => hueFromString(displayName), [displayName]);

  const frame =
    layout === "sheet"
      ? cn(
          "relative mx-auto flex aspect-video w-full items-center justify-center overflow-hidden",
          "rounded-[11px] ring-1 ring-white/[0.12]",
          emphasis === "now"
            ? "max-h-[64px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            : "max-h-[54px] opacity-[0.94]",
        )
      : cn(
          "relative mx-auto flex aspect-video w-full items-center justify-center overflow-hidden rounded-[10px]",
          "ring-1 ring-white/[0.1]",
          emphasis === "now"
            ? "max-h-[58px] max-w-[118px] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:max-h-[62px] sm:max-w-[128px]"
            : "max-h-[48px] max-w-[92px] opacity-[0.9] sm:max-h-[52px] sm:max-w-[100px]",
        );

  return (
    <div
      className={frame}
      style={{
        background: `linear-gradient(148deg, hsl(${hue} 46% 22%) 0%, hsl(${(hue + 52) % 360} 42% 11%) 52%, oklch(0.1 0.02 ${hue}) 100%)`,
      }}
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element -- IPTV logos from arbitrary origins
        <img
          src={logoUrl}
          alt=""
          className={cn(
            "relative z-[1] object-contain transition-transform duration-300 ease-out group-hover:scale-[1.04]",
            emphasis === "now"
              ? "max-h-[76%] max-w-[84%] drop-shadow-[0_8px_20px_rgba(0,0,0,0.5)]"
              : "max-h-[72%] max-w-[80%] drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)]",
          )}
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <span
          className={cn(
            "relative z-[1] select-none font-semibold text-white/[0.28]",
            emphasis === "now"
              ? "text-[clamp(1.05rem,2.8vw,1.35rem)]"
              : "text-[clamp(0.85rem,2.2vw,1.05rem)]",
          )}
        >
          {initial}
        </span>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/72 via-black/15 to-transparent" />
      <div className="pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay bg-[radial-gradient(ellipse_at_35%_22%,rgba(255,255,255,0.16),transparent_58%)]" />
      {resolutionLabel ? (
        <div className="absolute right-1.5 top-1.5 z-[3] sm:right-2 sm:top-2">
          <ChannelResolutionBadge label={resolutionLabel} />
        </div>
      ) : null}
    </div>
  );
}

type StripSlot =
  | {
      key: string;
      kind: "current";
      entry: ViewingEntry;
    }
  | {
      key: string;
      kind: "jump";
      entry: ViewingEntry;
    };

function effectiveHalfWidth(ringLen: number): number {
  if (ringLen <= 1) return 0;
  return Math.min(MAX_HALF_SPAN, Math.floor(ringLen / 2));
}

function collectPrevChain(
  ring: ViewingEntry[],
  fromUrl: string | null,
  count: number,
): ViewingEntry[] {
  if (!fromUrl || count <= 0) return [];
  const out: ViewingEntry[] = [];
  let cur: string | null = fromUrl;
  for (let i = 0; i < count; i++) {
    const { prev } = ringNeighborEntries(ring, cur);
    if (!prev) break;
    out.unshift(prev);
    cur = prev.url;
  }
  return out;
}

function collectNextChain(
  ring: ViewingEntry[],
  fromUrl: string | null,
  count: number,
): ViewingEntry[] {
  if (!fromUrl || count <= 0) return [];
  const out: ViewingEntry[] = [];
  let cur: string | null = fromUrl;
  for (let i = 0; i < count; i++) {
    const { next } = ringNeighborEntries(ring, cur);
    if (!next) break;
    out.push(next);
    cur = next.url;
  }
  return out;
}

function buildStripSlots(
  ring: ViewingEntry[],
  streamUrl: string | null,
  nowTitle: string,
  nowLogo: string | undefined,
  nowGroup: string | undefined,
): StripSlot[] | null {
  const n = ring.length;
  if (!streamUrl || n === 0) return null;

  const idx = ring.findIndex((e) => e.url === streamUrl);
  const half = effectiveHalfWidth(n);

  const centerEntry: ViewingEntry =
    idx >= 0
      ? ring[idx]!
      : {
          url: streamUrl,
          name: nowTitle,
          ...(nowLogo ? { tvgLogo: nowLogo } : {}),
          ...(nowGroup ? { groupTitle: nowGroup } : {}),
          lastOpenedAt: Date.now(),
          openCount: 1,
        };

  const slots: StripSlot[] = [];

  if (idx >= 0) {
    for (let o = -half; o <= half; o++) {
      const j = (idx + o + n * 64) % n;
      const entry = ring[j]!;
      if (o === 0) {
        slots.push({
          key: `c-${entry.url}-${o}`,
          kind: "current",
          entry,
        });
      } else {
        slots.push({
          key: `j-${entry.url}-${o}`,
          kind: "jump",
          entry,
        });
      }
    }
    return slots;
  }

  const left = collectPrevChain(ring, streamUrl, half);
  const right = collectNextChain(ring, streamUrl, half);

  for (const e of left) {
    slots.push({
      key: `L-${e.url}`,
      kind: "jump",
      entry: e,
    });
  }
  slots.push({
    key: `current-${centerEntry.url}`,
    kind: "current",
    entry: centerEntry,
  });
  for (const e of right) {
    slots.push({
      key: `R-${e.url}`,
      kind: "jump",
      entry: e,
    });
  }

  return slots;
}

function metaLabel(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  if (s.length > 42) return `${s.slice(0, 40)}…`;
  return s;
}

/** Center slot = 1; neighbors ~0.75; farthest left/right ~0.2 (smooth ramp). */
function stripSlotOpacity(
  index: number,
  centerIndex: number,
  length: number,
): number {
  if (length <= 1) return 1;
  const center = Math.max(0, Math.min(centerIndex, length - 1));
  const dist = Math.abs(index - center);
  const maxDist = Math.max(center, length - 1 - center);
  if (dist === 0) return 1;
  if (maxDist <= 0) return 1;
  if (maxDist === 1) return 0.75;
  const t = (dist - 1) / (maxDist - 1);
  return 0.75 + (0.2 - 0.75) * t;
}

/** Frosted glass plate per tile (strip has no shared backdrop — legibility lives here). */
const stripTileGlassSurface = cn(
  "border border-white/[0.14] bg-black/45 backdrop-blur-2xl backdrop-saturate-150",
  "ring-1 ring-white/[0.11]",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_36px_-14px_rgba(0,0,0,0.72)]",
);

function StripTile({
  slot,
  centerRef,
  layout,
  ringOpacity,
  onJumpChannel,
}: {
  slot: StripSlot;
  centerRef?: RefObject<HTMLDivElement | null>;
  layout: "sheet" | "rail";
  ringOpacity: number;
  onJumpChannel: (entry: ViewingEntry) => void;
}) {
  const parsed = useMemo(
    () => parseChannelLabel(slot.entry.name),
    [slot.entry.name],
  );
  const meta = metaLabel(slot.entry.groupTitle);
  const titleCls = cn(
    "line-clamp-2 w-full text-center font-medium leading-[1.25] tracking-[-0.015em]",
    layout === "sheet" ? "text-[11px] sm:text-[12px]" : "text-[10px] sm:text-[11px]",
    slot.kind === "current"
      ? "text-white [text-shadow:0_1px_14px_rgba(0,0,0,0.75)]"
      : "text-white/92 [text-shadow:0_1px_10px_rgba(0,0,0,0.55)]",
  );
  const metaCls = cn(
    "line-clamp-1 w-full text-center font-medium uppercase tracking-[0.07em]",
    layout === "sheet" ? "text-[9px]" : "text-[8px] sm:text-[9px]",
    slot.kind === "current" ? "text-white/58" : "text-white/52",
  );

  const body = (
    <div
      className={cn(
        "flex min-h-0 w-full min-w-0 flex-col items-stretch gap-1",
        layout === "sheet" ? "gap-1.5 px-0.5 pt-0.5" : "gap-1 px-0.5 pt-0.5",
      )}
    >
      <ChannelArt
        displayName={parsed.displayName}
        logoUrl={slot.entry.tvgLogo}
        emphasis={slot.kind === "current" ? "now" : "neighbor"}
        layout={layout}
        resolutionLabel={parsed.resolutionLabel}
      />
      <p className={titleCls}>{parsed.displayName}</p>
      {meta ? (
        <p className={metaCls}>{meta}</p>
      ) : (
        <span className={layout === "sheet" ? "h-[11px]" : "h-[10px]"} aria-hidden />
      )}
    </div>
  );

  if (slot.kind === "current") {
    return (
      <div
        ref={centerRef}
        style={{ opacity: ringOpacity }}
        className={cn(
          "motion-safe:animate-watch-channel-peek min-h-0 min-w-0 transition-opacity duration-300 ease-out",
          layout === "rail" &&
            "w-[min(124px,28vw)] shrink-0 snap-center snap-always sm:w-[132px]",
        )}
      >
        <ZenedeGlass
          variant="panelCompact"
          className={cn(
            "relative w-full overflow-hidden rounded-[16px]",
            stripTileGlassSurface,
            "ring-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_14px_44px_-16px_rgba(0,0,0,0.82)]",
          )}
        >
          <div
            className={cn(
              "pb-2.5 pt-2",
              layout === "sheet" ? "px-2 sm:px-2.5" : "px-2 pb-2 pt-1.5",
            )}
          >
            {body}
          </div>
        </ZenedeGlass>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onJumpChannel(slot.entry)}
      aria-label={`Open ${slot.entry.name}`}
      style={{ opacity: ringOpacity }}
      className={cn(
        "group min-h-0 cursor-pointer border-none bg-transparent p-0 text-left outline-none transition-[transform,opacity] duration-300 ease-out",
        layout === "rail" &&
          "w-[min(108px,26vw)] shrink-0 snap-center snap-always sm:w-[118px]",
        layout === "rail" && "hover:-translate-y-px active:scale-[0.99]",
        "focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black/90",
      )}
    >
      <ZenedeGlass
        variant="panelCompact"
        className={cn(
          "h-full w-full overflow-hidden rounded-[14px]",
          stripTileGlassSurface,
          "transition-[box-shadow,transform] duration-200",
          "group-hover:bg-black/52 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_40px_-12px_rgba(0,0,0,0.78)]",
        )}
      >
        <div
          className={cn(
            "pb-2 pt-1.5",
            layout === "sheet" ? "px-2 sm:px-2.5" : "px-1.5 pb-2 pt-1",
          )}
        >
          {body}
        </div>
      </ZenedeGlass>
    </button>
  );
}

export function FrequentChannelPeek({
  ring,
  streamUrl,
  nowTitle,
  nowLogo,
  nowGroup,
  onJumpChannel,
}: {
  ring: ViewingEntry[];
  streamUrl: string | null;
  nowTitle: string;
  nowLogo?: string | null;
  nowGroup?: string | null;
  onJumpChannel: (entry: ViewingEntry) => void;
}) {
  const centerRef = useRef<HTMLDivElement>(null);

  const slots = useMemo(
    () =>
      buildStripSlots(
        ring,
        streamUrl,
        nowTitle,
        nowLogo ?? undefined,
        nowGroup ?? undefined,
      ),
    [ring, streamUrl, nowTitle, nowLogo, nowGroup],
  );

  const layout: "sheet" | "rail" =
    slots && slots.length > 0 && slots.length <= DISTRIBUTED_STRIP_MAX
      ? "sheet"
      : "rail";

  const centerIndex = useMemo(() => {
    if (!slots?.length) return 0;
    const i = slots.findIndex((s) => s.kind === "current");
    return i >= 0 ? i : 0;
  }, [slots]);

  const stripLen = slots?.length ?? 0;

  useEffect(() => {
    if (layout !== "rail") return;
    const id = requestAnimationFrame(() => {
      centerRef.current?.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: "smooth",
      });
    });
    return () => cancelAnimationFrame(id);
  }, [streamUrl, slots, layout]);

  if (!slots || slots.length === 0) {
    return null;
  }

  return (
    <div>
      {layout === "sheet" ? (
        <div
          className="grid w-full gap-x-2 gap-y-2 px-4 sm:gap-x-3 sm:px-5"
          style={{
            gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))`,
          }}
        >
          {slots.map((slot, i) => (
            <StripTile
              key={slot.key}
              slot={slot}
              centerRef={slot.kind === "current" ? centerRef : undefined}
              layout="sheet"
              ringOpacity={stripSlotOpacity(i, centerIndex, stripLen)}
              onJumpChannel={onJumpChannel}
            />
          ))}
        </div>
      ) : (
        <div className="relative">
          <div
            className={cn(
              "flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-2.5 sm:px-5",
              "[scroll-padding-inline:max(1rem,calc(50%-5.25rem))] sm:[scroll-padding-inline:max(1.25rem,calc(50%-5.75rem))]",
              "[&::-webkit-scrollbar]:hidden",
            )}
            aria-label="Channels in your frequent ring"
          >
            {slots.map((slot, i) => (
              <StripTile
                key={slot.key}
                slot={slot}
                centerRef={slot.kind === "current" ? centerRef : undefined}
                layout="rail"
                ringOpacity={stripSlotOpacity(i, centerIndex, stripLen)}
                onJumpChannel={onJumpChannel}
              />
            ))}
          </div>
        </div>
      )}

      {ring.length === 1 ? (
        <p className="mt-3 px-4 text-center text-[10px] font-medium tracking-wide text-white/38 sm:px-5">
          Only one channel in this ring · prev/next loops here
        </p>
      ) : null}
    </div>
  );
}
