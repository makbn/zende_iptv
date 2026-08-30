/**
 * Abort an upstream operation only while it is establishing a response.
 * Once response headers arrive the timer is cleared, so long progressive
 * bodies such as MP4 and MKV files can keep streaming normally.
 */
export async function withResponseHeaderTimeout<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeoutError = new Error("The operation was aborted due to timeout");
  timeoutError.name = "TimeoutError";
  const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);

  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
