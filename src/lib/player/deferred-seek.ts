export type DeferredSeekCommitter = {
  schedule: (targetSeconds: number, commit: (targetSeconds: number) => void) => void;
  cancel: () => void;
};

/**
 * Debounces seek requests so scrubbing and repeated remote steps only cause one
 * media-source seek after the user stops adjusting the target.
 */
export function createDeferredSeekCommitter(delayMs: number): DeferredSeekCommitter {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  return {
    schedule(targetSeconds, commit) {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        commit(targetSeconds);
      }, delayMs);
    },
    cancel,
  };
}
