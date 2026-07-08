import { zendeFetch } from "@/lib/auth/zende-fetch";

/** Best-effort resume sync stub — server may ignore until API is fully implemented. */
export async function syncPlaybackPositionStub(
  url: string,
  positionSeconds: number,
): Promise<void> {
  if (!url || !Number.isFinite(positionSeconds) || positionSeconds < 5) return;
  try {
    await zendeFetch("/api/user/playback-position", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        positionSeconds: Math.round(positionSeconds),
      }),
    });
  } catch {
    /* optional stub */
  }
}
