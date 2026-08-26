import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub the "server-only" import so the module can be loaded in test environment.
vi.mock("server-only", () => ({}));

// Stub the server logger so we don't pull in pino / env config.
vi.mock("@/core/logging/server", () => ({
  createServerLogger: () => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
    scope: "test",
  }),
}));

import { createResilientUpstream } from "@/lib/stream/resilient-upstream";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Create a ReadableStream that yields the given chunks then closes. */
function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

/** Create a ReadableStream that errors immediately. */
function errorStream(message: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error(message));
    },
  });
}

/** Collect all chunks from a ReadableStream. */
async function collectStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array[]> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("createResilientUpstream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads from a normal stream that closes cleanly", async () => {
    const chunk1 = new Uint8Array([0x47, 0x00, 0x01]);
    const chunk2 = new Uint8Array([0x47, 0x00, 0x02]);

    // After the first stream closes (EOF), the resilient wrapper will attempt
    // reconnect. Provide a second fetch that also ends immediately so the
    // loop terminates after maxConsecutiveFailures.
    let callCount = 0;
    const fetchUpstream = vi.fn(async () => {
      callCount++;
      if (callCount === 1) return streamOf(chunk1, chunk2);
      // Subsequent reconnect fetches fail to trigger give-up.
      throw new Error("no more data");
    });

    const resilient = createResilientUpstream({
      fetchUpstream,
      maxConsecutiveFailures: 2,
      initialBackoffMs: 1,
      maxBackoffMs: 2,
      label: "test-normal",
    });

    const reader = resilient.getReader();
    const chunks: Uint8Array[] = [];

    // Read the two real chunks.
    const r1 = await reader.read();
    expect(r1.done).toBe(false);
    chunks.push(r1.value!);

    const r2 = await reader.read();
    expect(r2.done).toBe(false);
    chunks.push(r2.value!);

    // After EOF, backoff timers fire. Advance timers to let the reconnect
    // attempts and failures play out.
    const readPromise = reader.read();
    // Advance enough time for all backoff timers.
    await vi.advanceTimersByTimeAsync(1000);
    const r3 = await readPromise;
    expect(r3.done).toBe(true);

    expect(chunks).toEqual([chunk1, chunk2]);
    expect(fetchUpstream).toHaveBeenCalledTimes(3); // 1 initial + 2 failed reconnects
  });

  it("reconnects on EOF and continues providing bytes", async () => {
    const chunk1 = new Uint8Array([0x47, 0x01]);
    const chunk2 = new Uint8Array([0x47, 0x02]);
    const chunk3 = new Uint8Array([0x47, 0x03]);

    let callCount = 0;
    const fetchUpstream = vi.fn(async () => {
      callCount++;
      if (callCount === 1) return streamOf(chunk1, chunk2);
      if (callCount === 2) return streamOf(chunk3);
      throw new Error("done");
    });

    const resilient = createResilientUpstream({
      fetchUpstream,
      maxConsecutiveFailures: 2,
      initialBackoffMs: 1,
      maxBackoffMs: 2,
      label: "test-reconnect",
    });

    const reader = resilient.getReader();
    const chunks: Uint8Array[] = [];

    // Read first stream's chunks.
    chunks.push((await reader.read()).value!);
    chunks.push((await reader.read()).value!);

    // The stream will EOF and reconnect after backoff — advance timers.
    const r3Promise = reader.read();
    await vi.advanceTimersByTimeAsync(100);
    const r3 = await r3Promise;
    expect(r3.done).toBe(false);
    chunks.push(r3.value!);

    // Now the second stream EOFs and reconnect will fail twice → give up.
    const endPromise = reader.read();
    await vi.advanceTimersByTimeAsync(1000);
    const end = await endPromise;
    expect(end.done).toBe(true);

    expect(chunks).toEqual([chunk1, chunk2, chunk3]);
    // 1st call → data, 2nd call → data, 3rd+ calls → fail
    expect(fetchUpstream.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("gives up after max consecutive failures", async () => {
    const fetchUpstream = vi.fn(async () => {
      throw new Error("connection refused");
    });

    const resilient = createResilientUpstream({
      fetchUpstream,
      maxConsecutiveFailures: 3,
      initialBackoffMs: 1,
      maxBackoffMs: 2,
      label: "test-give-up",
    });

    const reader = resilient.getReader();

    // Advance timers so backoff delays resolve.
    const readPromise = reader.read();
    await vi.advanceTimersByTimeAsync(1000);
    const result = await readPromise;

    expect(result.done).toBe(true);
    expect(fetchUpstream).toHaveBeenCalledTimes(3);
  });

  it("canceling the downstream stops reconnects", async () => {
    let callCount = 0;
    let resolveSecondFetch: (() => void) | undefined;

    const fetchUpstream = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return streamOf(new Uint8Array([0x47, 0x01]));
      }
      // Second fetch hangs until cancelled.
      return new Promise<ReadableStream<Uint8Array>>((resolve) => {
        resolveSecondFetch = () => resolve(streamOf());
      });
    });

    const resilient = createResilientUpstream({
      fetchUpstream,
      maxConsecutiveFailures: 5,
      initialBackoffMs: 1,
      maxBackoffMs: 2,
      label: "test-cancel",
    });

    const reader = resilient.getReader();
    const r1 = await reader.read();
    expect(r1.done).toBe(false);

    // EOF will trigger reconnect — advance timers for backoff.
    await vi.advanceTimersByTimeAsync(100);

    // Cancel the downstream.
    await reader.cancel();

    // Give any pending microtasks a chance to settle.
    await vi.advanceTimersByTimeAsync(100);

    // No further fetches should happen after cancel.
    const callsAtCancel = fetchUpstream.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchUpstream.mock.calls.length).toBe(callsAtCancel);
  });

  it("handles upstream read errors with reconnect", async () => {
    let callCount = 0;
    const fetchUpstream = vi.fn(async () => {
      callCount++;
      if (callCount === 1) return errorStream("network reset");
      if (callCount === 2) return streamOf(new Uint8Array([0x47, 0x99]));
      throw new Error("no more");
    });

    const resilient = createResilientUpstream({
      fetchUpstream,
      maxConsecutiveFailures: 3,
      initialBackoffMs: 1,
      maxBackoffMs: 2,
      label: "test-read-error",
    });

    const reader = resilient.getReader();

    // First fetch succeeds but the stream errors immediately.
    // After backoff, second fetch provides a chunk.
    const r1Promise = reader.read();
    await vi.advanceTimersByTimeAsync(100);
    const r1 = await r1Promise;
    expect(r1.done).toBe(false);
    expect(r1.value).toEqual(new Uint8Array([0x47, 0x99]));

    // Let it finish.
    const endPromise = reader.read();
    await vi.advanceTimersByTimeAsync(1000);
    const end = await endPromise;
    expect(end.done).toBe(true);
  });
});
