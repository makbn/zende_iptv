import type { ComponentProps } from "react";

import type LiquidGlassType from "liquid-glass-react";

type LGProps = ComponentProps<typeof LiquidGlassType>;

export type GlassVariant =
  | "navRail"
  | "heroPrimary"
  | "heroSecondary"
  | "panel"
  | "panelCompact"
  | "iconChip"
  | "ctaPill";

/** Curated presets aligned with liquid-glass-react defaults — tuned for dark IPTV UI. */
export const GLASS_PRESETS: Record<
  GlassVariant,
  Pick<
    LGProps,
    | "displacementScale"
    | "blurAmount"
    | "saturation"
    | "aberrationIntensity"
    | "elasticity"
    | "cornerRadius"
    | "mode"
    | "overLight"
    | "padding"
  >
> = {
  navRail: {
    displacementScale: 54,
    blurAmount: 0.07,
    saturation: 130,
    aberrationIntensity: 1.65,
    elasticity: 0.19,
    cornerRadius: 0,
    mode: "prominent",
    padding: "0",
  },
  heroPrimary: {
    displacementScale: 64,
    blurAmount: 0.095,
    saturation: 124,
    aberrationIntensity: 2,
    elasticity: 0.36,
    cornerRadius: 999,
    mode: "standard",
    padding: "0",
    overLight: true,
  },
  heroSecondary: {
    displacementScale: 52,
    blurAmount: 0.052,
    saturation: 144,
    aberrationIntensity: 2,
    elasticity: 0.3,
    cornerRadius: 999,
    mode: "polar",
    padding: "0",
  },
  panel: {
    displacementScale: 46,
    blurAmount: 0.048,
    saturation: 138,
    aberrationIntensity: 1.55,
    elasticity: 0.21,
    cornerRadius: 28,
    mode: "prominent",
    padding: "0",
  },
  panelCompact: {
    displacementScale: 42,
    blurAmount: 0.045,
    saturation: 136,
    aberrationIntensity: 1.45,
    elasticity: 0.2,
    cornerRadius: 22,
    mode: "standard",
    padding: "0",
  },
  iconChip: {
    displacementScale: 44,
    blurAmount: 0.055,
    saturation: 132,
    aberrationIntensity: 1.6,
    elasticity: 0.26,
    cornerRadius: 999,
    mode: "standard",
    padding: "0",
  },
  ctaPill: {
    displacementScale: 58,
    blurAmount: 0.08,
    saturation: 128,
    aberrationIntensity: 1.9,
    elasticity: 0.32,
    cornerRadius: 999,
    mode: "standard",
    padding: "0",
    overLight: true,
  },
};
