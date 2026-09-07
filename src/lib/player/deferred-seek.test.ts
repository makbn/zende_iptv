import { afterEach, describe, expect, it, vi } from "vitest";

import { createDeferredSeekCommitter } from "./deferred-seek";

describe("createDeferredSeekCommitter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("commits only the last target after the idle delay", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const deferred = createDeferredSeekCommitter(600);

    deferred.schedule(75, commit);
    vi.advanceTimersByTime(300);
    deferred.schedule(90, commit);
    vi.advanceTimersByTime(300);
    deferred.schedule(105, commit);

    vi.advanceTimersByTime(599);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(105);
  });

  it("does not commit after cancellation", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const deferred = createDeferredSeekCommitter(600);

    deferred.schedule(120, commit);
    deferred.cancel();
    vi.runAllTimers();

    expect(commit).not.toHaveBeenCalled();
  });
});
