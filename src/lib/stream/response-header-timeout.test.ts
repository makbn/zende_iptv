import { describe, expect, it, vi } from "vitest";

import { withResponseHeaderTimeout } from "@/lib/stream/response-header-timeout";

describe("withResponseHeaderTimeout", () => {
  it("does not abort a progressive body after response setup completes", async () => {
    vi.useFakeTimers();
    const setupSignals: AbortSignal[] = [];

    const response = await withResponseHeaderTimeout(100, async (signal) => {
      setupSignals.push(signal);
      return { body: "progressive-mkv" };
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(response.body).toBe("progressive-mkv");
    expect(setupSignals[0]?.aborted).toBe(false);
    vi.useRealTimers();
  });

  it("aborts response setup when headers do not arrive in time", async () => {
    vi.useFakeTimers();
    const pending = withResponseHeaderTimeout(100, (signal) =>
      new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    );

    const assertion = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    vi.useRealTimers();
  });
});
