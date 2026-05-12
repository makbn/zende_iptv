import { MobileSettingsPage } from "@/components/mobile/mobile-settings-page";
import { ResponsivePage } from "@/components/mobile/responsive-page";
import { TvSettingsPage } from "@/components/tv/tv-settings-page";

export default function Settings() {
  return (
    <ResponsivePage mobile={<MobileSettingsPage />} desktop={<TvSettingsPage />} />
  );
}
