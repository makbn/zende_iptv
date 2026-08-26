import "server-only";

import { createServerLogger } from "@/core/logging/server";

const log = createServerLogger("lib.stream.resilient-upstream");

export type ResilientUpstreamConfig = {
  /** Function that performs the upstream fetch. Returns the response body ReadableStream. */
  fetchUpstream: () => Promise<ReadableStream<Uint8Array>>;
  /** Max consecutive reconnect failures before giving up. Default: 5 */
  maxConsecutiveFailures?: number;
  /** Initial backoff in ms. Default: 50 */
  initialBackoffMs?: number;
  /** Maximum backoff in ms. Default: 500 */
  maxBackoffMs?: number;
  /** Label for logging (e.g. session ID or redacted URL). */
  label?: string;
  /** An already-opened stream to use for the first read loop to prevent double-fetching. */
  initialStream?: ReadableStream<Uint8Array>;
};

const DEFAULT_MAX_CONSECUTIVE_FAILURES = 5;
const DEFAULT_INITIAL_BACKOFF_MS = 50;
const DEFAULT_MAX_BACKOFF_MS = 500;

/**
 * Creates a resilient ReadableStream that automatically reconnects to the
 * upstream provider when the connection ends (EOF) or errors out.
 *
 * MPEG-TS is packetized — appending bytes from a new connection works because
 * mpegts.js re-syncs on 0x47 sync bytes at the receiver.
 *
 * Backoff schedule: initialBackoffMs → 2x → 4x → maxBackoffMs (capped), with
 * ±25% jitter. Consecutive failures reset on any successful chunk read.
 */
export function createResilientUpstream(
  config: ResilientUpstreamConfig,
): ReadableStream<Uint8Array> {
  const {
    fetchUpstream,
    maxConsecutiveFailures = DEFAULT_MAX_CONSECUTIVE_FAILURES,
    initialBackoffMs = DEFAULT_INITIAL_BACKOFF_MS,
    maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
    label = "(unknown)",
    initialStream,
  } = config;

  let cancelled = false;
  let consecutiveFailures = 0;
  let currentReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let backoffTimer: ReturnType<typeof setTimeout> | null = null;
  let isFirstLoop = true;

  /** Add ±25% jitter to a delay. */
  function jitter(ms: number): number {
    return ms * (0.75 + Math.random() * 0.5);
  }

  /** Compute the next backoff delay based on the current failure count. */
  function nextBackoffMs(): number {
    // 0 failures → initialBackoffMs, 1 → 2x, 2 → 4x, etc., capped at max.
    const raw = initialBackoffMs * Math.pow(2, consecutiveFailures);
    return jitter(Math.min(raw, maxBackoffMs));
  }

  /** Safely release the current upstream reader. */
  async function releaseReader(): Promise<void> {
    const reader = currentReader;
    currentReader = null;
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // Already closed or errored — ignore.
      }
      try {
        reader.releaseLock();
      } catch {
        // Already released — ignore.
      }
    }
  }

  function cleanup(): void {
    cancelled = true;
    if (backoffTimer !== null) {
      clearTimeout(backoffTimer);
      backoffTimer = null;
    }
    void releaseReader();
  }

  async function pumpLoop(
    controller: ReadableStreamDefaultController<Uint8Array>,
  ): Promise<void> {
    while (!cancelled) {
      // ── Connect (or reconnect) ──────────────────────────────────────────
      try {
        let body: ReadableStream<Uint8Array>;
        if (isFirstLoop && initialStream) {
          body = initialStream;
        } else {
          body = await fetchUpstream();
        }
        isFirstLoop = false;
        
        currentReader = body.getReader();
        if (consecutiveFailures > 0) {
          log.info("resilient upstream reconnected", {
            label,
            afterFailures: consecutiveFailures,
          });
        }
      } catch (err) {
        consecutiveFailures++;
        if (consecutiveFailures >= maxConsecutiveFailures) {
          log.warn("resilient upstream giving up after max failures", {
            label,
            consecutiveFailures,
          });
          controller.close();
          return;
        }
        log.warn("resilient upstream fetch failed, will retry", {
          label,
          consecutiveFailures,
          error: err instanceof Error ? err.message : String(err),
        });
        const delay = nextBackoffMs();
        await new Promise<void>((resolve) => {
          backoffTimer = setTimeout(() => {
            backoffTimer = null;
            resolve();
          }, delay);
        });
        continue;
      }

      // ── Read loop ───────────────────────────────────────────────────────
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (cancelled) return;
          const { done, value } = await currentReader!.read();
          if (done) {
            // EOF — upstream ended the connection. Reconnect.
            log.info("resilient upstream EOF, reconnecting", { label });
            break;
          }
          // Successful chunk — reset failure counter.
          consecutiveFailures = 0;
          controller.enqueue(value);
        }
      } catch (err) {
        if (cancelled) return;
        consecutiveFailures++;
        if (consecutiveFailures >= maxConsecutiveFailures) {
          log.warn("resilient upstream giving up after max read failures", {
            label,
            consecutiveFailures,
          });
          controller.close();
          return;
        }
        log.warn("resilient upstream read error, will reconnect", {
          label,
          consecutiveFailures,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        await releaseReader();
      }

      // ── Backoff before reconnect ────────────────────────────────────────
      if (cancelled) return;
      const delay = nextBackoffMs();
      await new Promise<void>((resolve) => {
        backoffTimer = setTimeout(() => {
          backoffTimer = null;
          resolve();
        }, delay);
      });
    }
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      // Kick off the pump loop in the background. It enqueues chunks and
      // closes the controller when giving up or when cancelled.
      pumpLoop(controller).catch((err) => {
        if (!cancelled) {
          try {
            controller.error(err);
          } catch {
            // Controller already closed — ignore.
          }
        }
      });
    },
    cancel() {
      cleanup();
    },
  });
}
