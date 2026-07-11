"use client";

import { ZendeGlass } from "@/components/glass/zende-glass";
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
      <div className="zen-signal-beams" aria-hidden />
      <div className="pointer-events-none absolute inset-0 tv-hero-ambient zen-hero-ambient-breathe">
        <div
          className={cn(
            "absolute inset-0 opacity-85",
            "bg-[radial-gradient(ellipse_120%_80%_at_46%_-10%,rgba(56,217,255,0.24)_0%,transparent_55%)]",
          )}
        />
        <div
          className={cn(
            "absolute inset-0 opacity-70 mix-blend-screen",
            "bg-[radial-gradient(ellipse_90%_60%_at_82%_40%,rgba(56,217,255,0.18)_0%,transparent_52%)]",
          )}
        />
        <div
          className={cn(
            "absolute inset-0 opacity-45",
            "bg-[radial-gradient(circle_at_18%_82%,rgba(255,107,74,0.16)_0%,transparent_44%)]",
          )}
        />
      </div>

      {backdropUrl ? (
        <div className="pointer-events-none absolute inset-0 opacity-[0.24]">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary IPTV logo origins */}
          <img
            src={backdropUrl}
            alt=""
            className="absolute inset-0 size-full scale-110 object-cover object-center blur-[6px] saturate-125"
          />
        </div>
      ) : null}

      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          "bg-gradient-to-b from-black/18 via-black/58 to-[var(--tv-page-bg)]",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-[48%]",
          "bg-gradient-to-t from-[var(--tv-page-bg)] via-[var(--tv-page-bg)]/92 to-transparent",
        )}
      />

      <div className="relative z-10 flex min-h-[min(56svh,640px)] flex-col justify-end px-6 pb-28 sm:min-h-[min(58svh,680px)] sm:px-10 sm:pb-32 lg:px-14 lg:pb-36 xl:px-20">
        <div className="motion-safe:animate-zen-cinema-in flex max-w-[min(100%,940px)] flex-col gap-2.5 sm:gap-3">
          <p className="zen-kicker">
            {eyebrow}
          </p>
          <h1
            id="hero-title"
            className={cn(
              "text-balance font-semibold tracking-[-0.07em] text-white",
              "text-[clamp(2.5rem,7vw,6.35rem)] leading-[0.92]",
            )}
          >
            {title}
          </h1>
          <p className="max-w-[650px] text-pretty text-[16px] leading-relaxed text-white/68 sm:text-[18px]">
            {subtitle}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2.5 sm:mt-3 sm:gap-3">
            <button
              type="button"
              onClick={onPrimary}
              disabled={primaryDisabled}
              className="group rounded-full border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)] focus-visible:ring-offset-4 focus-visible:ring-offset-black disabled:pointer-events-none disabled:opacity-45"
            >
              <ZendeGlass
                variant="heroPrimary"
                className="inline-block transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-safe:group-hover:scale-[1.03] motion-safe:group-active:scale-[0.97] group-disabled:group-hover:scale-100"
              >
                <span className="flex min-h-[52px] min-w-[160px] items-center justify-center px-8 text-[17px] font-semibold text-[var(--zen-void)]">
                  {primaryLabel}
                </span>
              </ZendeGlass>
            </button>
            {secondaryLabel && onSecondary ? (
              <button
                type="button"
                onClick={onSecondary}
                disabled={secondaryDisabled}
                className="group rounded-full border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)] focus-visible:ring-offset-4 focus-visible:ring-offset-black disabled:pointer-events-none disabled:opacity-45"
              >
                <ZendeGlass
                  variant="heroSecondary"
                  className="inline-block transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-safe:group-hover:scale-[1.03] motion-safe:group-active:scale-[0.97]"
                >
                  <span className="flex min-h-[52px] min-w-[160px] items-center justify-center px-8 text-[17px] font-semibold text-white">
                    {secondaryLabel}
                  </span>
                </ZendeGlass>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
