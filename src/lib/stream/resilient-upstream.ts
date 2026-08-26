import "server-only";

import { createServerLogger } from "@/core/logging/server";
import { RingBuffer } from "@/lib/stream/ring-buffer";

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
  /** Capacity of the ring buffer for catch-up (default 4MB) */
  ringBufferCapacity?: number;
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
export class ResilientUpstream {
  private config: ResilientUpstreamConfig;
  private ringBuffer: RingBuffer;
  private subscribers = new Set<ReadableStreamDefaultController<Uint8Array>>();
  private cancelled = false;
  private consecutiveFailures = 0;
  private currentReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private isFirstLoop = true;
  private pumpPromise: Promise<void> | null = null;

  constructor(config: ResilientUpstreamConfig) {
    this.config = {
      maxConsecutiveFailures: DEFAULT_MAX_CONSECUTIVE_FAILURES,
      initialBackoffMs: DEFAULT_INITIAL_BACKOFF_MS,
      maxBackoffMs: DEFAULT_MAX_BACKOFF_MS,
      label: "(unknown)",
      ringBufferCapacity: 4 * 1024 * 1024,
      ...config,
    };
    this.ringBuffer = new RingBuffer(this.config.ringBufferCapacity!);
    this.pumpPromise = this.pumpLoop().catch((err) => {
      this.broadcastError(err);
    });
  }

  private jitter(ms: number): number {
    return ms * (0.75 + Math.random() * 0.5);
  }

  private nextBackoffMs(): number {
    const raw = this.config.initialBackoffMs! * Math.pow(2, this.consecutiveFailures);
    return this.jitter(Math.min(raw, this.config.maxBackoffMs!));
  }

  private async releaseReader(): Promise<void> {
    const reader = this.currentReader;
    this.currentReader = null;
    if (reader) {
      try { await reader.cancel(); } catch {}
      try { reader.releaseLock(); } catch {}
    }
  }

  public destroy(): void {
    this.cancelled = true;
    if (this.backoffTimer !== null) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
    void this.releaseReader();
    for (const sub of this.subscribers) {
      try { sub.close(); } catch {}
    }
    this.subscribers.clear();
  }

  private broadcastError(err: unknown) {
    for (const sub of this.subscribers) {
      try { sub.error(err); } catch {}
    }
    this.subscribers.clear();
  }

  private broadcastClose() {
    for (const sub of this.subscribers) {
      try { sub.close(); } catch {}
    }
    this.subscribers.clear();
  }

  private broadcastChunk(chunk: Uint8Array) {
    this.ringBuffer.write(chunk);
    for (const sub of this.subscribers) {
      try {
        sub.enqueue(chunk);
      } catch {
        // If enqueue fails (e.g. consumer disconnected), we remove them
        this.subscribers.delete(sub);
      }
    }
  }

  private async pumpLoop(): Promise<void> {
    while (!this.cancelled) {
      try {
        let body: ReadableStream<Uint8Array>;
        if (this.isFirstLoop && this.config.initialStream) {
          body = this.config.initialStream;
        } else {
          body = await this.config.fetchUpstream();
        }
        this.isFirstLoop = false;
        
        this.currentReader = body.getReader();
        if (this.consecutiveFailures > 0) {
          log.info("resilient upstream reconnected", {
            label: this.config.label,
            afterFailures: this.consecutiveFailures,
          });
        }
      } catch (err) {
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= this.config.maxConsecutiveFailures!) {
          log.warn("resilient upstream giving up after max failures", {
            label: this.config.label,
            consecutiveFailures: this.consecutiveFailures,
          });
          this.broadcastClose();
          return;
        }
        log.warn("resilient upstream fetch failed, will retry", {
          label: this.config.label,
          consecutiveFailures: this.consecutiveFailures,
          error: err instanceof Error ? err.message : String(err),
        });
        const delay = this.nextBackoffMs();
        await new Promise<void>((resolve) => {
          this.backoffTimer = setTimeout(() => {
            this.backoffTimer = null;
            resolve();
          }, delay);
        });
        continue;
      }

      try {
        while (true) {
          if (this.cancelled) return;
          const { done, value } = await this.currentReader!.read();
          if (done) {
            log.info("resilient upstream EOF, reconnecting", { label: this.config.label });
            break;
          }
          this.consecutiveFailures = 0;
          this.broadcastChunk(value);
        }
      } catch (err) {
        if (this.cancelled) return;
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= this.config.maxConsecutiveFailures!) {
          log.warn("resilient upstream giving up after max read failures", {
            label: this.config.label,
            consecutiveFailures: this.consecutiveFailures,
          });
          this.broadcastClose();
          return;
        }
        log.warn("resilient upstream read error, will reconnect", {
          label: this.config.label,
          consecutiveFailures: this.consecutiveFailures,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        await this.releaseReader();
      }

      if (this.cancelled) return;
      const delay = this.nextBackoffMs();
      await new Promise<void>((resolve) => {
        this.backoffTimer = setTimeout(() => {
          this.backoffTimer = null;
          resolve();
        }, delay);
      });
    }
  }

  /** Create a new downstream subscriber that instantly receives the ring buffer catch-up payload. */
  public createSubscriber(): ReadableStream<Uint8Array> {
    const snapshot = this.ringBuffer.snapshot();
    let localController: ReadableStreamDefaultController<Uint8Array> | undefined;
    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        localController = controller;
        if (snapshot.length > 0) {
          controller.enqueue(snapshot);
        }
        if (this.cancelled) {
          controller.close();
        } else {
          this.subscribers.add(controller);
        }
      },
      cancel: () => {
        if (localController) {
          this.subscribers.delete(localController);
        }
      },
    });
  }
}

// Preserve legacy helper for test compatibility and unmodified routes
export function createResilientUpstream(config: ResilientUpstreamConfig): ReadableStream<Uint8Array> {
  const instance = new ResilientUpstream(config);
  const stream = instance.createSubscriber();
  // Override cancel to also destroy the instance if the sole stream cancels
  const originalCancel = stream.cancel.bind(stream);
  stream.cancel = async (reason) => {
    instance.destroy();
    return originalCancel(reason);
  };
  return stream;
}


