import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { createStreamSession, touchSession } from "@/lib/stream/stream-session-store";

const createdIds: string[] = [];

afterEach(async () => {
  if (createdIds.length === 0) return;
  await prisma.streamProxySession.deleteMany({
    where: { id: { in: createdIds.splice(0) } },
  });
});

describe("stream session absolute expiry", () => {
  it("refuses a hard-expired public-share session even while it is cached", async () => {
    const id = await createStreamSession({
      upstreamRootUrl: "https://example.test/live/user/pass/10.m3u8",
      title: "Expired shared live channel",
      absoluteExpiresAt: new Date(Date.now() - 1_000),
    });
    createdIds.push(id);

    await expect(touchSession(id)).resolves.toBeNull();
  });

  it("caps the sliding session expiry at the share expiry", async () => {
    const hardExpiry = new Date(Date.now() + 2 * 60 * 1000);
    const id = await createStreamSession({
      upstreamRootUrl: "https://example.test/live/user/pass/11.m3u8",
      title: "Active shared live channel",
      absoluteExpiresAt: hardExpiry,
    });
    createdIds.push(id);

    const session = await touchSession(id);
    const row = await prisma.streamProxySession.findUniqueOrThrow({ where: { id } });

    expect(session?.absoluteExpiresAt).toBe(hardExpiry.getTime());
    expect(row.absoluteExpiresAt?.getTime()).toBe(hardExpiry.getTime());
    expect(row.expiresAt.getTime()).toBeLessThanOrEqual(hardExpiry.getTime());
  });
});
