"use client";

import { Button } from "@appica/ui-react/button";

import { Card } from "@appica/ui-react/card";
import { secureImageUrl } from "@/lib/media/secure-image-url";
import { cn } from "@/lib/utils";

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  backdropUrl?: string | null;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  primaryDisabled?: boolean;
  secondaryDisabled?: boolean;
};

export function TvHeroFeature({
  eyebrow,
  title,
  subtitle,
  backdropUrl,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  primaryDisabled,
  secondaryDisabled,
}: Props) {
  return (
    <section
      className="relative min-h-[min(62svh,700px)] w-full overflow-hidden pt-20 sm:min-h-[min(64svh,740px)]"
      aria-labelledby="hero-title"
    >
      
      <div className="pointer-events-none absolute inset-0 bg-background-subtle">
        <div
          className={cn(
            "absolute inset-0 opacity-85",
            "bg-background-subtle",
          )}
        />
        <div
          className={cn(
            "absolute inset-0 opacity-70 mix-blend-screen",
            "bg-background-subtle",
          )}
        />
        <div
          className={cn(
            "absolute inset-0 opacity-45",
            "bg-background-subtle",
          )}
        />
      </div>

      {backdropUrl ? (
        <div className="pointer-events-none absolute inset-0 opacity-[0.24]">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary IPTV logo origins */}
          <img
            src={secureImageUrl(backdropUrl)}
            alt=""
            className="absolute inset-0 size-full scale-110 object-cover object-center blur-[6px] saturate-125"
          />
        </div>
      ) : null}

      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          "bg-gradient-to-b from-background via-background to-background",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-[48%]",
          "bg-gradient-to-t from-background via-background to-transparent",
        )}
      />

      <div className="relative z-10 flex min-h-[min(56svh,640px)] flex-col justify-end px-6 pb-28 sm:min-h-[min(58svh,680px)] sm:px-10 sm:pb-32 lg:px-14 lg:pb-36 xl:px-20">
        <div className="flex max-w-[min(100%,940px)] flex-col gap-2.5 sm:gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            {eyebrow}
          </p>
          <h1
            id="hero-title"
            className={cn(
              "text-balance font-semibold tracking-[-0.07em] text-foreground-intense",
              "text-[clamp(2.5rem,7vw,6.35rem)] leading-[0.92]",
            )}
          >
            {title}
          </h1>
          <p className="max-w-[650px] text-pretty text-[16px] leading-relaxed text-foreground-intense sm:text-[18px]">
            {subtitle}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2.5 sm:mt-3 sm:gap-3">
            <Button variant="primary"
              size="lg"
              type="button"
              onClick={onPrimary}
              disabled={primaryDisabled}
            >
              {primaryLabel}
            </Button>
            {secondaryLabel && onSecondary ? (
              <Button variant="secondary"
                size="lg"
                type="button"
                onClick={onSecondary}
                disabled={secondaryDisabled}
              >
                {secondaryLabel}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
