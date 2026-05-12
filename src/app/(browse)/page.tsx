import { MobileHome } from "@/components/mobile/mobile-home";
import { ResponsivePage } from "@/components/mobile/responsive-page";
import { TvHome } from "@/components/tv/tv-home";

export default function Home() {
  return <ResponsivePage mobile={<MobileHome />} desktop={<TvHome />} />;
}
