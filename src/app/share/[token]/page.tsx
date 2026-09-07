import type { Metadata } from "next";

import { PublicShareView } from "@/components/shares/public-share-view";

export const metadata: Metadata = {
  title: "Shared with you · Zende",
  description: "Watch media shared through Zende.",
  robots: { index: false, follow: false },
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicShareView token={token} />;
}
