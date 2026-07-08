import { ZenedeLogoWave } from "@/components/loading/zenede-logo-wave";
import { BROWSE_TOP_PAD } from "@/components/layout/browse-page-shell";
import { cn } from "@/lib/utils";

export function BrowsePageFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "zen-page-bg flex min-h-screen flex-col items-center justify-center",
        BROWSE_TOP_PAD,
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <ZenedeLogoWave className="h-14 w-14 text-[var(--zen-signal)]" />
      <span className="sr-only">Loading</span>
      <p className="zen-kicker mt-5">Tuning signal</p>
      <p className="mt-2 text-[15px] text-white/48">Loading your channels...</p>
    </div>
  );
}
