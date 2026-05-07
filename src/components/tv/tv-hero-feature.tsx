"use client";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
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
      className="relative min-h-[min(78vh,820px)] w-full overflow-hidden pt-20"
      aria-labelledby="hero-title"
    >
      <div className="pointer-events-none absolute inset-0 tv-hero-ambient">
        <div
          className={cn(
            "absolute inset-0 opacity-90",
            "bg-[radial-gradient(ellipse_120%_80%_at_50%_-10%,oklch(0.42_0.18_264)_0%,transparent_55%)]",
          )}
        />
        <div
          className={cn(
            "absolute inset-0 opacity-80 mix-blend-screen",
            "bg-[radial-gradient(ellipse_90%_60%_at_80%_40%,oklch(0.35_0.12_200)_0%,transparent_50%)]",
          )}
        />
        <div
          className={cn(
            "absolute inset-0 opacity-35",
            "bg-[radial-gradient(circle_at_20%_80%,oklch(0.5_0.15_25)_0%,transparent_45%)]",
          )}
        />
      </div>

      {backdropUrl ? (
        <div className="pointer-events-none absolute inset-0 opacity-[0.22]">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary IPTV logo origins */}
          <img
            src={backdropUrl}
            alt=""
            className="absolute inset-0 size-full object-cover object-center blur-[2px] scale-105"
          />
        </div>
      ) : null}

      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          "bg-gradient-to-b from-black/20 via-black/55 to-[var(--tv-page-bg)]",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-[48%]",
          "bg-gradient-to-t from-[var(--tv-page-bg)] via-[var(--tv-page-bg)]/92 to-transparent",
        )}
      />

      <div className="relative z-10 flex min-h-[min(72vh,760px)] flex-col justify-end px-6 pb-40 sm:px-10 sm:pb-44 lg:px-14 lg:pb-48 xl:px-20">
        <div className="max-w-[820px]">
          <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-white/55">
            {eyebrow}
          </p>
          <h1
            id="hero-title"
            className={cn(
              "text-balance font-semibold tracking-[-0.028em] text-white",
              "text-[clamp(2.5rem,6vw,4.25rem)] leading-[1.05]",
            )}
          >
            {title}
          </h1>
          <p className="mt-4 max-w-[560px] text-pretty text-[19px] leading-snug text-white/72">
            {subtitle}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onPrimary}
              disabled={primaryDisabled}
              className="group border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-black disabled:pointer-events-none disabled:opacity-45"
            >
              <ZenedeGlass
                variant="heroPrimary"
                className="inline-block transition-transform duration-200 group-hover:scale-[1.02] group-active:scale-[0.98] group-disabled:group-hover:scale-100"
              >
                <span className="flex min-h-[48px] min-w-[148px] items-center justify-center px-8 text-[17px] font-semibold text-zinc-950">
                  {primaryLabel}
                </span>
              </ZenedeGlass>
            </button>
            {secondaryLabel && onSecondary ? (
              <button
                type="button"
                onClick={onSecondary}
                disabled={secondaryDisabled}
                className="group border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-black disabled:pointer-events-none disabled:opacity-45"
              >
                <ZenedeGlass
                  variant="heroSecondary"
                  className="inline-block transition-transform duration-200 group-hover:scale-[1.02] group-active:scale-[0.98]"
                >
                  <span className="flex min-h-[48px] min-w-[148px] items-center justify-center px-8 text-[17px] font-semibold text-white">
                    {secondaryLabel}
                  </span>
                </ZenedeGlass>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
