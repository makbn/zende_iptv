import { ZenedeLogoWave } from "@/components/loading/zenede-logo-wave";

/** Next.js App Router: shown while the route segment’s server component is pending. */
export default function Loading() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-[var(--tv-page-bg)] pt-20"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading</span>
      <ZenedeLogoWave size="lg" />
    </div>
  );
}
