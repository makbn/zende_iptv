const {
  appendFileSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} = process.getBuiltinModule("fs");
const { dirname } = process.getBuiltinModule("path");

export type RotatingFileDestinationOptions = {
  filePath: string;
  maxBytes: number;
  maxFiles: number;
};

/**
 * Small synchronous destination intended only for error/fatal events.
 *
 * Synchronous writes make the last error much less likely to be lost during a
 * crash. Rotation keeps a noisy failure loop from filling the host disk.
 */
export class RotatingFileDestination {
  private currentBytes: number;
  private lastReportedError = "";

  constructor(private readonly options: RotatingFileDestinationOptions) {
    mkdirSync(dirname(options.filePath), { recursive: true });
    appendFileSync(options.filePath, "");
    this.currentBytes = this.readCurrentSize();
  }

  write(chunk: string | Uint8Array): void {
    const bytes = Buffer.byteLength(chunk);

    try {
      if (
        this.currentBytes > 0 &&
        this.currentBytes + bytes > this.options.maxBytes
      ) {
        this.rotate();
      }

      appendFileSync(this.options.filePath, chunk);
      this.currentBytes += bytes;
      this.lastReportedError = "";
    } catch (error) {
      // Logging must never take down the application. Keep trying on later
      // writes, but avoid flooding stderr with the same destination failure.
      const message = error instanceof Error ? error.message : String(error);
      if (message !== this.lastReportedError) {
        this.lastReportedError = message;
        process.stderr.write(
          `Unable to write dedicated error log ${this.options.filePath}: ${message}\n`,
        );
      }
    }
  }

  private readCurrentSize(): number {
    try {
      return statSync(this.options.filePath).size;
    } catch (error) {
      if (isMissingFileError(error)) return 0;
      throw error;
    }
  }

  private rotate(): void {
    const historyFiles = this.options.maxFiles - 1;

    if (historyFiles === 0) {
      unlinkIfPresent(this.options.filePath);
      this.currentBytes = 0;
      return;
    }

    unlinkIfPresent(`${this.options.filePath}.${historyFiles}`);
    for (let index = historyFiles - 1; index >= 1; index -= 1) {
      renameIfPresent(
        `${this.options.filePath}.${index}`,
        `${this.options.filePath}.${index + 1}`,
      );
    }
    renameIfPresent(this.options.filePath, `${this.options.filePath}.1`);
    this.currentBytes = 0;
  }
}

function renameIfPresent(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
}

function unlinkIfPresent(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
