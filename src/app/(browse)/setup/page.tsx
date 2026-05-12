import { MobileSetupPage } from "@/components/mobile/mobile-setup-page";
import { ResponsivePage } from "@/components/mobile/responsive-page";
import { TvSetupPage } from "@/components/tv/tv-setup-page";

export default function Setup() {
  return <ResponsivePage mobile={<MobileSetupPage />} desktop={<TvSetupPage />} />;
}
