import "server-only";

export class RingBuffer {
  private buffer: Uint8Array;
  private capacity: number;
  private writePos = 0;
  private isFull = false;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Uint8Array(capacity);
  }

  /** Append data to the ring buffer, overwriting the oldest data if necessary. */
  write(chunk: Uint8Array): void {
    if (chunk.length >= this.capacity) {
      // If the chunk is larger than the buffer, just keep the tail end of it
      const tail = chunk.subarray(chunk.length - this.capacity);
      this.buffer.set(tail, 0);
      this.writePos = 0;
      this.isFull = true;
      return;
    }

    const spaceUntilEnd = this.capacity - this.writePos;
    if (chunk.length <= spaceUntilEnd) {
      this.buffer.set(chunk, this.writePos);
      this.writePos += chunk.length;
      if (this.writePos === this.capacity) {
        this.writePos = 0;
        this.isFull = true;
      }
    } else {
      // Wraps around the end
      this.buffer.set(chunk.subarray(0, spaceUntilEnd), this.writePos);
      const remaining = chunk.length - spaceUntilEnd;
      this.buffer.set(chunk.subarray(spaceUntilEnd), 0);
      this.writePos = remaining;
      this.isFull = true;
    }
  }

  /** Return a single contiguous Uint8Array of the current buffer contents in chronological order. */
  snapshot(): Uint8Array {
    if (!this.isFull) {
      return this.buffer.slice(0, this.writePos);
    }
    const result = new Uint8Array(this.capacity);
    result.set(this.buffer.subarray(this.writePos), 0);
    result.set(this.buffer.subarray(0, this.writePos), this.capacity - this.writePos);
    return result;
  }
}
