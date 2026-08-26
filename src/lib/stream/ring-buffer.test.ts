import { describe, expect, it } from "vitest";
import { RingBuffer } from "@/lib/stream/ring-buffer";

describe("RingBuffer", () => {
  it("stores and retrieves data before filling up", () => {
    const rb = new RingBuffer(10);
    rb.write(new Uint8Array([1, 2, 3]));
    rb.write(new Uint8Array([4, 5]));
    
    expect(Array.from(rb.snapshot())).toEqual([1, 2, 3, 4, 5]);
  });

  it("wraps around and overwrites oldest data when full", () => {
    const rb = new RingBuffer(5);
    rb.write(new Uint8Array([1, 2, 3]));
    rb.write(new Uint8Array([4, 5, 6])); // should overwrite 1, 2, 3... wait, 1, 2, 3, 4, 5... 6 overwrites 1.
    // capacity 5:
    // w: [1,2,3], pos=3
    // w: [4,5,6]:
    //   space=2, writes [4,5], pos=0, isFull=true
    //   remaining=[6], writes [6] at 0, pos=1
    // Buffer should be [6, 2, 3, 4, 5]
    // Chronological snapshot from pos 1: [2, 3, 4, 5, 6]
    
    expect(Array.from(rb.snapshot())).toEqual([2, 3, 4, 5, 6]);
  });

  it("handles chunks exactly equal to capacity", () => {
    const rb = new RingBuffer(4);
    rb.write(new Uint8Array([1, 2, 3, 4]));
    expect(Array.from(rb.snapshot())).toEqual([1, 2, 3, 4]);
    rb.write(new Uint8Array([5, 6, 7, 8]));
    expect(Array.from(rb.snapshot())).toEqual([5, 6, 7, 8]);
  });

  it("handles chunks larger than capacity by only keeping the tail", () => {
    const rb = new RingBuffer(3);
    rb.write(new Uint8Array([1, 2, 3, 4, 5]));
    expect(Array.from(rb.snapshot())).toEqual([3, 4, 5]);
  });
});
