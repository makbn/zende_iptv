"use client";

import type { ReactNode } from "react";

import { useSmallScreen } from "@/components/mobile/use-small-screen";

type Props = {
  mobile: ReactNode;
  desktop: ReactNode;
};

export function ResponsivePage({ mobile, desktop }: Props) {
  return useSmallScreen() ? mobile : desktop;
}
